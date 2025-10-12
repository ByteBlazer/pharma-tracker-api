# Scheduled Automatic Database Backups

## Overview

The application now automatically creates database backups every day at **2:00 AM IST** without any manual intervention.

## Features

### 1. Daily Automatic Backups

- **Schedule:** Every day at 2:00 AM IST (India Standard Time)
- **Type:** Auto
- **Filename Format:** `pharmatracker-{env}-Auto-on-YYYY-MM-DD-at-HH-MM-SS-AM-IST.dump`
- **Location:** S3 bucket `pharmatracker-db-dump`

### 2. Manual Backups (API-triggered)

- **Trigger:** User calls `POST /api/setting/backup`
- **Type:** Manual
- **Filename Format:** `pharmatracker-{env}-Manual-on-YYYY-MM-DD-at-HH-MM-SS-AM-IST.dump`
- **Location:** S3 bucket `pharmatracker-db-dump`

## Filename Examples

### Auto Backup (Scheduled at 2 AM)

```
pharmatracker-production-Auto-on-2025-01-15-at-02-00-05-AM-IST.dump
pharmatracker-staging-Auto-on-2025-01-15-at-02-00-08-AM-IST.dump
```

### Manual Backup (API-triggered)

```
pharmatracker-production-Manual-on-2025-01-15-at-03-45-30-PM-IST.dump
pharmatracker-staging-Manual-on-2025-01-15-at-11-22-17-AM-IST.dump
```

## Filename Format Breakdown

```
pharmatracker-production-Manual-on-2025-01-15-at-02-30-23-PM-IST.dump
└─────┬─────┘ └───┬───┘ └──┬──┘    └────┬────┘    └─────┬─────┘ └┬┘ └─┬┘
  App Name     Env    Type       Date           Time      AM/PM IST
```

**Components:**

- `pharmatracker` - Application name
- `production` / `staging` - Environment
- **`Auto` / `Manual`** - Backup type (new!)
- `2025-01-15` - Date in YYYY-MM-DD format
- `02-30-23` - Time in HH-MM-SS format
- `PM` / `AM` - Time period
- `IST` - Timezone indicator
- `.dump` - File extension (PostgreSQL custom format)

## How It Works

### Scheduled Task

The backup service uses NestJS `@Cron` decorator:

```typescript
@Cron("0 2 * * *", {
  timeZone: "Asia/Kolkata", // IST timezone
})
async handleScheduledBackup() {
  // Runs every day at 2:00 AM IST
  await this.createBackup("Auto");
}
```

**Cron Expression:** `0 2 * * *`

- `0` - Minute: 0 (at the top of the hour)
- `2` - Hour: 2 (2 AM)
- `*` - Day of month: Every day
- `*` - Month: Every month
- `*` - Day of week: Every day

### Backup Retention

Both Auto and Manual backups count towards the maximum limit:

- **Maximum backups:** 30 files total (Auto + Manual combined)
- **Cleanup:** When 31st backup is created, oldest file is deleted
- **Storage:** All backups stored in same S3 bucket

## Logging

### Scheduled Backup Logs

**Success:**

```
🕐 Scheduled backup starting at 2 AM IST...
📦 Creating database backup: pharmatracker-production-Auto-on-2025-01-15-at-02-00-05-AM-IST.dump
✅ Backup file created locally: /tmp/pharmatracker-production-Auto-on-2025-01-15-at-02-00-05-AM-IST.dump
☁️  Backup uploaded to S3: pharmatracker-production-Auto-on-2025-01-15-at-02-00-05-AM-IST.dump
✅ Scheduled backup completed: pharmatracker-production-Auto-on-2025-01-15-at-02-00-05-AM-IST.dump
```

**Failure:**

```
🕐 Scheduled backup starting at 2 AM IST...
❌ Backup creation failed: [error details]
❌ Scheduled backup failed: [error message]
```

**Note:** Scheduled backup failures are logged but don't crash the application.

### Manual Backup Logs

Same as before, but filename includes "Manual":

```
📦 Creating database backup: pharmatracker-staging-Manual-on-2025-01-15-at-03-45-30-PM-IST.dump
✅ Backup file created locally: ...
☁️  Backup uploaded to S3: ...
```

## Monitoring

### Check Scheduled Backups

**List all Auto backups:**

