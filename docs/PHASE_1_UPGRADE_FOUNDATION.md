# REOS Enterprise — Phase 1 Upgrade Foundation

This phase upgrades a workbook currently running REOS v3.0.0 into a v3.2.6-ready foundation.

## Files Updated

| File | Purpose |
| --- | --- |
| `src/Config.gs` | Version bump to v3.2.6 and expanded sheet registry. |
| `src/Database.gs` | Adds safe table creation and upsert support. |
| `src/Main.gs` | Adds Phase 1 upgrade menu items, expanded health check, safe module opening, and lifecycle wiring. |

## File Added

| File | Purpose |
| --- | --- |
| `src/Phase1Upgrade.gs` | Creates core upgrade sheets, seeds settings/lookups, validates foundation, and writes upgrade log entries. |

## New Menu Items

After syncing Apps Script and reloading the spreadsheet, the REOS menu should include:

- Run Phase 1 Upgrade
- Validate Phase 1 Upgrade

## Run Order

1. Sync these files into the Apps Script project attached to the workbook.
2. Reload the spreadsheet.
3. Run `REOS → Run Phase 1 Upgrade`.
4. Run `REOS → Validate Phase 1 Upgrade`.
5. Run `REOS → Health Check`.

## Expected Result

The workbook should report REOS version `3.2.6` and create the foundational sheets required before importing advanced modules.

## Important Notes

- This phase does not fully import every feature module.
- UI menu items are safe-opened, so missing module HTML files show an import message instead of crashing.
- Phase 2 should import and verify modules one at a time.

## Next Phase

Phase 2 — Module Import & Verification:

1. Finance modules
2. Portal modules
3. Vendor/client/investor role modules
4. QuickBooks modules
5. Notification center
