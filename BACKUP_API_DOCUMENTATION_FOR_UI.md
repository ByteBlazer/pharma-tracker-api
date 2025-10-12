# Backup & Restore API Documentation for UI Team

## Base URL

```
Staging: http://localhost:3000/api
Production: https://your-production-domain/api
```

## Authentication

All endpoints require JWT authentication token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Required Role:** `WEB_ACCESS`

---

## API 1: Create Database Backup

### Endpoint

```
POST /api/setting/backup
```

### Request

**Headers:**

```json
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Body:** None required

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Database backup created successfully: pharmatracker-staging-on-2025-01-15-at-02-30-23-PM-IST.dump",
  "filename": "pharmatracker-staging-on-2025-01-15-at-02-30-23-PM-IST.dump"
}
```

### Error Responses

#### 400 Bad Request - AWS Credentials Not Configured

```json
{
  "success": false,
  "message": "AWS credentials not configured. Please configure AWS_ACCESS_KEY in environment variables."
}
```

```json
{
  "success": false,
  "message": "AWS credentials not configured. Please configure AWS_SECRET_KEY in environment variables."
}
```

#### 400 Bad Request - S3 Bucket Not Found

```json
{
  "success": false,
  "message": "S3 bucket 'pharmatracker-db-dump' does not exist or is not accessible"
}
```

#### 400 Bad Request - PostgreSQL Tools Not Found

```json
{
  "success": false,
  "message": "pg_dump command not found. Ensure PostgreSQL client tools are installed on the server."
}
```

#### 400 Bad Request - Database Configuration Incomplete

```json
{
  "success": false,
  "message": "Database configuration is incomplete"
}
```

#### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Failed to create backup",
  "error": "Detailed error message here"
}
```

### Sample cURL Request

```bash
curl -X POST http://localhost:3000/api/setting/backup \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### UI Notes

- **Loading State:** This operation takes 1-5 minutes depending on database size. Show a loading spinner with message "Creating backup..."
- **Success Message:** Display the returned filename to the user
- **Auto-refresh:** After success, you may want to call the List Backups API to refresh the backup list
- **Timeout:** Operation has 5-minute timeout. Handle timeout gracefully.

---

## API 2: List Backup Files

### Endpoint

```
GET /api/setting/backups
```

### Request

**Headers:**

```json
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Body:** None required

### Success Response (200 OK)

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
    },
    {
      "filename": "pharmatracker-production-on-2025-01-14-at-11-45-30-PM-IST.dump",
      "lastModified": "2025-01-14T18:15:30.000Z",
      "size": 12000000
    }
  ],
  "count": 3
}
```

### Success Response - Empty List (200 OK)

```json
{
  "success": true,
  "backups": [],
  "count": 0
}
```

### Error Responses

#### 400 Bad Request - AWS Credentials Not Configured

```json
{
  "success": false,
  "message": "AWS credentials not configured. Please configure AWS_ACCESS_KEY in environment variables."
}
```

```json
{
  "success": false,
  "message": "AWS credentials not configured. Please configure AWS_SECRET_KEY in environment variables."
}
```

#### 400 Bad Request - S3 Bucket Not Found

```json
{
  "success": false,
  "message": "S3 bucket 'pharmatracker-db-dump' does not exist or is not accessible"
}
```

#### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Failed to list backups",
  "error": "Detailed error message here"
}
```

### Sample cURL Request

```bash
curl -X GET http://localhost:3000/api/setting/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### UI Notes

- **Sorting:** Backups are already sorted by recency (most recent first)
- **File Size:** Size is in bytes. Convert to MB for display: `(size / 1024 / 1024).toFixed(2) + " MB"`
- **Date Display:** Convert ISO timestamp to user-friendly format
- **Environment Badge:** Extract environment from filename (e.g., "production", "staging") and show with color badge
- **Refresh Button:** Provide a refresh button to reload the list
- **No Data State:** Show appropriate message when `count === 0`

### Filename Format Breakdown

```
pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump
└─────┬─────┘ └───┬───┘    └────┬────┘    └─────┬─────┘ └┬┘ └─┬┘
  App Name     Environment    Date           Time      AM/PM IST
```

**Parsing Example:**

- Split by `-on-` to get environment
- Split by `-at-` to get date and time
- Environment: `production` or `staging`
- Date: `YYYY-MM-DD` format
- Time: `HH-MM-SS-AM/PM-IST` format

---

## API 3: Restore Database from Backup

### Endpoint

```
POST /api/setting/restore
```

### Request

**Headers:**

```json
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "Content-Type": "application/json"
}
```

**Body:**

```json
{
  "filename": "pharmatracker-staging-on-2025-01-15-at-02-30-23-PM-IST.dump",
  "passkey": "RESTORE_DB_PASSKEY_2025"
}
```

**Required Fields:**