```bash
curl -X GET http://localhost:3000/api/setting/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Filter response for filenames containing "Auto":

```javascript
const autoBackups = response.backups.filter((b) =>
  b.filename.includes("-Auto-")
);
```

### Check if Daily Backup Ran

**Via API:**
Check the backup list for today's Auto backup:

```javascript
const today = new Date().toISOString().split("T")[0]; // "2025-01-15"
const todaysAutoBackup = response.backups.find(
  (b) => b.filename.includes("-Auto-") && b.filename.includes(today)
);
```

**Via Server Logs:**

```bash
ssh ubuntu@your-ec2-endpoint
sudo journalctl -u pharma-tracker-staging -n 100 | grep "Scheduled backup"
```

## Configuration

### Change Backup Time

To change the backup time, edit `src/services/backup.service.ts`:

```typescript
@Cron("0 2 * * *", {  // Change "2" to desired hour (0-23)
  timeZone: "Asia/Kolkata",
})
```

**Examples:**

- `0 2 * * *` - 2:00 AM daily
- `0 3 * * *` - 3:00 AM daily
- `30 1 * * *` - 1:30 AM daily
- `0 2 * * 0` - 2:00 AM every Sunday only

### Disable Scheduled Backups

To temporarily disable, comment out the `@Cron` decorator:

```typescript
// @Cron("0 2 * * *", {
//   timeZone: "Asia/Kolkata",
// })
async handleScheduledBackup() { ... }
```

Or remove the entire method if not needed.

## Benefits

✅ **Automatic daily backups** - No manual intervention needed
✅ **Consistent timing** - Always at 2 AM IST when usage is low
✅ **Disaster recovery** - Always have recent backups available
✅ **Easy identification** - "Auto" vs "Manual" in filename
✅ **Same retention** - All backups count towards 30 max limit
✅ **Transparent** - Listed alongside manual backups in API

## Important Notes

### 1. Both Environments Get Auto Backups

- **Staging:** Auto backup at 2:00 AM IST daily
- **Production:** Auto backup at 2:00 AM IST daily

Each environment runs its own scheduler independently.

### 2. Application Must Be Running

The scheduled backup only works when the NestJS application is running:

- ✅ App running → Backup happens at 2 AM
- ❌ App stopped → No backup

Ensure your systemd service is configured to:

- Auto-start on server boot
- Auto-restart on crashes

### 3. Backup Count Management

With daily auto backups:

- Auto backups accumulate: 1 per day
- Manual backups: As needed by users
- Total limit: 30 files (combined)
- **Example:** After 30 days, you'll have 30 auto backups (if no manual backups)

### 4. No Duplicate Safety Check

The scheduled backup does NOT check for recent backups (unlike restore operation). It will create a backup every day at 2 AM regardless of when the last backup was created.

### 5. Timezone

The scheduler uses **IST (Asia/Kolkata)** timezone, so 2 AM IST is:

- UTC: 8:30 PM (previous day)
- EST: 3:30 PM (previous day)
- PST: 12:30 PM (previous day)

## Testing

### Test Scheduled Backup Locally

You can manually trigger the scheduled method for testing:

**Option 1: Change cron time temporarily**

```typescript
@Cron("*/2 * * * *", {  // Every 2 minutes for testing
  timeZone: "Asia/Kolkata",
})
```

**Option 2: Create a test endpoint (development only)**

```typescript
// In BackupService
async testScheduledBackup() {
  return await this.handleScheduledBackup();
}

// In SettingController
@Post("test-scheduled-backup")
@RequireRoles(UserRole.WEB_ACCESS)
async testScheduledBackup() {
  return await this.backupService.testScheduledBackup();
}
```

### Verify Scheduler is Active

Check application logs on startup:

```bash
# Should see scheduler initialization message
sudo journalctl -u pharma-tracker-staging -n 50 | grep -i schedule
```

## Troubleshooting

### Scheduled Backup Not Running

**Check 1: Application is running**

```bash
sudo systemctl status pharma-tracker-staging
```

**Check 2: Check logs around 2 AM**

```bash
# View logs from 1:55 AM to 2:10 AM
sudo journalctl -u pharma-tracker-staging --since "02:55" --until "02:10"
```

**Check 3: Verify scheduler module loaded**
Check application startup logs for scheduler initialization.

### Scheduled Backup Failing

Check logs for error details:

```bash
sudo journalctl -u pharma-tracker-staging | grep "Scheduled backup failed"
```

Common issues:

- AWS credentials not configured
- S3 bucket doesn't exist
- PostgreSQL tools not found
- Database connection issues

## API Response Changes

### List Backups Response

Now includes both Auto and Manual backups:

```json
{
  "success": true,
  "backups": [
    {
      "filename": "pharmatracker-production-Auto-on-2025-01-15-at-02-00-05-AM-IST.dump",
      "lastModified": "2025-01-15T02:00:10.000Z",
      "size": 12345678
    },
    {
      "filename": "pharmatracker-production-Manual-on-2025-01-14-at-03-30-15-PM-IST.dump",
      "lastModified": "2025-01-14T15:30:20.000Z",
      "size": 12300000
    },
    {
      "filename": "pharmatracker-staging-Auto-on-2025-01-14-at-02-00-07-AM-IST.dump",
      "lastModified": "2025-01-14T02:00:12.000Z",
      "size": 11234567
    }
  ],
  "count": 3
}
```

### UI Parsing

Update your UI to parse and display backup type:

```javascript
// filename: "pharmatracker-production-Manual-on-2025-01-15-at-03-45-30-PM-IST.dump"
const parts = filename.split("-on-");
const envAndType = parts[0]; // "pharmatracker-production-Manual"
const typePart = envAndType.split("-").pop(); // "Manual" or "Auto"

// Display with badge
<Badge color={typePart === "Auto" ? "green" : "blue"}>{typePart}</Badge>;
```

## Summary

✅ **Installed:** `@nestjs/schedule` package
✅ **Updated:** `BackupService` with scheduled task
✅ **Updated:** `AppModule` to enable scheduling
✅ **Updated:** Filename format to include Auto/Manual
✅ **Updated:** Controller to pass "Manual" type
✅ **Schedule:** Daily at 2:00 AM IST
✅ **Logging:** Console logs for success and failures
✅ **Resilient:** Errors don't crash the application

## Next Steps

1. **Deploy to staging and production**
2. **Verify first scheduled backup** (check at 2:05 AM IST the next day)
3. **Monitor S3 bucket** for daily Auto backups
4. **Update UI** to show Auto vs Manual badge/label

Your database now has automatic daily backups running at 2 AM IST! 🎉
