# Installation Steps for Backup/Restore Feature

## Quick Setup Guide

Follow these steps to enable the database backup and restore functionality:

### Step 1: Install AWS SDK

```bash
npm install @aws-sdk/client-s3
```

### Step 2: Create S3 Bucket

Using AWS CLI:

```bash
aws s3 mb s3://pharmatracker-db-dump --region ap-south-1
```

Or use AWS Console:

1. Go to https://s3.console.aws.amazon.com/
2. Click "Create bucket"
3. Bucket name: `pharmatracker-db-dump`
4. Region: `ap-south-1` (Mumbai)
5. Keep default settings and create

### Step 3: Update Restore Passkey

Edit `src/GlobalConstants.ts` and change the restore passkey to a secure value:

```typescript
static readonly RESTORE_PASSKEY = "YOUR_SECURE_PASSKEY_HERE"; // Change this!
```

### Step 4: Verify PostgreSQL Client Tools

**Check if pg_dump and pg_restore are installed:**

```bash
# Linux/Mac
which pg_dump
which pg_restore

# Windows (PowerShell)
Get-Command pg_dump
Get-Command pg_restore
```

**If not installed:**

**Ubuntu/Debian:**

```bash
sudo apt-get update
sudo apt-get install postgresql-client
```

**Mac:**

```bash
brew install postgresql
```

**Windows:**
Download from: https://www.postgresql.org/download/windows/

### Step 5: Build and Run

```bash
# Build the application
npm run build

# Run in development
npm run start:dev

# Or run in staging
npm run start:staging
```

### Step 6: Test the APIs

**1. Create a backup:**

```bash
curl -X POST http://localhost:3000/api/setting/backup \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**2. List backups:**

```bash
curl -X GET http://localhost:3000/api/setting/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**3. Restore (be careful!):**

```bash
curl -X POST http://localhost:3000/api/setting/restore \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "pharmatracker-staging-on-2025-01-15-at-02-30-23-PM-IST.dump",
    "passkey": "YOUR_SECURE_PASSKEY_HERE"
  }'
```

## Verification Checklist

- [ ] AWS SDK installed (`@aws-sdk/client-s3`)
- [ ] S3 bucket `pharmatracker-db-dump` created in `ap-south-1`
- [ ] AWS credentials configured in environment files
- [ ] Restore passkey changed from default
- [ ] PostgreSQL client tools installed (`pg_dump`, `pg_restore`, `psql`)
- [ ] Application builds without errors
- [ ] Backup API works
- [ ] List backups API works
- [ ] Restore API tested (in staging first!)

## Common Issues

### Issue: Module '@aws-sdk/client-s3' not found

**Solution:**

```bash
npm install @aws-sdk/client-s3
```

### Issue: pg_dump: command not found

**Solution:**
Install PostgreSQL client tools (see Step 4)

### Issue: S3 bucket does not exist

**Solution:**
Create the bucket (see Step 2) or check bucket name/region in `GlobalConstants.ts`

### Issue: Invalid restore passkey

**Solution:**
Use the passkey defined in `GlobalConstants.RESTORE_PASSKEY`

## Files Modified

- ✅ `src/GlobalConstants.ts` - Added backup constants
- ✅ `src/services/backup.service.ts` - New backup service (created)
- ✅ `src/controllers/setting.controller.ts` - Added 3 new endpoints
- ✅ `src/app.module.ts` - Registered BackupService
- ✅ `BACKUP_RESTORE_README.md` - Comprehensive documentation (created)

## Next Steps

1. Test backup functionality in staging environment
2. Set up scheduled backups (optional - using cron or AWS Lambda)
3. Configure S3 lifecycle policies for long-term archival (optional)
4. Set up CloudWatch alerts for backup failures (optional)
5. Document backup/restore procedures for your team

## Support

For detailed documentation, see `BACKUP_RESTORE_README.md`

For questions or issues, check the troubleshooting section in the main README.
