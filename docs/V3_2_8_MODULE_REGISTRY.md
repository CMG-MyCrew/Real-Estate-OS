# REOS Enterprise v3.2.8 — Module Registry & Dependency Injection

Sprint 2 adds the module registry layer that sits on top of the stabilized v3.2.7 core foundation.

## Purpose

The module registry makes REOS easier to scale by centralizing module metadata, dependency checks, module health reporting, and enabled-module initialization.

## Added

| File | Purpose |
| --- | --- |
| `src/Modules.gs` | Module registry, dependency validation, module health reporting, dependency resolution, and enabled-module initialization. |
| `docs/V3_2_8_MODULE_REGISTRY.md` | Sprint documentation. |

## Updated

| File | Change |
| --- | --- |
| `src/CoreFoundation.gs` | Integrates the module registry into startup diagnostics and health checks. |
| `src/Config.gs` | Adds module registry sheets and bumps app version to `3.2.8`. |
| `src/Menu.gs` | Adds Module Health Report and Initialize Enabled Modules menu actions. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `MODULE_REGISTRY` | Stores module metadata, version, status, enabled flag, and load order. |
| `MODULE_DEPENDENCIES` | Stores dependency validation results. |
| `MODULE_HEALTH` | Stores module-level health checks. |

## New Menu Items

- `REOS → Module Health Report`
- `REOS → Initialize Enabled Modules`

## API Surface

```javascript
REOS.Modules.ensureSheets();
REOS.Modules.seedRegistry();
REOS.Modules.listModules();
REOS.Modules.resolve(key);
REOS.Modules.optional(key);
REOS.Modules.validateDependencies();
REOS.Modules.healthReport();
REOS.Modules.initializeEnabledModules();
REOS.Modules.setEnabled(key, enabled);
```

## Validation Steps

After syncing to Apps Script:

```bash
cd ~/Real-Estate-OS
git pull

cd ~/reos-new-script
cp ~/Real-Estate-OS/src/Modules.gs .
cp ~/Real-Estate-OS/src/CoreFoundation.gs .
cp ~/Real-Estate-OS/src/Config.gs .
cp ~/Real-Estate-OS/src/Menu.gs .
find . -name "*.js" -delete
clasp push
```

Then reload the Sheet and run:

1. `REOS → Module Health Report`
2. `REOS → Initialize Enabled Modules`
3. `REOS → Core Diagnostics`
4. `REOS → Health Check`

## Acceptance Criteria

- REOS reports version `3.2.8`.
- Module registry sheets exist.
- Module Health Report runs.
- Required modules pass.
- Optional modules report missing/ready without breaking startup.
- Enabled modules can initialize their sheets through one menu action.

## Next Sprint

v3.2.9 — Production Diagnostics & Self-Healing.
