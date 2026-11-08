# REOS Enterprise — NJ/DE Philadelphia-Parity County Scheduler (SHADOW V1)

**Date:** November 8, 2026  
**Release state:** `STAGED_SIX_HOUR_OFFLINE_TESTED_NOT_DEPLOYED`  
**Approval authority:** `NONE`  
**Production operation:** `HOLD`  
**Stacked on:** NJ/DE deny-only protective release PR #10; do **not** merge or deploy until independent release gate.

## Purpose and what is actually implemented

This change supplies the same **five-feed orchestration contract** as the Philadelphia county scheduler while keeping New Jersey and Delaware **separate by state** and fail-closed.

| Property | Philadelphia baseline | New Jersey proposed | Delaware proposed |
| --- | --- | --- | --- |
| Feeds and order | code violations, vacant properties, sheriff tax, sheriff mortgage, probate | Exactly same five names/order | Exactly same five names/order |
| County scope | Philadelphia County | **21 counties** | **3 counties** |
| Five-feed slots | Five | **105** | **15** |
| Current generated connector type | Existing PA county sources | **Property assessments only** | **Parcel inventory only** |
| Live distress-source certification | PA scheduler still under separate five-feed certification | **0 of 105** | **0 of 15** |
| Trigger handler | Existing PA runtime **not touched** | `REOS_NJ_COUNTY_SCHEDULED_RUN` | `REOS_DE_COUNTY_SCHEDULED_RUN` |
| Six-hour local schedule proposal, America/New_York | Preserve existing PA schedule (no schedule change) | **12 AM / 6 AM / 12 PM / 6 PM** | **1 AM / 7 AM / 1 PM / 7 PM** |
| Cycles per day | Existing PA owner controls schedule | **4 shadow cycles/day** | **4 shadow cycles/day** |
| Feed-slot opportunities per day (not certified data pulls) | PA source unchanged | **105 × 4 = 420 blocked opportunities** | **15 × 4 = 60 blocked opportunities** |
| Cycle checkpoint keys | Existing PA keys untouched | NJ-only namespace + local date/time slot | DE-only namespace + local date/time slot |
| Production trigger installed | Existing PA state not changed | **No** | **No** |
| Production handler behavior | Existing PA code untouched | **Return HOLD, zero calls/writes** | **Return HOLD, zero calls/writes** |
| Checkpoint namespace | Existing PA ownership | `REOS_NJ_COUNTY_PARITY_SHADOW_CHECKPOINT_V1` | `REOS_DE_COUNTY_PARITY_SHADOW_CHECKPOINT_V1` |
| Audit namespace | Existing PA ownership | `REOS_NJ_COUNTY_PARITY_SHADOW_AUDIT_V1` | `REOS_DE_COUNTY_PARITY_SHADOW_AUDIT_V1` |

**Important:** Source parity and scheduling parity are **not** live feed equivalence. A parcel record or tax assessment cannot be labeled a code violation, vacancy, foreclosure, or probate signal. All 120 feed slots are explicitly `HOLD_NO_CERTIFIED_DISTRESS_SOURCE` with a null production endpoint and destination.

## Delivered code

- `src/NJDECountyParityScheduler.gs`: two state-specific public scheduled handlers and plan previews, hard-refusing trigger-install handlers, five-feed order, county plans, four local six-hour windows per day, and isolated **state / date / cycle** cursor/audit/checkpoint namespaces. These handlers are **inert in production** and do not call REOS CountyConnectorSDK, UrlFetchApp, PropertiesService, ScriptApp, or Sheets. There are **no trigger installation calls** in this source.
- `config/nj-de-six-hour-shadow-schedule.json`: machine-readable four-window proposal per state, staggered NJ/DE hours, state checkpoint/audit namespaces, no installed triggers, and no production authorization. The daily local wall-clock windows can be 5/7 hours apart in elapsed UTC time on daylight-saving transitions; final real-trigger implementation is **not certified**.
- `config/nj-de-philadelphia-parity-feed-catalog.json`: machine-readable inventory of all 24 county IDs and **120 disabled five-feed slots**, per-slot source/destination/idempotency certification gates, and a small set of official **discovery-only** references. URLs are **not wired as ingestion endpoints**.
- `scripts/test-nj-de-pa-parity-scheduler.mjs`: Node VM rehearsal with injected **in-memory only** IO, 21/3-county and 105/15-slot checks, five-feed order, **six-hour NJ/DE clock windows, unique per-cycle checkpoint keys, mock replay and wrong-slot checkpoint rejection**, cursor/page progression, state isolation, bounded 3-attempt quarantine, invalid state/source-record checks, and denial of premature production handlers/trigger installation. Mock records are not persisted to any production table.
- `.github/workflows/reos-nj-de-parity-scheduler.yml`: offline CI on the branch and PR, without runtime Google credentials.

**Six-hour parity scope:** This stages the schedule plan and mock checkpoint isolation only, not the Apps Script production trigger runtime. `rehearsalTick(state, mockIo, {mode:'OFFLINE_TEST', noRemoteServices:true, slotLocal:'2026-11-08T06:00'})` uses a per-state and per-cycle key. A repeated call to the same slot does not reset its checkpoint, while a later slot gets a different checkpoint. A production scheduler will require separately certified locks, time budgets, missed-window recovery, source authority, and idempotent writer controls. Neither NJ nor DE handler starts live execution.