- `filename` (string): Exact filename from the backup list
- `passkey` (string): Restore passkey (obtain from backend team)

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Database restored successfully from backup: pharmatracker-staging-on-2025-01-15-at-02-30-23-PM-IST.dump"
}
```

### Error Responses

#### 400 Bad Request - Missing Filename

```json
{
  "success": false,
  "message": "Backup filename is required"
}
```

#### 400 Bad Request - Missing Passkey

```json
{
  "success": false,
  "message": "Restore passkey is required"
}
```

#### 400 Bad Request - AWS Credentials Not Configured

```json
{
  "success": false,
  "message": "AWS credentials not configured. Please configure AWS_ACCESS_KEY in environment variables."
}
```

```json
{
  "success": false,
  "message": "AWS credentials not configured. Please configure AWS_SECRET_KEY in environment variables."
}
```

#### 400 Bad Request - Invalid Passkey

```json
{
  "success": false,
  "message": "Invalid restore passkey"
}
```

#### 400 Bad Request - Backup File Not Found

```json
{
  "success": false,
  "message": "Backup file not found: pharmatracker-staging-on-2025-01-15-at-02-30-23-PM-IST.dump"
}
```

#### 400 Bad Request - No Recent Backup (Safety Check Failed)

```json
{
  "success": false,
  "message": "Safety check failed: No recent backup found from 'staging' environment within last 5 minutes. Please create a backup first (POST /api/setting/backup) and then retry restore."
}
```

#### 400 Bad Request - PostgreSQL Tools Not Found

```json
{
  "success": false,
  "message": "PostgreSQL client tools not found. Ensure psql and pg_restore are installed on the server."
}
```

#### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Failed to restore backup",
  "error": "Detailed error message here"
}
```

### Sample cURL Request

```bash
curl -X POST http://localhost:3000/api/setting/restore \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "pharmatracker-staging-on-2025-01-15-at-02-30-23-PM-IST.dump",
    "passkey": "RESTORE_DB_PASSKEY_2025"
  }'
```

### UI Notes

- **⚠️ CRITICAL OPERATION:** This is a DESTRUCTIVE operation. The current database will be completely wiped and replaced.
- **Confirmation Dialog:** MUST show a confirmation dialog with:
  - Warning message about data loss
  - Current environment name (staging/production)
  - Backup filename being restored
  - Passkey input field
  - "I understand this will delete all current data" checkbox
  - Clear Cancel and Confirm buttons
- **Safety Flow:**
  1. First, call Create Backup API to take a safety backup
  2. Wait for backup to complete (show progress)
  3. Then allow restore operation within 5 minutes
  4. If 5 minutes elapsed, force user to create new backup
- **Loading State:** Operation takes 2-5 minutes. Show loading with message "Restoring database... Please do not refresh or close this page."
- **Post-Restore:** After successful restore, user should be logged out (their session may be invalidated)
- **Timeout:** Operation has 5-minute timeout
- **Disable UI:** During restore, disable all other actions in the app

---

## UI Workflow Examples

### Workflow 1: Create a Backup

```
1. User clicks "Create Backup" button
2. Show loading state: "Creating backup..."
3. Call POST /api/setting/backup
4. On success:
   - Show success message with filename
   - Refresh backup list (call GET /api/setting/backups)
5. On error:
   - Show error message from API
   - Allow retry
```

### Workflow 2: View Backup List

```
1. On page load, call GET /api/setting/backups
2. Display backups in a table/list with:
   - Filename (or parsed environment + date/time)
   - Environment badge (production/staging)
   - Date/time (human readable)
   - File size (in MB)
   - Actions: "Restore" button
3. Provide "Refresh" button to reload list
4. If empty, show "No backups available" message
```

### Workflow 3: Restore from Backup (CRITICAL)

```
1. User clicks "Restore" button next to a backup
2. Show FIRST confirmation dialog:
   "This will delete all current data. Do you want to create a safety backup first?"
   [Cancel] [Yes, Create Backup First]

3. If user clicks "Yes, Create Backup First":
   a. Call POST /api/setting/backup
   b. Show progress: "Creating safety backup..."
   c. On success, proceed to step 4

4. Show SECOND confirmation dialog:
   Title: "⚠️ Restore Database - DESTRUCTIVE OPERATION"
   Message:
   "You are about to restore the database from:

    Filename: [backup-filename]
    Environment: [environment]
    Created: [date/time]

    This will:
    ❌ DELETE all current data in [current-environment] database
    ✅ REPLACE with data from the selected backup
    ⚠️ LOG OUT all users

    Current Environment: [staging/production]"

   Inputs:
   - [ ] I understand this will delete all current data (checkbox)
   - Passkey: [________] (text input, password type)

   [Cancel] [Restore Database]

5. Enable "Restore Database" button only when:
   - Checkbox is checked
   - Passkey is entered

6. On "Restore Database" click:
   - Call POST /api/setting/restore with filename and passkey
   - Show loading: "Restoring database... This may take several minutes."
   - Disable all UI interactions

7. On success:
   - Show success message
   - Log out the user
   - Redirect to login page

8. On error:
   - If error is "No recent backup", show message and button to create backup
   - If error is "Invalid passkey", highlight passkey field
   - For other errors, show error message and allow retry
```

