# Database Backup & Restore Feature

## Overview

This feature provides automated database backup and restore functionality with Amazon S3 storage integration.

## Prerequisites

### 1. Install AWS SDK for JavaScript v3

```bash
npm install @aws-sdk/client-s3
```

### 2. PostgreSQL Client Tools

The server must have PostgreSQL client tools installed:

**Ubuntu/Debian:**

```bash
sudo apt-get update
sudo apt-get install postgresql-client
```

**Windows:**
Download and install PostgreSQL from: https://www.postgresql.org/download/windows/

**Mac:**

```bash
brew install postgresql
```

### 3. AWS Configuration

- AWS credentials must be configured (via `env.staging` or `env.production` files)
- S3 bucket `pharmatracker-db-dump` must exist in `ap-south-1` (Mumbai) region
- AWS credentials must have permissions for:
  - `s3:ListBucket`
  - `s3:GetObject`
  - `s3:PutObject`
  - `s3:DeleteObject`
  - `s3:HeadBucket`

### 4. Create S3 Bucket

```bash
# Using AWS CLI
aws s3 mb s3://pharmatracker-db-dump --region ap-south-1
```

Or create via AWS Console:

1. Go to S3 console
2. Create bucket named `pharmatracker-db-dump`
3. Select region `ap-south-1` (Mumbai)

## Configuration

### Global Constants

The following constants are configured in `src/GlobalConstants.ts`:

```typescript
static readonly MAX_BACKUP_FILES = 30;
static readonly BACKUP_BUCKET_NAME = "pharmatracker-db-dump";
static readonly AWS_REGION = "ap-south-1"; // Mumbai
static readonly RESTORE_PASSKEY = "RESTORE_DB_PASSKEY_2025"; // Change this!
static readonly BACKUP_RECENT_CHECK_MINUTES = 5;
```

**⚠️ IMPORTANT:** Change `RESTORE_PASSKEY` to a secure value before deploying to production!

## API Endpoints

### 1. Create Backup

**Endpoint:** `POST /api/setting/backup`

**Authorization:** Requires `WEB_ACCESS` role

**Description:** Creates a compressed database backup and uploads to S3. Automatically manages the backup retention (max 30 files).

**Request:**

```bash
curl -X POST http://localhost:3000/api/setting/backup \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**

```json
{
  "success": true,
  "message": "Database backup created successfully: pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump",
  "filename": "pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump"
}
```

**Filename Format:**

```
pharmatracker-{environment}-on-{YYYY}-{MM}-{DD}-at-{HH}-{MM}-{SS}-{AM/PM}-IST.dump
```

**Features:**

- Compressed format (pg_dump custom format)
- Automatic timestamp in IST timezone
- Automatic cleanup (keeps only 30 most recent backups)
- 5-minute timeout
- Validates S3 bucket exists before backup

### 2. List Backups

**Endpoint:** `GET /api/setting/backups`

**Authorization:** Requires `WEB_ACCESS` role

**Description:** Lists all available backup files in S3, sorted by recency (most recent first).

**Request:**

```bash
curl -X GET http://localhost:3000/api/setting/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**

```json
{
  "success": true,
  "backups": [
    {
      "filename": "pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump",
      "lastModified": "2025-01-15T09:00:23.000Z",
      "size": 12345678
    },
    {
      "filename": "pharmatracker-staging-on-2025-01-15-at-01-15-10-PM-IST.dump",
      "lastModified": "2025-01-15T07:45:10.000Z",
      "size": 11234567
    }
  ],
  "count": 2
}
```

**Note:** Lists backups from ALL environments (production, staging, etc.)

### 3. Restore Database

**Endpoint:** `POST /api/setting/restore`

**Authorization:** Requires `WEB_ACCESS` role + Restore Passkey

**Description:** Restores database from a backup file. Requires a recent backup (within 5 minutes) from the current environment as a safety precaution.

**Request:**

```bash
curl -X POST http://localhost:3000/api/setting/restore \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump",
    "passkey": "RESTORE_DB_PASSKEY_2025"
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "Database restored successfully from backup: pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump"
}
```

**Safety Features:**

1. **Passkey Validation:** Must provide correct restore passkey
2. **Recent Backup Check:** Must have a backup from current environment within last 5 minutes
3. **Environment Restriction:** Can only restore to the current environment's database
4. **Complete Restoration:** Drops and recreates database before restore
5. **5-minute timeout:** Prevents long-hanging operations

## Safety Mechanisms

### 1. Recent Backup Requirement

Before restoring, you MUST create a backup from the current environment:

```bash
# Step 1: Create a safety backup (required)
POST /api/setting/backup

# Step 2: Wait for backup to complete

# Step 3: Now you can restore (within 5 minutes of backup)
POST /api/setting/restore
```

**Error if no recent backup:**

```json
{
  "success": false,
  "message": "Safety check failed: No recent backup found from 'production' environment within last 5 minutes. Please create a backup first (POST /api/setting/backup) and then retry restore."
}
```

### 2. Environment Isolation

