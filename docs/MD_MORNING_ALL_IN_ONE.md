# REOS Enterprise — Maryland morning report and one-call trigger installer

**Status: STAGED, NOT INSTALLED. Production activation NO-GO pending explicit approvals and source/identity evidence.**

## Architecture

The existing **REOS Daily Acquisition** ChatGPT automation, running each morning at approximately **8:00 AM America/New_York**, has been updated to include a distinct Maryland section while preserving Philadelphia, NJ, DE, nationwide coverage, schedule and delivery. The repository's separate `notificationsDailyDigest` email handler is NOT changed.

Two components coexist on this staging branch:

- `src/MDSixHourCountyScheduler.gs`: 24 MD jurisdictions (23 counties plus Baltimore City), `property_assessment` only, separate county/cycle cursor checkpoints, fail-closed incomplete/invalid pages, bounded round-robin execution. This is **not** a production distress feed.
- `src/MDMorningAllInOne.gs`: **single installer** `REOS_MD_MORNING_INSTALL_ALL()`. It validates the Apps Script project ID pin, run and audit-write permissions, independent Maryland 24/24 registrations, exact trigger ownership, absence of conflicting older MD handlers, and Drive evidence permission. It creates only `REOS_MD_MORNING_SIX_HOUR` (every six hours) and `REOS_MD_MORNING_RESUME` (every fifteen minutes). It reuses existing triggers on repeat calls, refuses duplicate MD handlers, rolls back only new MD triggers if install fails, and never deletes Pennsylvania/NJ/DE triggers. Trigger time is Apps Script's interval schedule, not a guaranteed exact six-hour Eastern wall-clock slot.

After each authorized MD tick it writes one pinned Google Drive file, `REOS_MD_Morning_Evidence.json`, with only scheduler mode, dated checkpoints, verified/unverified status labels, and 24 jurisdiction statuses. It never stores individual property or lead PII. The existing morning ChatGPT automation is instructed to look up this file read-only through connected Google Drive, validate freshness and provenance, and include it only as **self-reported scheduler evidence**, never as independent canonical certification. If the file is missing, stale or inaccessible it reports **MD SCHEDULER STATUS NOT VERIFIED**. Five distress feeds remain **NOT AVAILABLE / SOURCE CERTIFICATION HOLD** until separately verified Maryland sources exist.

## Single invocation — AFTER approval and deployment into verified MD runtime

```javascript
REOS_MD_MORNING_INSTALL_ALL()
```

This is the sole Apps Script entry point for preparing the MD trigger+evidence bridge. It is NOT invoked when loading or deploying the file.

### Required Script Properties (all need separate legitimate approvals)

- `REOS_MD_MORNING_V1_EXPECTED_SCRIPT_ID`: the verified *actual* Apps Script project script ID, obtained independently from the target runtime.
- `REOS_MD_MORNING_V1_TRIGGER_INSTALL_APPROVED=YES`
- `REOS_MD_MORNING_V1_EVIDENCE_WRITE_APPROVED=YES`
- `REOS_MD_6H_V1_ENABLED=YES`
- `REOS_MD_6H_V1_EXECUTION_APPROVED=YES`
- `REOS_MD_6H_V1_AUDIT_WRITE_APPROVED=YES`
- `REOS_MD_6H_V1_TRIGGER_INSTALL_APPROVED=YES`
- `REOS_MD_6H_V1_MODE=AUDITED_DRY_RUN` for an approved test (the shared SDK writes audit rows even on dry run); LIVE requires further source identity and persistence approvals specified in `docs/MD_SIX_HOUR_PARITY_STAGE.md`.

Never set these properties from an unsigned review packet or simply to make a test pass. The installer requires ScriptApp and Drive scopes and fails closed if the deployed principal lacks them. Because `getProjectTriggers()` is scoped to the authorized account, independently audit any existing triggers owned by other principals before enabling.

## Offline proof / blockers

`node tests/md-six-hour-scheduler.test.cjs` verifies the underlying staged county scheduler.
`node tests/md-morning-all.test.cjs` verifies the single installer and morning evidence bridge.
The separately packaged extended offline all-in-one harness runs 37 mock-only assertions.

**No production writes were performed to validate this staging change.** No Maryland trigger is verified installed. The five MD distress datasets (code violations, vacancy, sheriff tax sales, sheriff mortgage sales, probate) have no independently certified live source, and Maryland assessment rows are NOT distressed-property leads. Missing stable paging, jurisdiction identity / registration drift (including historical Somerset and Washington exceptions), live canonical reconciliation, reviewer permission, and OAuth scope attestation block live activation. No MAO or offer authority follows from a collection or assessment. Comp-supported ARV, adequate repair scope, and separate approvals remain prerequisites.