---

## Response Status Codes Summary

| Status Code | Meaning                                                           |
| ----------- | ----------------------------------------------------------------- |
| 200         | Success                                                           |
| 400         | Bad Request (validation error, missing data, safety check failed) |
| 401         | Unauthorized (invalid/missing JWT token)                          |
| 403         | Forbidden (user doesn't have WEB_ACCESS role)                     |
| 500         | Internal Server Error                                             |

---

## UI Components Needed

### 1. Backup List Page

**Components:**

- Page header with title "Database Backups"
- "Create Backup" button (primary action)
- "Refresh" button
- Loading spinner for list
- Data table/list with columns:
  - Environment (badge)
  - Date & Time
  - File Size
  - Actions (Restore button)
- Empty state message
- Error message display

### 2. Create Backup Button

**States:**

- Normal: "Create Backup"
- Loading: "Creating Backup..." (disabled, with spinner)
- Success: Show success toast/notification

### 3. Restore Confirmation Dialog

**Components:**

- Modal/Dialog overlay
- Warning icon
- Title with warning symbol
- Detailed message with current env and backup info
- Checkbox: "I understand this will delete all current data"
- Password input: "Restore Passkey"
- Cancel button (secondary)
- Restore button (primary, danger color)
- Both buttons should be clearly styled (Cancel as secondary, Restore as danger/red)

### 4. Progress Indicators

- Creating backup: Progress bar or spinner with message
- Restoring database: Progress bar or spinner with message + warning to not close page

### 5. Toast Notifications

- Success: Backup created
- Success: Database restored
- Error: Display error message from API
- Warning: Safety backup required

---

## Environment Detection

The UI should be aware of the current environment (staging/production) for:

- Showing current environment in restore dialog
- Color coding environments:
  - Production: Red/Orange (danger)
  - Staging: Blue/Green (safe to test)

You can detect environment from:

- Backend API response
- JWT payload
- Environment variable in frontend build

---

## Testing Checklist for UI Team

- [ ] Can create backup successfully
- [ ] Can view list of backups
- [ ] Backups are sorted by recency (newest first)
- [ ] File sizes display correctly in MB
- [ ] Dates display in user's local timezone
- [ ] Environment badges show correct color
- [ ] Restore requires passkey
- [ ] Restore requires confirmation checkbox
- [ ] Restore shows safety backup warning
- [ ] Restore disables UI during operation
- [ ] Error messages display clearly
- [ ] Loading states work for all operations
- [ ] Refresh button works
- [ ] Empty state shows when no backups
- [ ] Success/error toasts display
- [ ] User is logged out after restore

---

## Sample UI Flow Mockup (Text)

```
┌─────────────────────────────────────────────────────────────┐
│ Database Backups                          [Create Backup] [🔄]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Environment │ Date & Time          │ Size  │ Actions   │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ [PROD]      │ Jan 15, 2:30 PM IST │ 11 MB │ [Restore] │ │
│ │ [STAGING]   │ Jan 15, 1:15 PM IST │ 10 MB │ [Restore] │ │
│ │ [PROD]      │ Jan 14, 11:45 PM IST│ 11 MB │ [Restore] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Total: 3 backups                                           │
└─────────────────────────────────────────────────────────────┘


When "Create Backup" clicked:
┌─────────────────────────────────────────┐
│  Creating backup...                     │
│  ◌ ◌ ◌ (spinner)                       │
│  This may take a few minutes           │
└─────────────────────────────────────────┘


When "Restore" clicked:
┌──────────────────────────────────────────────────────┐
│ ⚠️  Restore Database - DESTRUCTIVE OPERATION          │
├──────────────────────────────────────────────────────┤
│                                                      │
│ You are about to restore from:                      │
│ pharmatracker-staging-on-2025-01-15-at-02-30-23...  │
│                                                      │
│ Current Environment: STAGING                         │
│                                                      │
│ This will:                                           │
│ ❌ DELETE all current data                          │
│ ✅ REPLACE with backup data                         │
│ ⚠️  LOG OUT all users                               │
│                                                      │
│ [ ] I understand this will delete all current data  │
│                                                      │
│ Restore Passkey:                                     │
│ [_____________________________]                      │
│                                                      │
│                     [Cancel] [Restore Database]      │
└──────────────────────────────────────────────────────┘
```

---

## Important Notes for UI Team

1. **NEVER** skip the confirmation dialog for restore
2. **ALWAYS** show the current environment prominently
3. **ALWAYS** require both checkbox AND passkey for restore
4. **ALWAYS** disable UI during restore operation
5. **ALWAYS** log out user after successful restore
6. Handle loading states gracefully (operations take minutes)
7. Show clear error messages from API responses
8. Provide retry option on failures
9. Use danger/red styling for restore actions
10. Test thoroughly in staging before production deployment

---

## Contact

For questions or clarifications about these APIs, contact the backend team.

**API Version:** 1.0  
**Last Updated:** January 2025
