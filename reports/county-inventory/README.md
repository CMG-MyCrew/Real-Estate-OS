# REOS Enterprise county connector inventory — evidence-controlled baseline

**Inventory assembled:** 2026-11-07. **Mode:** read-only evidence extraction. **GitHub base:** `feature/county-connectors`; this audit PR does not enable or deploy connectors, execute Apps Script, change credentials, write `DISTRESS_LEADS`, or alter MAO/offer authority.

## What is counted

- **94/94** manifest files and **94/94** state-qualified generated Apps Script modules exist on the county feature branch (PA 46, NJ 21, DE 3, MD 24). They are **not all on `main`**. The only county adapter on `main` at the audit snapshot is the legacy Philadelphia connector.
- Historical registry: **88 READY, 5 REVIEW_REQUIRED, 1 PRODUCTION**. **None of these values certifies current production authorization.**
- **100 dataset configurations** across 94 counties: 94 registry datasets (including the extra disabled Bucks tax-delinquent dataset), plus six Philadelphia datasets stored in its manifest but not in the registry's dataset list.
- **93** recorded dataset endpoints, **12** distinct URLs, and **6** Philadelphia dataset URLs not present in the repository: these require read-only verification of configured Script Properties and live identity.
- **93 historical passing source health checks**, **88 most-recent dry-run successes**, **5 most-recent dry-run failures**, and **1 county with no registry dry run** (Philadelphia). These checks date from August 2026 and do not prove current source availability.
- Historical dry-run failures: `DE-KENT`, `DE-SUSSEX`, `MD-SOMERSET`, `MD-WASHINGTON`, `NJ-CUMBERLAND`. The saved errors report unregistered connectors at time of testing; PRs #6 and #7 fixed namespace and registration logic, but a post-fix source/runtime retest is still required.
- **Zero verified live-ingestion records at county level in the inspected GitHub registry evidence.** This means **unknown**, *not* zero production records. Leave live ingestion dates and counts empty pending separately reconciled production ledger evidence.

## Data files

1. `REOS_COUNTY_CONNECTOR_INVENTORY_2026-11-07.csv`: one row per county, dataset list, static source URL(s), generated module and manifest paths, historical validation and dry-run outcomes, current live-ingestion evidence fields, and production authorization.
2. `REOS_COUNTY_DATASET_INVENTORY_2026-11-07.csv`: one row per dataset, including source endpoint, endpoint property name, source health check, dry-run counts, and blockers.

## Evidence standard / current-vs-historical distinction

- `registry.json` holds historical `lastSuccessfulSyncAt` values from **dry runs**; the inventory **does not copy them into the verified live-ingest field**.
- The source health count is an upstream reported source count; it is **not** a count of imported or canonical REOS records.
- A generated manifest or `enabled:true` is **not** scheduling authority. A registry `PRODUCTION` label is **not** proof of current version, deployed identity, execution completion, authorization, or row-level ingest.
- For Philadelphia, the current scheduler has not been independently reconciled. Do not promote the last historical checkpoint to a passed production run.
- Static URLs are historical repository configuration, not freshly probed or validated against source semantics as of this inventory date. Delaware uses a host with `firstmaptest`; validate suitability independently before promotion.
- State-qualified path references reflect the namespace fix in PR #6. `registry.json` contains some *stale pre-fix* `connectorPath` values; the inventory uses the **actual repository tree**, not those outdated registry path strings.

## Strict promotion checklist

1. Capture actual deployed Apps Script identity and current source commit/hash, then reconcile its connector registration and explicit county allowlist with live scheduler configuration.
2. Verify the official current source and dataset semantics per county, including required county filters on statewide endpoints, schema, freshness, and transport availability; redact tokens and credentials.
3. Execute an isolated credential-free dry test with pinned input and a disposable datastore; demonstrate canonical record deduplication and replay behavior before any production-run request.
4. Confirm a separately approved per-county **production authorization record** with identity, approved dataset, controlled limits, owner/reviewer, expiry and rollback; no blanket approval based on `enabled:true`.
5. Independently reconcile a completed production run ID to immutable run logs, source record IDs, canonical `DISTRESS_LEADS` records and inserted/updated counts, with execution timestamps and 0 duplicate writes.
6. Keep the REOS acquisition safety gate: **no automatic MAO or offer when comp-supported ARV or adequate repair scope is missing**.

## Sources

- Feature branch registry: https://github.com/CMG-MyCrew/Real-Estate-OS/blob/feature/county-connectors/config/county-registry/registry.json
- County connector manifest directory: https://github.com/CMG-MyCrew/Real-Estate-OS/tree/feature/county-connectors/config/county-connectors
- Generated modules: https://github.com/CMG-MyCrew/Real-Estate-OS/tree/feature/county-connectors/src/connectors/generated
- SDK contract: https://github.com/CMG-MyCrew/Real-Estate-OS/blob/main/docs/COUNTY_CONNECTOR_SDK.md
- Namespace fix: https://github.com/CMG-MyCrew/Real-Estate-OS/pull/6
- Registration fix: https://github.com/CMG-MyCrew/Real-Estate-OS/pull/7
