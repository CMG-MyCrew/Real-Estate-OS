# REOS Enterprise v3.2.7 — Core Foundation Synchronization

Sprint 1 stabilizes the core framework after the v3.2.6 Phase 1 upgrade.

## Purpose

This sprint establishes one consistent startup and diagnostic layer before additional feature work continues.

## Added

| File | Purpose |
| --- | --- |
| `src/CoreFoundation.gs` | Central startup diagnostics, core table setup, module sheet synchronization, safe UI launching, and health-check support. |
| `docs/V3_2_7_CORE_FOUNDATION_SYNC.md` | Sprint documentation. |

## Updated

| File | Change |
| --- | --- |
| `src/00_Bootstrap.gs` | Updated safe defaults to v3.2.7 and aligned fallback sheet/role/id configuration. |
| `src/Config.gs` | Version bumped to v3.2.7. |
| `src/Logger.gs` | Standardized logging helpers. |
| `src/Menu.gs` | Unified REOS menu and added Core Diagnostics / Sync Module Sheets actions. |

## New Menu Items

- `REOS → Core Diagnostics`
- `REOS → Sync Module Sheets`

## Validation Steps

After pulling and pushing to Apps Script:

```bash
cd ~/reos-new-script
git -C ~/Real-Estate-OS pull
cp ~/Real-Estate-OS/src/CoreFoundation.gs .
cp ~/Real-Estate-OS/src/00_Bootstrap.gs .
cp ~/Real-Estate-OS/src/Config.gs .
cp ~/Real-Estate-OS/src/Logger.gs .
cp ~/Real-Estate-OS/src/Menu.gs .
find . -name "*.js" -delete
clasp push
```

Then reload the Sheet and run:

1. `REOS → Core Diagnostics`
2. `REOS → Sync Module Sheets`
3. `REOS → Health Check`

## Acceptance Criteria

- REOS reports version `3.2.7`.
- Menu is built from one unified `Menu.gs` path.
- Core diagnostics reports required framework functions.
- Module sheet sync runs without blocking startup.
- Missing optional modules show as diagnostics instead of hard failures.

## Next Sprint

v3.2.8 — Module Registry & Dependency Injection.
