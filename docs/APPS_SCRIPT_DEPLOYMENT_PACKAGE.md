# REOS Apps Script Deployment Package

Use this when `clasp push` is blocked by conflicting files or when you want a clean manual import package.

## Build Package

From the Linux terminal:

```bash
cd ~/Real-Estate-OS
git pull
chmod +x tools/build-appscript-package.sh
./tools/build-appscript-package.sh
```

This creates:

```text
dist/reos-appscript-deployment/
dist/reos-appscript-deployment.zip
```

The package contains only Apps Script-compatible files:

- `.gs`
- `.html`
- `appsscript.json`
- `IMPORT_MANIFEST.txt`

## Manual Import into Apps Script

1. Open Apps Script.
2. Create each `.gs` and `.html` file from `dist/reos-appscript-deployment`.
3. Paste the matching file contents.
4. Open Project Settings and enable the manifest file if needed.
5. Replace the manifest with `appsscript.json` contents.
6. Save all files.
7. Reload the Google Sheet.
8. Run `REOS → Run Phase 1 Upgrade`.
9. Run `REOS → Health Check`.

## Notes

Google Apps Script does not support direct zip upload in the browser editor. The zip is for backup/transport. Manual import requires copying file contents or using a working `clasp` setup.

## Recommended Import Order

1. `appsscript.json`
2. `Config.gs`
3. `Utilities.gs`
4. `Database.gs`
5. `Main.gs`
6. `Phase1Upgrade.gs`
7. Remaining `.gs` files
8. `.html` files
