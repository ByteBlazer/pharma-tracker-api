# Database Backup & Restore Implementation Summary

## ✅ What Was Implemented

### 1. **Backup Service** (`src/services/backup.service.ts`)

A comprehensive service that handles:

- Database backup creation using `pg_dump` with compressed format
- Upload to Amazon S3 (`pharmatracker-db-dump` bucket)
- Automatic cleanup (maintains max 30 backups)
- List all available backups sorted by recency
- Database restore from backup file
- Safety checks before restore

### 2. **Three New APIs** (in `src/controllers/setting.controller.ts`)

#### API 1: Create Backup

- **Endpoint:** `POST /api/setting/backup`
- **Auth:** WEB_ACCESS role required
- **Function:** Creates compressed DB dump and uploads to S3
- **Filename Format:** `pharmatracker-{env}-on-YYYY-MM-DD-at-HH-MM-SS-AM/PM-IST.dump`
- **Features:**
  - Automatic timestamp in IST timezone
  - Compressed format (pg_dump custom format `-Fc`)
  - Auto-cleanup (keeps only 30 most recent files)
  - 5-minute timeout
  - Validates S3 bucket exists

#### API 2: List Backups

- **Endpoint:** `GET /api/setting/backups`
- **Auth:** WEB_ACCESS role required
- **Function:** Lists all backup files from S3
- **Returns:** Array of backup files with filename, lastModified, size
- **Sorted:** By recency (most recent first)
- **Shows:** Backups from ALL environments

#### API 3: Restore Database

- **Endpoint:** `POST /api/setting/restore`
- **Auth:** WEB_ACCESS role + restore passkey required
- **Function:** Restores database from a backup file
- **Safety Features:**
  - Requires recent backup from current environment (within 5 minutes)
  - Validates passkey before proceeding
  - Only restores to current environment's database
  - Drops and recreates database before restore
  - 5-minute timeout

### 3. **Global Constants** (`src/GlobalConstants.ts`)

Added configuration constants:

```typescript
static readonly MAX_BACKUP_FILES = 30;
static readonly BACKUP_BUCKET_NAME = "pharmatracker-db-dump";
static readonly AWS_REGION = "ap-south-1"; // Mumbai
static readonly RESTORE_PASSKEY = "RESTORE_DB_PASSKEY_2025"; // Change this!
static readonly BACKUP_RECENT_CHECK_MINUTES = 5;
```

### 4. **Module Registration** (`src/app.module.ts`)

- Imported `BackupService`
- Added to providers array
- Service now available for dependency injection

### 5. **Documentation**

Created comprehensive documentation:

- **BACKUP_RESTORE_README.md** - Full feature documentation
- **INSTALLATION_STEPS.md** - Quick setup guide
- **IMPLEMENTATION_SUMMARY.md** - This file

## 📋 Implementation Details

### Filename Format

```
pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump
└─────┬─────┘ └───┬───┘    └────┬────┘    └─────┬─────┘ └┬┘ └─┬┘
  App Name     Environment    Date           Time      AM/PM IST
```

### Safety Mechanisms

1. **Recent Backup Check**

   - Before restore, verifies a backup from current environment exists (within 5 min)
   - Prevents accidental data loss

2. **Passkey Protection**

   - Restore requires correct passkey from `GlobalConstants`
   - Prevents unauthorized database modifications

3. **Environment Isolation**

   - Can only restore TO current environment's database
   - Can restore FROM any environment's backup

4. **Bucket Validation**

   - Checks if S3 bucket exists before operations
   - Returns helpful error if bucket missing

5. **Automatic Retention**
   - Keeps only 30 most recent backups
   - Automatically deletes oldest when 31st is added

### Technical Implementation

**Backup Process:**

1. Validate S3 bucket exists
2. Generate filename with IST timestamp
3. Run `pg_dump -Fc` to create compressed backup
4. Upload to S3
5. Clean up local temp file
6. Manage backup retention (keep 30 max)

**Restore Process:**

1. Validate passkey
2. Check if backup file exists in S3
3. Verify recent backup from current environment
4. Download backup from S3
5. Drop existing database
6. Create fresh database
7. Restore using `pg_restore`
8. Clean up local temp file

## 📊 API Count Update

**Previous Total:** 38 APIs

**New APIs Added:** 3

- POST /api/setting/backup
- GET /api/setting/backups
- POST /api/setting/restore

**New Total:** **41 APIs**

