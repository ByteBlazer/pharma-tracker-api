import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Load AWS credentials from local AWS CLI credentials file
 * This reads credentials from ~/.aws/credentials (or Windows equivalent)
 * and sets them as environment variables for local development
 */
function loadAWSCredentials() {
  // Only load from file if placeholders are present (local development)
  if (
    process.env.AWS_ACCESS_KEY !== "AWS_ACCESS_KEY_PLACEHOLDER" &&
    process.env.AWS_SECRET_KEY !== "AWS_SECRET_KEY_PLACEHOLDER"
  ) {
    // Credentials already set (probably in production/staging on EC2)
    return;
  }

  try {
    // Determine credentials file path based on OS
    const homeDir = os.homedir();
    const credentialsPath = path.join(homeDir, ".aws", "credentials");

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      console.warn("⚠️  AWS credentials file not found at:", credentialsPath);
      console.warn(
        "⚠️  Using placeholder values. Install AWS CLI and configure credentials to use actual values."
      );
      return;
    }

    // Read and parse credentials file
    const credentialsContent = fs.readFileSync(credentialsPath, "utf8");
    const lines = credentialsContent.split("\n");

    let inDefaultProfile = false;
    let accessKey = null;
    let secretKey = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Check if we're in the [default] profile section
      if (trimmedLine === "[default]") {
        inDefaultProfile = true;
        continue;
      }

      // If we hit another profile, stop looking
      if (trimmedLine.startsWith("[") && trimmedLine !== "[default]") {
        break;
      }

      // Parse credentials within [default] profile
      if (inDefaultProfile) {
        if (trimmedLine.startsWith("aws_access_key_id")) {
          accessKey = trimmedLine.split("=")[1]?.trim();
        } else if (trimmedLine.startsWith("aws_secret_access_key")) {
          secretKey = trimmedLine.split("=")[1]?.trim();
        }
      }

      // Stop if we have both credentials
      if (accessKey && secretKey) {
        break;
      }
    }

    // Set environment variables if credentials were found
    if (accessKey && secretKey) {
      process.env.AWS_ACCESS_KEY = accessKey;
      process.env.AWS_SECRET_KEY = secretKey;
      console.log("✅ AWS credentials loaded from local credentials file");
      console.log(`   Access Key: ${accessKey.substring(0, 8)}...`);
    } else {
      console.warn("⚠️  Could not parse AWS credentials from file");
      console.warn(
        "   Make sure your credentials file has a [default] profile"
      );
    }
  } catch (error) {
    console.error("❌ Error loading AWS credentials:", error.message);
  }
}

async function bootstrap() {
  // Load AWS credentials before app initialization
  loadAWSCredentials();
  const app = await NestFactory.create(AppModule);

  // Set global API prefix
  app.setGlobalPrefix("api");

  // Enable CORS only in local environment

  if (process.platform === "win32") {
    app.enableCors();
    console.log(
      "🌐 CORS enabled as we are on Windows,and hence local development"
    );
  }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Global throttling is configured via APP_GUARD in AppModule
  console.log(
    "🛡️  Global throttling: 500 requests per 1 minute (configured via ThrottlerModule)"
  );

  // Global JWT authentication guard
  const jwtAuthGuard = app.get(JwtAuthGuard);
  app.useGlobalGuards(jwtAuthGuard);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 API Base URL: http://localhost:${port}/api`);
}
bootstrap();
