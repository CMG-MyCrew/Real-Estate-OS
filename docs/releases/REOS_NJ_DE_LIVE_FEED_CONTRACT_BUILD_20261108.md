# REOS NJ/DE — 120-Slot Live Feed Contract Build (Staged / NO-GO)

**Date:** November 8, 2026  
**Branch:** `feature/nj-de-philadelphia-parity-shadow-20261108`, draft PR #11 stacked upon protected PR #10.  
**Release mode:** **LIVE-READY CONTRACT BUILD ONLY** — no live collection, API subscription, production feed execution, Google writes, or trigger installs.

## What was built

- `src/NJDELiveFeedContracts.gs` — pure Apps Script five-feed record normalizer: code violations, vacant properties, sheriff tax sales, sheriff mortgage sales, probate. The sheriff adapter supports a documented **licensed vendor JSON** shape with strict mortgage/tax separation, state/county validation, stable case/sheriff identifiers, sale status quarantine and strict cursor/page completeness. Any record is **not eligible** for `DISTRESS_LEADS`, MAO, offers or autonomous outreach until separately reviewed/certified.
- `scripts/test-nj-de-live-feed-contracts.mjs` — in-memory strict test fixtures. No calls to `UrlFetchApp`, Google, Gmail or live source. Detects missing identity, invalid state/county, mixed tax vs mortgage, unknown sale status, duplicate cases, page omissions, cursor loops, source-as-of drift and truncated quota pages.
- `scripts/reos-nj-de-live-feed-build-gate.py` — one-command, SHA-pinned, **offline-only** build of 120 NJ/DE county/feed source contracts, official discovery-reference mapping, current staggered six-hour plan, a license/permissions checklist and nonempty ZIP evidence. No recorded real source data is copied into the packet. Its `--live` option explicitly **refuses** activation.

## Licensed sheriff vendor candidate, not yet selected

Published documentation: https://www.sheriffsaledata.com/sheriff-sale-data-api. The provider documents a **paid Pro or Business API** with `GET /api/v1/sales`, `state`, `county`, `type`, and paginated `next_cursor`. Mortgage and tax categories can be mapped from `mortgage_foreclosure` and `tax_foreclosure`, respectively. The API has account quotas, license and coverage restrictions, and cancellation/stay gaps; this adapter is NOT an authorized source and must not be run without verified entitlement and permitted internal commercial use. Coverage by individual NJ/DE county remains unverified. Some provider pages list only a subset of NJ's 21 counties; do not assume statewide coverage. NEVER commit or paste a provider key.

The previously inspected Sussex County Sheriff's official HTML table remains a separate **read-only schema feasibility** candidate, not an approved 70-page crawler. Camden, Monmouth and Kent official pages link to CivilView, a separate third-party host whose automated use is not approved. New Castle's 403 must never be bypassed. No statewide source for county-level code violations, vacancy and probate has been certified.

## Requested operating result vs current actual result

The user's goal is **real NJ/DE distress leads in the existing 8 AM morning report, with six-hour county runs similar to Philadelphia**.

- The morning report ChatGPT automation already includes NJ/DE state headings and denotes live feed unavailability.
- The Apps Script NJ/DE morning digest module exists on **staged PR #11** but is not deployed.
- The existing 120 NJ/DE feed slots are all blocked pending source and destination approval. A working schema or synthetic test does not prove a case source exists or is legally permitted to be collected.
- Even after data sources are approved, real production work requires state-specific locks/checkpoint persistence, per-feed provenance and destination ACL, duplicate-safe replay, production execution endpoint closure from PR #10, and independent release approval.
- Pennsylvania production is unchanged.
- No MAO or offer authority without independently comp-supported ARV and an adequate repair scope.

**Release verdict:** `BUILD_CONTRACT_READY_SOURCE_CERTIFICATION_HOLD`. The builder's evidence is a software construction/review packet, not a successful live-ingestion run.