Rehearsal is not a route to live ingestion: its `rehearsalTick` function requires a synthetic in-memory IO harness and a marked mock feed. It cannot call a real REOS connector by default. No read/write of production checkpoints or audit sheets occurs. The existing Pennsylvania scheduler source is not edited or redirected.

## Authoritative source discovery (not certifications)

Official public sources were checked for first-pass discovery **only**; they require county-by-county access, schema, provenance, currency, identity, refresh and legal/operational validation before becoming connectors:

| State / county | Candidate feed | Official entrypoint | Certification |
| --- | --- | --- | --- |
| NJ / Camden | Mortgage sheriff sales | https://www.camdencounty.com/service/sheriffs-office/foreclosure-sales-information/ | **NOT CERTIFIED** |
| NJ / Monmouth | Mortgage sheriff sales | https://mcsonj.org/foreclosure-sales/ | **NOT CERTIFIED** |
| NJ / Sussex | Mortgage sheriff sales | https://www.sussexcountysheriff.com/foreclosure-listings | **NOT CERTIFIED** |
| DE / New Castle | Mortgage sheriff sales and monition (tax) sales | https://www.newcastlede.gov/172/Sheriff-Sales | **NOT CERTIFIED** |
| DE / Kent | Mortgage sheriff sales and monition sales | https://www.kentcountyde.gov/My-Government/Departments/Sheriffs-Office | **NOT CERTIFIED** |
| NJ / all county surrogate offices | Probate discovery | https://www.njcourts.gov/sites/default/files/forms/12217_nj_surrogates.pdf | Directory **ONLY**, not an API |
| DE / all county Register of Wills offices | Probate discovery | https://www.courts.delaware.gov/help/general-faqs.aspx | Directory **ONLY**, not an API |

No blanket statewide equivalent of Philadelphia's municipal code-violation and vacant-building data is certified. New Jersey's statewide assessment/parcel data is **inventory data**, not an actionable distress event; municipal code enforcement requires local authority/source review. Delaware's DNREC environmental enforcement portal is **not a substitute** for municipal building-code violations.

## Future live release design — independent, separately approved

1. **Protect every historical execution path:** resolve the 13 execution-API deployments documented in PR #10, including V4 and the versionless deployment. A single new Apps Script version does not rewrite historical deployment bindings.
2. **Certify feed source per county / dataset:** scope, official source identity, update cadence, pagination and retry, legally permitted access, evidence/provenance and stable record IDs. Missing feeds remain HOLD and are skipped, not marked successful.
3. **Separate canonical inventory storage from distress leads:** NJ assessment and DE parcel inventory must never be inserted into `DISTRESS_LEADS` as distress events; only certified distress records may enter approved targets after schema, ACL and immutable identity validation.
4. **Approval and credential boundaries:** Matthew as custodian, Scott/Sydney separate reviewers, pinned Apps Script/GCP OAuth principal and effective scopes, deployment ownership, source and release hash approvals, NJ/DE county authority and trigger authorization. No speculative bypass of permissions.
5. **State-specific independent scheduler enablement:** after approval, implement the genuine production read/fetch/write/checkpoint mechanism with stable per-state keys, bounded concurrency and per-feed backoff, live source logging, independent status and alerts. The two proposed handlers **currently remain inert**.
6. **PA and offer safety:** preserve the existing five-feed Pennsylvania trigger, checkpoint and source; never install an all-connector global trigger. No MAO or offer authority unless independently comp-supported ARV and adequate repair scope exist.

## Independent acceptance evidence

Expected automated success markers:
`NJ_21_COUNTIES_105_FEED_SLOTS=PASS`, `DE_3_COUNTIES_15_FEED_SLOTS=PASS`,
`PA_FIVE_FEED_ORDER_AND_STATE_ISOLATION=PASS`,
`CATALOG_120_SLOTS_ALL_FAIL_CLOSED=PASS`,
`PRODUCTION_HANDLERS_AND_TRIGGER_INSTALL_FAIL_CLOSED=PASS`,
`PAGINATION_CURSOR_CHECKPOINT_AND_AUDIT_REHEARSAL=PASS`,
`FAIL_CLOSED_RETRIES_IDENTITY_VALIDATION_QUARANTINE=PASS`, `OFFLINE_PHILADELPHIA_PARITY_TESTS=ALL_PASS`.

Additional six-hour schedule acceptance checks: `NJ_DE_SIX_HOUR_LOCAL_CADENCE_STAGGER=PASS`, `SCHEDULE_CONFIG_MATCHES_TWO_STATE_RUNTIME=PASS`, `EIGHT_DAILY_WINDOWS_DST_AND_SCOPE_VALIDATION=PASS`, `SIX_HOUR_PER_CYCLE_CHECKPOINT_REPLAY_AND_NO_CROSS_STATE_WRITES=PASS`.

**This implementation stages a safe scheduler framework. It does not claim 120 operational public feeds, installed triggers, Google authorization, current production data, or certified acquisition lead generation.**
