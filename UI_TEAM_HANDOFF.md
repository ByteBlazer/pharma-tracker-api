# UI Team Handoff - Backup & Restore Feature

## 📦 Files for UI Team

### 1. **BACKUP_API_DOCUMENTATION_FOR_UI.md** ⭐

**Primary document for UI team**

Contains:

- ✅ Complete API specifications for all 3 endpoints
- ✅ Sample request/response formats for every scenario
- ✅ All success and error responses
- ✅ cURL examples
- ✅ UI-specific implementation notes
- ✅ Recommended workflows
- ✅ UI component suggestions
- ✅ Testing checklist
- ✅ Text-based UI mockups

### 2. **Backup_APIs_Postman_Collection.json**

**Postman collection for easy testing**

To use:

1. Open Postman
2. Import collection (File → Import → Select file)
3. Set environment variables:
   - `base_url`: http://localhost:3000 (or your staging URL)
   - `jwt_token`: Your JWT authentication token
4. Test all APIs with pre-configured requests

### 3. **BACKUP_RESTORE_README.md**

**Comprehensive technical documentation**

Reference for:

- Feature overview
- Safety mechanisms
- Troubleshooting
- Best practices

### 4. **INSTALLATION_STEPS.md**

**Setup guide for developers**

Useful for:

- Understanding prerequisites
- Verification checklist

---

## 🎯 Quick Start for UI Team

### Step 1: Read the API Documentation

Open `BACKUP_API_DOCUMENTATION_FOR_UI.md` - this is your main reference.

### Step 2: Import Postman Collection

1. Open `Backup_APIs_Postman_Collection.json` in Postman
2. Set your JWT token in variables
3. Test all APIs to understand behavior

### Step 3: Review Sample Responses

All possible responses are documented with examples:

- Success cases
- Error cases
- Edge cases

---

## 📊 Three New APIs

### 1. Create Backup

```
POST /api/setting/backup
```

- Creates compressed database backup
- Uploads to S3
- Returns backup filename

### 2. List Backups

```
GET /api/setting/backups
```

- Lists all available backups
- Sorted by recency (newest first)
- Returns filename, date, size

### 3. Restore Database ⚠️

```
POST /api/setting/restore
Body: { "filename": "...", "passkey": "..." }
```

- DESTRUCTIVE operation
- Requires passkey
- Requires recent safety backup
- Drops and restores database

---

## 🎨 UI Components Needed

### Page: Database Backups

**Header Section:**

- Page title: "Database Backups"
- Primary action button: "Create Backup"
- Refresh button

**Backup List:**

- Table/List showing:
  - Environment badge (Production/Staging)
  - Date & Time (formatted)
  - File size (in MB)
  - Restore button per row
- Empty state message
- Loading state

**Create Backup Flow:**

- Loading state: "Creating backup..."
- Success notification
- Auto-refresh list after success

**Restore Flow (Critical!):**

- ⚠️ Warning dialog with:
  - Destructive operation warning
  - Current environment display
  - Backup filename confirmation
  - Checkbox: "I understand this will delete all current data"
  - Passkey input field (password type)
  - Cancel button
  - Restore button (danger/red style)
- Loading state: "Restoring database..."
- Disable all UI during restore
- Log out user after success

---

## ⚠️ Critical UI Requirements

### Must Have:

1. **Confirmation dialog** for restore with checkbox + passkey
2. **Environment visibility** - always show current environment
3. **Loading states** - operations take 1-5 minutes
4. **Disable UI** during restore operation
5. **Log out user** after successful restore
6. **Error handling** - display API error messages clearly
7. **Safety backup flow** - guide user to create backup before restore

### Must NOT Do:

1. ❌ Allow restore without confirmation
2. ❌ Hide current environment
3. ❌ Allow UI interaction during restore
4. ❌ Keep user logged in after restore
5. ❌ Skip passkey requirement

---

## 🔐 Security Notes

- All APIs require JWT authentication with `WEB_ACCESS` role
- Restore additionally requires passkey (get from backend team)
- Passkey is NOT included in the documentation for security
- UI should store passkey securely (not in frontend code!)

---

## 📱 Responsive Design

Consider:

- Mobile view for backup list (stack columns)
- Confirmation dialogs should be scrollable on small screens
- File sizes should be readable on mobile
- Actions should be accessible on touch devices

---

## 🧪 Testing Scenarios

### For UI Team to Test:

**Create Backup:**

- ✅ Successful backup creation
- ✅ Loading state shows
- ✅ Success message displays filename
- ✅ List auto-refreshes after success
- ✅ Error handling (if S3 bucket missing)

**List Backups:**

- ✅ Shows backups sorted by date (newest first)
- ✅ Date formats correctly
- ✅ File size shows in MB
- ✅ Environment badges show correct colors
- ✅ Empty state when no backups
- ✅ Refresh button works

**Restore:**

- ✅ Confirmation dialog shows all required info
- ✅ Checkbox must be checked to enable restore
- ✅ Passkey is required
- ✅ Invalid passkey shows error
- ✅ Missing recent backup shows helpful error
- ✅ UI disables during restore
- ✅ User logs out after success
- ✅ Error messages display correctly

---

## 💡 Tips for Implementation

### Date Formatting

```javascript
// lastModified comes as ISO string: "2025-01-15T09:00:23.000Z"
const date = new Date(backup.lastModified);
const formatted = date.toLocaleString("en-IN", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
// Output: "Jan 15, 2025, 02:30 PM"
```

### File Size Formatting

```javascript
// size comes in bytes: 12345678
const sizeInMB = (backup.size / 1024 / 1024).toFixed(2);
// Output: "11.77 MB"
```

### Environment Parsing from Filename

```javascript
// filename: "pharmatracker-production-on-2025-01-15-at-02-30-23-PM-IST.dump"
const parts = backup.filename.split("-on-");
const environment = parts[0].replace("pharmatracker-", "");
// Output: "production"
```

### Environment Badge Colors

```css
.badge-production {
  background: #dc2626; /* red */
  color: white;
}

.badge-staging {
  background: #2563eb; /* blue */
  color: white;
}
```

---

## 📞 Support & Questions

For API questions or clarifications:

- Contact: Backend Team
- Reference: `BACKUP_API_DOCUMENTATION_FOR_UI.md`
- Test in: Postman using provided collection

For technical issues:

- Check: `BACKUP_RESTORE_README.md` troubleshooting section
- Environment: Test in staging first, then production

---

## ✅ Acceptance Criteria

Feature is complete when:

- [ ] User can create backup successfully
- [ ] User can view list of backups
- [ ] User can restore from backup (with all safety checks)
- [ ] All loading states work correctly
- [ ] All error messages display properly
- [ ] Confirmation dialog requires checkbox + passkey
- [ ] User is logged out after restore
- [ ] UI is responsive on mobile
- [ ] Tested in staging environment
- [ ] Code reviewed and approved
- [ ] QA testing completed

---

**Created:** January 2025  
**API Version:** 1.0  
**Status:** Ready for UI Development 🚀
