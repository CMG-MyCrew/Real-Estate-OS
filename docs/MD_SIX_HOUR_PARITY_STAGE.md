# REOS Maryland six-hour scheduler — staged implementation, NOT production authorization

**Status:** STAGED / NO-GO for live ingest. This change does not deploy, install a trigger, call an endpoint, write to Apps Script, or alter Pennsylvania production.

## Provenance / existing coverage

- Repository: `CMG-MyCrew/Real-Estate-OS`, base branch `feature/county-connectors`, base SHA `a9b84560660879320f9aa4c649a5170dcb7ce141` (reviewed 2026-11-08).
- `config/county-connectors/MD-*.json`: **24** jurisdiction manifests (23 counties and Baltimore City); `src/connectors/generated/MD*CountyConnector.gs`: **24** corresponding modules.
- Current MD manifests provide `property_assessment` through Maryland statewide ArcGIS parcel data with jurisdiction-scoped `JURSCODE` queries. They do **not** prove current source health, all-record coverage, or live ingestion.
- The existing production Philadelphia scheduler is **not** modified. Its actual deployed runtime and scheduling/authorization require separate verification. Repo `src/CountyRegistryScheduler.gs` uses a daily dry-run verifier; this staged module provides new MD-specific six-hour scheduling rather than changing that verifier.
- MD Somerset and Washington were historical registration-review exceptions. The new scheduler refuses to run if **any** Maryland registration is missing or drifted.

## New, state-isolated entry points

- `REOS_MD_SIX_HOUR_STATUS()` — read-only status for the 24 Maryland jurisdiction + property-assessment jobs and distinct cursor/checkpoint property names.
- `REOS_MD_SIX_HOUR_TICK()` — six-hour launch; max eight bounded 100-record pages per execution, max 180 seconds, serialized with a script lock.
- `REOS_MD_SIX_HOUR_RESUME()` — optional fifteen-minute backlog resume; shares the same Maryland-only due/blocked-state rules.
- `REOS_MD_SIX_HOUR_INSTALL_TRIGGERS()` — manual opt-in **after separate trigger-install approval**; never called on file load. Installs only the named MD handlers, preserves all other trigger handlers.

Each connector maintains its own `REOS_MD_6H_V1_CP_MD-..._PROPERTY_ASSESSMENT` checkpoint, current six-hour UTC cycle, offset, records, last run, success, completion, and failure. A failed / invalid / partial page is marked `BLOCKED` without advancing its cursor. Other counties proceed. An incomplete old cycle is resumed before any newer cycle. The `REOS_MD_6H_V1_ROUND_ROBIN` marker rotates counties to avoid first-county starvation.

**Important:** the shared SDK considers `dryRun: true` an *audited dry run*: it writes rows in `COUNTY_CONNECTOR_RUNS` but does not write `DISTRESS_LEADS`. Neither an audited dry run nor a live write is authorized by default. The scheduler does not use `REOS_COUNTY_SYNC_ALL` (which would include PA/NJ/DE).

## Fail-closed property gates — NOT TO BE SET until authorized

All properties use the prefix `REOS_MD_6H_V1_`:

| Property suffix | Meaning |
| --- | --- |
| `ENABLED=YES` | Manual activation of MD-only scheduler |
| `EXECUTION_APPROVED=YES` | Separate written execution permission |
| `MODE=AUDITED_DRY_RUN` | Dry test; requires `AUDIT_WRITE_APPROVED=YES` |
| `AUDIT_WRITE_APPROVED=YES` | Permission for SDK's run-audit table writes |
| `MODE=LIVE` | Live write requested; additionally requires next two approval properties |
| `LIVE_PERSISTENCE_APPROVED=YES` | Separate approval to persist actual MD records |
| `SOURCE_IDENTITY_CERTIFIED=YES` | Independent proof of authoritative endpoint, jurisdiction, mapping, identity and completeness |
| `TRIGGER_INSTALL_APPROVED=YES` | Separate approval to create the two MD trigger handlers |

The above are examples of named gates, **not** authorization to set them. With no properties set, `REOS_MD_SIX_HOUR_TICK()` returns `DISABLED_NO_WRITES`; the installer returns `TRIGGER_INSTALL_NOT_AUTHORIZED`.

## Parity limits and blockers

1. **Dataset scope:** property-assessment feed ONLY. Do not label these 24 connectors sheriff-tax, sheriff-mortgage, vacant, code-violation, or probate feeds without a verified official Maryland source, correct legal-use review, source-specific field mapping, deduplication, status handling, and independent tests. Philadelphia's dataset labels may not match Maryland's county agencies.
2. **Maryland jurisdiction identity:** `MD-BALTIMORE-CITY` (JURSCODE `BACI`) has historically returned some records with `OBJECTID` and `ADDRESS` but a blank `PARCEL`. Existing generated record filters / validations must be resolved based on a source-backed identity contract, not by silently skipping records. The stage blocks checkpoint advance when `valid != fetched`; **it does not repair those connectors or certify live coverage.** Somerset and Washington require new registration proof.
3. **Source stability:** current ArcGIS adapter uses offset paging without a guaranteed stable ordering/snapshot. Large data sets can change during paging, causing duplicate/missed rows. Need stable ordered pagination / source extract watermark and re-scan reconciliation before production approval.
4. **Shared SDK write safety:** the SDK performs audit writes during dry run; in live mode it may persist records before reporting page-level validation problems, and its existing address fallback can match records across source datasets. A separate data-isolation/deduplication review is required before live persistence. No automated MAO or offer authority may be granted; comp-supported ARV and adequate repair scope remain mandatory.
5. **Trigger runtime:** 24 jurisdictions may exceed one Apps Script execution. The bounded round-robin and optional resume trigger provide continuation, **not** proof each source fully completes within six hours. Full completion, retry, quota, coverage, and authorization testing are still necessary.
6. **Authorization boundary:** production deployment, Google OAuth scope consent, ScriptApp trigger installation, scheduler invocation, county record persistence, and any Pennsylvania production change are excluded from this branch's scope.

## Validation (offline, no Google requests)

From the repository root after reviewing this change:

`bash
node tests/md-six-hour-scheduler.test.cjs
`

Test coverage: default disabled with no mutations, 24-ID registration gate, lock, separate MD checkpoints, rotating bounded jobs, cursor advancement, failed-page cursor hold, empty-page refusal, live authorization gate, dry preflight before approved live call, idempotent MD trigger installer preserving existing PA/global triggers. The test uses mocked SDK, PropertiesService, LockService, and ScriptApp only. It does not demonstrate real-source correctness.

## Next independent acceptance gate

Confirm Maryland registrations 24/24 using the deployment's actual Apps Script source, verify live ArcGIS endpoint and per-county JURSCODE, repair identity/filter logic on missing parcels, prove ordered paging and no cross-source dedup collision, collect source-level and replay evidence, obtain explicit approval for **audited dry runs**, then separate **live ingest** and **trigger install** approvals. Until these are signed off: **NO GO**.