- Running in **staging** environment? → Can only restore to staging database
- Running in **production** environment? → Can only restore to production database
- Can restore FROM any environment's backup TO current environment

**Example Scenarios:**

✅ **Valid:** In staging → Restore from production backup → Restores to staging DB
✅ **Valid:** In production → Restore from production backup → Restores to production DB
✅ **Valid:** In staging → Restore from staging backup → Restores to staging DB
❌ **Invalid:** Cannot directly restore to a different environment's database

### 3. Passkey Protection

The restore operation requires a passkey to prevent accidental database wipes.

**Change the default passkey in `GlobalConstants.ts`:**

```typescript
static readonly RESTORE_PASSKEY = "YOUR_SECURE_PASSKEY_HERE";
```

### 4. Automatic Backup Retention

- Maximum 30 backup files maintained
- When 31st backup is created, oldest is automatically deleted
- Deletion only happens AFTER successful backup upload

## Workflow Examples

### Example 1: Regular Backup

```bash
# Create backup (automated, no parameters needed)
curl -X POST http://localhost:3000/api/setting/backup \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response includes filename for future reference
```

### Example 2: Restore from Backup

```bash
# Step 1: List available backups
curl -X GET http://localhost:3000/api/setting/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Step 2: Create safety backup from current environment
curl -X POST http://localhost:3000/api/setting/backup \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Step 3: Restore from desired backup (within 5 minutes)
curl -X POST http://localhost:3000/api/setting/restore \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump",
    "passkey": "RESTORE_DB_PASSKEY_2025"
  }'
```

### Example 3: Cross-Environment Restore

Scenario: Restore production data to staging for testing

```bash
# 1. Create safety backup of staging (required)
curl -X POST http://localhost:3000/api/setting/backup \
  -H "Authorization: Bearer STAGING_JWT_TOKEN"

# 2. List backups to find production backup
curl -X GET http://localhost:3000/api/setting/backups \
  -H "Authorization: Bearer STAGING_JWT_TOKEN"

# 3. Restore production backup to staging DB
curl -X POST http://localhost:3000/api/setting/restore \
  -H "Authorization: Bearer STAGING_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump",
    "passkey": "RESTORE_DB_PASSKEY_2025"
  }'
```

## Error Scenarios

### Bucket Not Found

```json
{
  "success": false,
  "message": "S3 bucket 'pharmatracker-db-dump' does not exist or is not accessible"
}
```

**Solution:** Create the S3 bucket or check AWS credentials/permissions

### PostgreSQL Tools Not Found

```json
{
  "success": false,
  "message": "pg_dump command not found. Ensure PostgreSQL client tools are installed on the server."
}
```

**Solution:** Install PostgreSQL client tools on the server

### No Recent Backup

```json
{
  "success": false,
  "message": "Safety check failed: No recent backup found from 'production' environment within last 5 minutes..."
}
```

**Solution:** Create a backup first, then retry restore within 5 minutes

### Invalid Passkey

```json
{
  "success": false,
  "message": "Invalid restore passkey"
}
```

**Solution:** Use the correct passkey from `GlobalConstants.RESTORE_PASSKEY`

### Backup File Not Found

```json
{
  "success": false,
  "message": "Backup file not found: pharmatracker-staging-on-2025-01-15-at-01-15-10-PM-IST.dump"
}
```

**Solution:** Verify filename from `GET /api/setting/backups`

## Best Practices

1. **Regular Backups:** Schedule automatic backups before critical operations
2. **Verify Backups:** Periodically test restore process in staging
3. **Secure Passkey:** Use a strong, unique passkey and store securely
4. **Monitor Storage:** Keep eye on S3 storage costs (30 files × backup size)
5. **Timing:** Complete restore operations during low-traffic periods
6. **Documentation:** Keep record of which backups correspond to which application versions

## Troubleshooting

### Backup takes too long

- Check database size
- Increase timeout if needed (currently 5 minutes)
- Consider upgrading database instance for faster dumps

### Restore fails midway

- Check PostgreSQL logs: `journalctl -u postgresql`
- Verify database credentials in environment file
- Ensure sufficient disk space

### AWS credentials not working

- Verify `AWS_ACCESS_KEY` and `AWS_SECRET_KEY` in environment files
- Check IAM permissions for S3 operations
- Verify AWS CLI configuration: `aws s3 ls s3://pharmatracker-db-dump --region ap-south-1`

## Security Considerations

1. **Encrypt at Rest:** Enable S3 bucket encryption
2. **Access Logging:** Enable S3 access logging for audit trail
3. **Least Privilege:** Grant minimum required permissions to AWS credentials
4. **Passkey Rotation:** Periodically change the restore passkey
5. **VPC Endpoints:** Consider using VPC endpoints for S3 to avoid public internet

## Total API Count

After adding these APIs, the total count is:

- **Previous total:** 38 APIs
- **New APIs:** 3
  - POST /api/setting/backup
  - GET /api/setting/backups
  - POST /api/setting/restore
- **New total:** **41 APIs**
