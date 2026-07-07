# REOS Enterprise v3.2.9 — Sprint 3 Increment 1: Diagnostics Framework

This increment adds the production diagnostics framework.

## Added

| File | Purpose |
| --- | --- |
| `src/Diagnostics.gs` | Startup, dependency, sheet, module, script property, trigger, HTML, performance, and integration diagnostics. |
| `docs/V3_2_9_INCREMENT_1_DIAGNOSTICS.md` | Increment documentation. |

## Updated

| File | Change |
| --- | --- |
| `src/Config.gs` | Bumps app version to `3.2.9` and adds diagnostics sheets. |
| `src/Menu.gs` | Adds Run Diagnostics and Diagnostics Summary menu actions. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `DIAGNOSTIC_RUNS` | Stores diagnostic run summaries. |
| `DIAGNOSTIC_CHECKS` | Stores individual diagnostic checks. |

## New Menu Items

- `REOS → Run Diagnostics`
- `REOS → Diagnostics Summary`

## API Surface

```javascript
REOS.Diagnostics.ensureSheets();
REOS.Diagnostics.run();
REOS.Diagnostics.startupCheck();
REOS.Diagnostics.dependencyCheck();
REOS.Diagnostics.sheetCheck();
REOS.Diagnostics.moduleCheck();
REOS.Diagnostics.propertyCheck();
REOS.Diagnostics.triggerCheck();
REOS.Diagnostics.htmlCheck();
REOS.Diagnostics.performanceCheck();
REOS.Diagnostics.integrationCheck();
REOS.Diagnostics.healthSummary();
```

## Validation Steps

```bash
cd ~/Real-Estate-OS
git pull

cd ~/reos-new-script
cp ~/Real-Estate-OS/src/Diagnostics.gs .
cp ~/Real-Estate-OS/src/Config.gs .
cp ~/Real-Estate-OS/src/Menu.gs .
find . -name "*.js" -delete
clasp push
```

Then reload the Sheet and run:

1. `REOS → Run Diagnostics`
2. `REOS → Diagnostics Summary`
3. `REOS → Health Check`

## Acceptance Criteria

- REOS reports version `3.2.9`.
- `DIAGNOSTIC_RUNS` and `DIAGNOSTIC_CHECKS` are created.
- Diagnostics run without hard failure.
- Results are persisted to Sheets.
- Menu actions are available.

## Next Increment

Sprint 3 Increment 2 — Self-Healing Engine.
