# REOS Enterprise v3.0 Backup & Recovery

## Backup Types

- Workbook backup: full Google Sheets copy.
- Config backup: Script Properties snapshot stored in `BACKUPS`.
- Rollback point: workbook + config backup pair.

## Create Backup

Use `REOS → Open Release Center → Build Release Candidate`, or call:

```javascript
reosBackupCreateRollbackPoint('RC1');
```

## Validate Backup

Confirm the backup file URL opens and metadata exists in `BACKUPS`.

## Recovery Process

1. Stop automation triggers if unsafe.
2. Open latest valid backup workbook.
3. Confirm sheets and data integrity.
4. Restore script properties from config backup if needed.
5. Re-sync Apps Script from known-good GitHub commit.
6. Run health check and production hardening audit.
7. Record recovery notes in deployment history.