## ⚙️ Configuration Requirements

### AWS Configuration

```typescript
// Required in env.staging and env.production
AWS_ACCESS_KEY = your_access_key_here;
AWS_SECRET_KEY = your_secret_key_here;
```

### Database Configuration

Uses existing environment variables:

```typescript
DB_HOST = localhost;
DB_PORT = 5432;
DB_USERNAME = postgres;
DB_PASSWORD = your_password;
DB_DATABASE = staging; // or production
```

### Server Requirements

- Node.js with NestJS
- PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`)
- AWS credentials with S3 permissions
- S3 bucket `pharmatracker-db-dump` in `ap-south-1`

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] Install `@aws-sdk/client-s3` package
- [ ] Create S3 bucket `pharmatracker-db-dump` in Mumbai region
- [ ] Update `RESTORE_PASSKEY` in GlobalConstants to secure value
- [ ] Verify AWS credentials are configured
- [ ] Ensure PostgreSQL client tools are installed on server
- [ ] Test backup creation in staging
- [ ] Test backup listing in staging
- [ ] Test restore process in staging
- [ ] Update GitHub secrets with AWS credentials
- [ ] Document restore passkey securely for team

## 📝 Usage Examples

### Create Backup

```bash
curl -X POST https://your-domain/api/setting/backup \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### List Backups

```bash
curl -X GET https://your-domain/api/setting/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Restore Database

```bash
# Step 1: Create safety backup first!
curl -X POST https://your-domain/api/setting/backup \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Step 2: Restore (within 5 minutes)
curl -X POST https://your-domain/api/setting/restore \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump",
    "passkey": "YOUR_SECURE_PASSKEY"
  }'
```

## 🔒 Security Features

1. **Role-Based Access Control** - WEB_ACCESS role required
2. **Passkey Protection** - Additional passkey for destructive restore operation
3. **Recent Backup Enforcement** - Must have recent backup before restore
4. **Environment Isolation** - Can only modify current environment's database
5. **AWS IAM** - Leverages AWS IAM for S3 access control
6. **Audit Trail** - All operations logged to console

## 🎯 Best Practices

1. **Regular Backups** - Schedule backups before critical operations
2. **Test Restores** - Periodically test restore in staging
3. **Secure Passkey** - Use strong passkey and rotate periodically
4. **Monitor Storage** - Watch S3 costs (30 backups × size)
5. **Off-Peak Operations** - Run restores during low-traffic periods
6. **Version Tracking** - Document which backups match which app versions

## ⚠️ Important Notes

1. **Restore is Destructive** - Drops and recreates entire database
2. **Timeout is 5 Minutes** - For very large databases, may need adjustment
3. **Environment Awareness** - Always know which environment you're operating in
4. **Passkey Security** - Keep passkey secure and share only with authorized personnel
5. **AWS Costs** - Monitor S3 storage costs for 30 backup files

## 🛠️ Files Created/Modified

### New Files

- `src/services/backup.service.ts` (335 lines)
- `BACKUP_RESTORE_README.md` (comprehensive docs)
- `INSTALLATION_STEPS.md` (setup guide)
- `IMPLEMENTATION_SUMMARY.md` (this file)

### Modified Files

- `src/GlobalConstants.ts` - Added 5 backup-related constants
- `src/controllers/setting.controller.ts` - Added 3 new endpoints (97 lines added)
- `src/app.module.ts` - Registered BackupService

## ✨ Next Steps

1. **Install Dependencies**

   ```bash
   npm install @aws-sdk/client-s3
   ```

2. **Create S3 Bucket**

   ```bash
   aws s3 mb s3://pharmatracker-db-dump --region ap-south-1
   ```

3. **Update Passkey**

   - Edit `src/GlobalConstants.ts`
   - Change `RESTORE_PASSKEY` to a secure value

4. **Test in Staging**

   - Create backup
   - List backups
   - Test restore (safely)

5. **Deploy to Production**
   - Ensure all prerequisites met
   - Add AWS secrets to GitHub
   - Deploy via CI/CD

## 📞 Support

For detailed information:

- See `BACKUP_RESTORE_README.md` for full feature documentation
- See `INSTALLATION_STEPS.md` for setup instructions
- Check troubleshooting sections in documentation

---

**Implementation Date:** January 2025  
**Status:** ✅ Complete - Ready for testing  
**Dependencies:** AWS SDK, PostgreSQL client tools, S3 bucket
