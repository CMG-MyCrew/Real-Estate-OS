# REOS Enterprise — NJ/DE Independent Production Attestation Review

**Review date:** 2026-11-08  
**Decision:** **NO-GO / HOLD** for live NJ/DE ingestion; no MAO/offer authority.  
**Evidence reviewed:** User-uploaded `REOS_NJ_DE_PRODUCTION_ATTESTATION_20261108T171337Z.zip`.  
**ZIP SHA-256 independently verified:** `68c149cf4624f8ffce124d26a15199295cfdf13fcd42ca14d381d6335137e882`.  
**Archive CRC/integrity:** PASS; archive consists of `attestation.json`, `SUMMARY.txt`, and `README.txt`.  
**Capture time:** `2026-11-08T17:13:37.647287+00:00`.

## Proven evidence and limits

| Attestation item | Result | Independent interpretation |
| --- | --- | --- |
| Source preflight (earlier operator run) | 199/199 checks, 24/24 GIS count-only queries | Source/static tests only; does not grant live authorization |
| Production identity | PASS | Existing authenticated Google principal and bound production Apps Script project reported as correct |
| Deployed immutable version | PASS, V167 | 13 deployments listed; pinned execution API deployment references V167 |
| Production scheduler HEAD vs V167 | PASS | Matching SHA-256 `7b850103cd0a5b7dd2d2cc6776f2c92c55ae7bf2107336417b8b5b956b2cc855` for `CountyProductionScheduler`; **not** full source tree parity |
| PA five-feed static source allowlist | PASS | Ordered `code_violations > vacant_properties > sheriff_tax_sales > sheriff_mortgage_sales > probate`; live scheduler/trigger isolation still NOT_ATTESTED |
| NJ/DE connector exposure | **HOLD** | Immutable V167 lists **24 generated NJ/DE connectors** and **no explicit NJ/DE live guard**; presence does not alone prove an invocation occurred |
| OAuth client project | NOT_ATTESTED | Fingerprint absent/mismatched with pinned Cloud project; user identity PASS is a distinct test. No sensitive token data in review ZIP |
| Sheets read under attestor profile | HTTP 403 | Exact reason/scope not provided; **do not assume missing spreadsheet or necessarily missing permission** |
| Google Drive workbook custody | PASS | Drive metadata reports owner `bjssnc3@gmail.com`, canEdit true, 3 permissions returned; **not** NJ/DE writer ACL approval |
| Getter executions | 0 | No runtime status/checkpoint/provenance attested; skipped due to OAuth client fingerprint guard |
| Original attestor status | 14 PASS / 9 NOT_ATTESTED | No GO decision and no production writes reported; ZIP has summarized findings, not independently replayable raw Google API receipts |
| Review state | Draft, unmerged | GitHub PR #9 protects branch-level source changes but has **not** changed the V167 deployment |

### Independent corroboration from connected Google Drive

The linked Google principal identifies as `bjssnc3@gmail.com`. A separate connected Drive/Sheets read confirmed the exact workbook `REOS Enterprise v3.2.6` (`1N_5Saw8paJbUZ3FYWr2LmqMDV5qcHSNHda6RoxyqNTU`) is accessible, with 198 tabs, including `DISTRESS_LEADS`, `COUNTY_CONNECTOR_RUNS`, and `PHILA_PROBATE`. Bounded header reads returned **52** and **19** columns for the first two tabs. This corroborates workbook existence/schema only: the existing clasp OAuth profile encountered HTTP 403, and no source-traceable NJ/DE live write, ACL, idempotency, or downstream authorization was certified.

## Critical risk: installed source vs staged guard

Attestation JSON `actual_script_source` reports:

- `v167_file_count=481`
- `NJ_DE_generated_connector_count_in_V167=24`
- `explicit_NJ_DE_live_guard_in_V167=false`
- Immutable and HEAD PA scheduler hashes match; this does **not** imply that V167 has the newer GitHub SDK guard.

