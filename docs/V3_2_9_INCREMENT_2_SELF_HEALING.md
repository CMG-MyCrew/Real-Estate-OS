# REOS Enterprise v3.2.9 — Sprint 3 Increment 2: Self-Healing Engine

This increment adds automatic repair support for common production issues.

## Added

| File | Purpose |
| --- | --- |
| `src/SelfHealing.gs` | Repairs missing sheets, headers, script properties, settings, lookup values, module registry tables, and diagnostic tables. |
| `docs/V3_2_9_INCREMENT_2_SELF_HEALING.md` | Increment documentation. |

## Updated

| File | Change |
| --- | --- |
| `src/Config.gs` | Adds `SYSTEM_REPAIR_LOG` to sheet config. |
| `src/Menu.gs` | Adds `Run Self-Healing` menu action. |

## New Sheet

| Sheet | Purpose |
| --- | --- |
| `SYSTEM_REPAIR_LOG` | Records repair actions, statuses, messages, and details. |

## New Menu Item

- `REOS → Run Self-Healing`

## API Surface

```javascript
REOS.SelfHealing.ensureSheets();
REOS.SelfHealing.run();
REOS.SelfHealing.repairSheets();
REOS.SelfHealing.repairConfiguration();
REOS.SelfHealing.repairLookups();
REOS.SelfHealing.repairModules();
```

## Validation Steps

```bash
cd ~/Real-Estate-OS
git pull

cd ~/reos-new-script
cp ~/Real-Estate-OS/src/SelfHealing.gs .
cp ~/Real-Estate-OS/src/Config.gs .
cp ~/Real-Estate-OS/src/Menu.gs .
find . -name "*.js" -delete
clasp push
```

Then reload the Sheet and run:

1. `REOS → Run Self-Healing`
2. `REOS → Run Diagnostics`
3. `REOS → Health Check`

## Acceptance Criteria

- `SYSTEM_REPAIR_LOG` is created.
- Self-healing completes without critical error.
- Missing sheets and headers are repaired.
- Required script properties are created if missing.
- Lookup values are inserted if missing.
- Module and diagnostics sheets are verified.
- Repair actions are logged.

## Next Increment

Sprint 3 Increment 3 — Environment Validation.
