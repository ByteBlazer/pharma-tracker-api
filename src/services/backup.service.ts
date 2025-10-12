import { Injectable, BadRequestException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { GlobalConstants } from "src/GlobalConstants";

const execPromise = promisify(exec);

@Injectable()
export class BackupService {
  private s3Client: S3Client;

  constructor() {
    // Initialize S3 client with credentials from environment
    this.s3Client = new S3Client({
      region: GlobalConstants.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY || "",
        secretAccessKey: process.env.AWS_SECRET_KEY || "",
      },
    });
  }

  /**
   * Check if AWS credentials are configured
   */
  private checkAWSConnection(): void {
    if (
      !process.env.AWS_ACCESS_KEY ||
      process.env.AWS_ACCESS_KEY === "AWS_ACCESS_KEY_PLACEHOLDER"
    ) {
      throw new BadRequestException(
        "AWS credentials not configured. Please configure AWS_ACCESS_KEY in environment variables."
      );
    }

    if (
      !process.env.AWS_SECRET_KEY ||
      process.env.AWS_SECRET_KEY === "AWS_SECRET_KEY_PLACEHOLDER"
    ) {
      throw new BadRequestException(
        "AWS credentials not configured. Please configure AWS_SECRET_KEY in environment variables."
      );
    }
  }

  /**
   * Scheduled task - Auto backup at 2 AM IST daily
   */
  @Cron("0 2 * * *", {
    timeZone: "Asia/Kolkata", // IST timezone
  })
  async handleScheduledBackup() {
    try {
      console.log("🕐 Scheduled backup starting at 2 AM IST...");
      const result = await this.createBackup("Auto");
      console.log(`✅ Scheduled backup completed: ${result.filename}`);
    } catch (error) {
      console.error("❌ Scheduled backup failed:", error.message);
    }
  }

  /**
   * Create a database backup and upload to S3
   */
  async createBackup(type: "Auto" | "Manual" = "Manual"): Promise<{
    success: boolean;
    message: string;
    filename: string;
    statusCode: number;
  }> {
    try {
      // Check AWS credentials are configured
      this.checkAWSConnection();

      // Check if S3 bucket exists
      await this.checkBucketExists();

      // Generate filename with IST timestamp
      const filename = this.generateBackupFilename(type);
      const tempDir = os.tmpdir();
      const localFilePath = path.join(tempDir, filename);

      // Get database credentials from environment
      const dbConfig = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
      };

      // Validate database configuration
      if (
        !dbConfig.host ||
        !dbConfig.port ||
        !dbConfig.username ||
        !dbConfig.password ||
        !dbConfig.database
      ) {
        throw new BadRequestException("Database configuration is incomplete");
      }

      console.log(`📦 Creating database backup: ${filename}`);

      // Create backup using pg_dump with custom format (compressed)
      const pgDumpCommand = `PGPASSWORD="${dbConfig.password}" pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.username} -d ${dbConfig.database} -Fc -f "${localFilePath}"`;

      // Execute pg_dump with 5 minute timeout
      await execPromise(pgDumpCommand, { timeout: 5 * 60 * 1000 });

      console.log(`✅ Backup file created locally: ${localFilePath}`);

      // Read the backup file
      const fileContent = fs.readFileSync(localFilePath);

      // Upload to S3
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: GlobalConstants.BACKUP_BUCKET_NAME,
          Key: filename,
          Body: fileContent,
          ContentType: "application/octet-stream",
        })
      );

      console.log(`☁️  Backup uploaded to S3: ${filename}`);

      // Clean up local file
      fs.unlinkSync(localFilePath);

      // Manage backup files (keep only MAX_BACKUP_FILES)
      await this.cleanupOldBackups();

      return {
        success: true,
        message: `Database backup created successfully: ${filename}`,
        filename: filename,
        statusCode: 200,
      };
    } catch (error) {
      console.error("❌ Backup creation failed:", error);

      // Check if error is specifically about command not found
      if (
        error.code === "ENOENT" ||
        error.message?.toLowerCase().includes("command not found")
      ) {
        throw new BadRequestException(
          "pg_dump command not found. Ensure PostgreSQL client tools are installed on the server."
        );
      }

      // Re-throw BadRequestException as-is (like bucket not found, AWS errors)
      if (error instanceof BadRequestException) {
        throw error;
      }

      // For other errors, include the actual error message
      throw new BadRequestException(
        `Backup creation failed: ${error.message || error}`
      );
    }
  }

  /**
   * Get list of all backup files sorted by recency
   */
  async listBackups(): Promise<{
    success: boolean;
    backups: Array<{ filename: string; lastModified: Date; size: number }>;
    count: number;
    statusCode: number;
  }> {
    try {
      // Check AWS credentials are configured
      this.checkAWSConnection();

      // Check if S3 bucket exists
      await this.checkBucketExists();

      // List all objects in the bucket
      const listCommand = new ListObjectsV2Command({
        Bucket: GlobalConstants.BACKUP_BUCKET_NAME,
      });

      const response = await this.s3Client.send(listCommand);

      if (!response.Contents || response.Contents.length === 0) {
        return {
          success: true,
          backups: [],
          count: 0,
          statusCode: 200,
        };
      }

      // Sort by LastModified descending (most recent first)
      const backups = response.Contents.filter(
        (obj) => obj.Key && obj.Key.endsWith(".dump")
      )
        .map((obj) => ({
          filename: obj.Key!,
          lastModified: obj.LastModified!,
          size: obj.Size || 0,
        }))
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

      return {
        success: true,
        backups: backups,
        count: backups.length,
        statusCode: 200,
      };
    } catch (error) {
      console.error("❌ Failed to list backups:", error);
      throw new BadRequestException(`Failed to list backups: ${error.message}`);
    }
  }

  /**
   * Restore database from a backup file
   */
  async restoreBackup(
    filename: string,
    passkey: string
  ): Promise<{
    success: boolean;
    message: string;
    statusCode: number;
  }> {
    try {
      // Check AWS credentials are configured
      this.checkAWSConnection();

      // Validate passkey
      if (passkey !== GlobalConstants.RESTORE_PASSKEY) {
        throw new BadRequestException("Invalid restore passkey");
      }

      // Check if S3 bucket exists
      await this.checkBucketExists();

      // Check if backup file exists in S3
      const backupsList = await this.listBackups();
      const backupExists = backupsList.backups.some(
        (b) => b.filename === filename
      );
      if (!backupExists) {
        throw new BadRequestException(`Backup file not found: ${filename}`);
      }

      // Verify recent backup from current environment was taken
      await this.verifyRecentBackup();

      console.log(`🔄 Starting database restore from: ${filename}`);

      // Download backup file from S3
      const tempDir = os.tmpdir();
      const localFilePath = path.join(tempDir, filename);

      // Download from S3 (using GetObject)
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const getCommand = new GetObjectCommand({
        Bucket: GlobalConstants.BACKUP_BUCKET_NAME,
        Key: filename,
      });

      const s3Response = await this.s3Client.send(getCommand);
      const fileStream = s3Response.Body as NodeJS.ReadableStream;

      // Write to local file
      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(localFilePath);
        fileStream.pipe(writeStream);
        writeStream.on("finish", () => resolve());
        writeStream.on("error", reject);
      });

      console.log(`📥 Backup file downloaded: ${localFilePath}`);

      // Get database credentials
      const dbConfig = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
      };

      // Drop and recreate database
      console.log(`🗑️  Dropping existing database: ${dbConfig.database}`);
      const dropDbCommand = `PGPASSWORD="${dbConfig.password}" psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.username} -d postgres -c "DROP DATABASE IF EXISTS ${dbConfig.database};"`;
      await execPromise(dropDbCommand, { timeout: 2 * 60 * 1000 });

      console.log(`🆕 Creating fresh database: ${dbConfig.database}`);
      const createDbCommand = `PGPASSWORD="${dbConfig.password}" psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.username} -d postgres -c "CREATE DATABASE ${dbConfig.database};"`;
      await execPromise(createDbCommand, { timeout: 2 * 60 * 1000 });

      // Restore from backup using pg_restore
      console.log(`📦 Restoring database from backup...`);
      // Note: No -c flag needed since we already dropped and recreated the database
      const pgRestoreCommand = `PGPASSWORD="${dbConfig.password}" pg_restore -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.username} -d ${dbConfig.database} "${localFilePath}"`;
      await execPromise(pgRestoreCommand, { timeout: 5 * 60 * 1000 });

      console.log(`✅ Database restored successfully from: ${filename}`);

      // Clean up local file
      fs.unlinkSync(localFilePath);

      return {
        success: true,
        message: `Database restored successfully from backup: ${filename}`,
        statusCode: 200,
      };
    } catch (error) {
      console.error("❌ Database restore failed:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        stderr: error.stderr,
        stdout: error.stdout,
      });

      // Check if error is specifically about command not found
      if (
        error.code === "ENOENT" ||
        error.message?.toLowerCase().includes("command not found")
      ) {
        throw new BadRequestException(
          "PostgreSQL client tools not found. Ensure psql and pg_restore are installed on the server."
        );
      }

      // Re-throw BadRequestException as-is (like bucket not found, AWS errors, passkey errors)
      if (error instanceof BadRequestException) {
        throw error;
      }

      // For other errors, include the actual error message with stderr if available
      const errorDetails = error.stderr || error.message || error;
      throw new BadRequestException(`Database restore failed: ${errorDetails}`);
    }
  }

  /**
   * Check if S3 bucket exists
   */
  private async checkBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: GlobalConstants.BACKUP_BUCKET_NAME,
        })
      );
    } catch (error) {
      throw new BadRequestException(
        `S3 bucket '${GlobalConstants.BACKUP_BUCKET_NAME}' does not exist or is not accessible`
      );
    }
  }

  /**
   * Generate backup filename with IST timestamp
   */
  private generateBackupFilename(type: "Auto" | "Manual" = "Manual"): string {
    const env = process.env.NODE_ENV || "development";

    // Get current time in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);

    // Format: pharmatracker-production-Manual-on-2025-01-15-at-02-30-23-PM-IST.dump
    //     or: pharmatracker-production-Auto-on-2025-01-15-at-02-30-23-PM-IST.dump
    const year = istTime.getUTCFullYear();
    const month = String(istTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(istTime.getUTCDate()).padStart(2, "0");

    let hours = istTime.getUTCHours();
    const minutes = String(istTime.getUTCMinutes()).padStart(2, "0");
    const seconds = String(istTime.getUTCSeconds()).padStart(2, "0");

    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12; // Convert to 12-hour format
    const hoursStr = String(hours).padStart(2, "0");

    return `pharmatracker-${env}-${type}-on-${year}-${month}-${day}-at-${hoursStr}-${minutes}-${seconds}-${ampm}-IST.dump`;
  }

  /**
   * Clean up old backups keeping only MAX_BACKUP_FILES
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backupsList = await this.listBackups();

      if (backupsList.count <= GlobalConstants.MAX_BACKUP_FILES) {
        return; // No cleanup needed
      }

      // Delete oldest files (files are already sorted by recency)
      const filesToDelete = backupsList.backups.slice(
        GlobalConstants.MAX_BACKUP_FILES
      );

      console.log(
        `🗑️  Deleting ${filesToDelete.length} old backup(s) to maintain max limit of ${GlobalConstants.MAX_BACKUP_FILES}`
      );

      for (const file of filesToDelete) {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: GlobalConstants.BACKUP_BUCKET_NAME,
            Key: file.filename,
          })
        );
        console.log(`   Deleted: ${file.filename}`);
      }
    } catch (error) {
      console.error("⚠️  Failed to cleanup old backups:", error.message);
      // Don't throw error, just log it
    }
  }

  /**
   * Verify that a recent backup from current environment exists
   */
  private async verifyRecentBackup(): Promise<void> {
    const currentEnv = process.env.NODE_ENV || "development";
    const backupsList = await this.listBackups();

    // Find backups from current environment created in last 5 minutes
    const fiveMinutesAgo = new Date(
      Date.now() - GlobalConstants.BACKUP_RECENT_CHECK_MINUTES * 60 * 1000
    );

    const recentBackupFromCurrentEnv = backupsList.backups.find((backup) => {
      const isFromCurrentEnv = backup.filename.includes(`-${currentEnv}-`);
      const isRecent = backup.lastModified >= fiveMinutesAgo;
      return isFromCurrentEnv && isRecent;
    });

    if (!recentBackupFromCurrentEnv) {
      throw new BadRequestException(
        `Safety check failed: No recent backup found from '${currentEnv}' environment within last ${GlobalConstants.BACKUP_RECENT_CHECK_MINUTES} minutes. ` +
          `Please create a backup first (POST /api/setting/backup) and then retry restore.`
      );
    }

    console.log(
      `✅ Safety check passed: Recent backup found from ${currentEnv} environment`
    );
  }
}