The reviewed draft SDK source in PR #9 blocks live NJ/DE runs via `NJ_DE_PRODUCTION_APPROVAL_REQUIRED`, prevents live `parcel_inventory` and `property_assessment` from writing to `DISTRESS_LEADS`, and suppresses audit/ID changes for dry-runs. These controls are only staged in GitHub. The existing commands source includes `REOS_COUNTY_SYNC_ALL` and `REOS_COUNTY_TERMINAL_SYNC` live routes; `REOS_COUNTY_INSTALL_DAILY_TRIGGER` names the all-connector handler. Whether those entrypoints are reachable under production V167 and what triggers currently exist require **runtime evidence**. Do not run these paths or install their triggers during this review.

**Immediate operating rule:** no NJ/DE live sync, no all-county live sync, no new daily trigger, no mutating Apps Script functions, no production permission promotion. Preserve the Pennsylvania five-feed scheduler and checkpoint in place.

## One consolidated corrective decision path

1. **Credential/diagnostic closure (read-only first).** Reconcile the clasp credential's effective OAuth client project with pinned project `761052091881` without exposing client secret, access token, or refresh token. Determine the Sheets HTTP 403 reason from a redacted response/code or independently authorized scope metadata, not repeated unauthorized writes. Keep `scripts.run` blocked until correct client identity, immutable V167 getters, and execution API permissions are verified. A separate connected Google Sheets principal reading the workbook does **not** cure the clasp profile's HTTP 403.
2. **Protect the deployed write surface before any activation.** Independently map V167 `CountyConnectorSDK`, generated NJ/DE registrations, terminal/live entrypoints and installed triggers. If live NJ/DE paths are reachable, a controlled **deny-only, fail-closed safety promotion** must be authorized and implemented as a separately versioned release, with exact source hashes, before any feed enablement. Never patch or overwrite V167 in place. Prevent any live `parcel_inventory` or `property_assessment` from `DISTRESS_LEADS`. If this cannot be certified, retain HOLD and refrain from those execution paths.
3. **Authorization/documented custody.** Obtain explicit signed 21-county NJ and 3-county DE scope, source/terms, writer account and data-destination approval. Preserve Matthew as independent custodian and Scott/Sydney as separate reviewers; record signers, scope, immutable hashes, rollback authority and approval time. GitHub PR approval or an existing PA scope does not substitute for NJ/DE production approval.
4. **Canonical staging/data integrity.** Define and approve a separate `COUNTY_PARCEL_INVENTORY`-class evidence sink with schema, stable natural keys (state+county+dataset+record ID), deduplication, idempotent replay, checksum/source timestamps, record-level rejects, and bounded rollback. Do not treat a parcel ID as a distress signal. Delaware needs verified address/owner linkage, authoritative distress evidence and reconciliation before promotion of specific properties to review leads.
5. **PA isolation and post-change verification.** Read-only attest trigger handler/owner/effective principal and checkpoint/ledger stable snapshots. Prove the existing PA five-feed order and pending cursor unchanged. Any future separately approved protective release requires new version/source/deployment parity and regression evidence; it must **leave NJ/DE live disabled** until data and reviewer gates pass.

## Explicit no-release conditions

- **NJ/DE LIVE INGESTION = HOLD**
- **PA scheduler/trigger changes = PROHIBITED in this review**
- **GitHub PR #9 = DRAFT / NOT MERGED**
- **MAO AND OFFER GENERATION = BLOCKED** absent independently comp-supported ARV and adequate repair scope, even if a county connector later passes.
- **No automatic gate removal** from a PASS count; documentary custody and live runtime safety evidence are mandatory.

## Evidence provenance

- Primary user-provided ZIP: `REOS_NJ_DE_PRODUCTION_ATTESTATION_20261108T171337Z.zip`, verified SHA above.
- Staged code reviewed in `CMG-MyCrew/Real-Estate-OS` PR #9, at source commit `1d32d1b072d4bc2b2015bb11ec4dac4eed73a7b7`.
- Independently read-only observed connected Google Drive/Sheets header metadata; no production mutations made by this review.
