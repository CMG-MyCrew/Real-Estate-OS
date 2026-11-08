# REOS NJ/DE — 120-Slot Feed Build Independent Adjudication

**Review date:** 2026-11-08.  
**Disposition:** `OFFLINE_CONTRACT_BUILD_VERIFIED — LIVE_SOURCE_AND_PRODUCTION_NO_GO`.  
**Source Git pin in uploaded receipt:** `db02e525fdef5ab0a5b8180ff54c00ce3cafc0c5`.

## Independently inspected artifact

- Uploaded ZIP: `REOS_NJ_DE_LIVE_FEED_BUILD_GATE_20261108T231712Z.zip`.
- **Independently computed SHA-256:** `9365bf9a4706326b3262084e90b3a0f6e63396a3c5227481440a3720fea62f67` — exact match to the operator's terminal output.
- ZIP integrity: `testzip() = None` (all member CRCs PASS); ZIP length: **4,392 bytes**.
- Five members present and **nonempty**: `SUMMARY.txt` (381 bytes), `build_report.json` (1,548 bytes), `county_feed_source_matrix.csv` (28,341 bytes), `source_approval_request_DRAFT_NOT_SENT.txt` (1,106 bytes), and `offline_regression_receipts.txt` (1,646 bytes).
- `build_report.json` parsed as JSON and `county_feed_source_matrix.csv` parsed as CSV.

## Exact source-matrix findings

| Scope | NJ | DE | Total |
| --- | ---: | ---: | ---: |
| Counties | 21 | 3 | 24 |
| Five-feed slots | 105 | 15 | **120** |
| Sheriff tax / mortgage API **candidate** slots | 42 | 6 | **48** |
| Code / vacancy / probate slots requiring official sources | 63 | 9 | **72** |
| Currently certified live feeds | 0 | 0 | **0** |

All five feed classes have 24 slots each: `code_violations`, `vacant_properties`, `sheriff_tax_sales`, `sheriff_mortgage_sales`, and `probate`.

**Important: candidate slots are not coverage guarantees.** The 48 sheriff slots are classified uniformly as `LICENSED_SHERIFF_JSON_API_CANDIDATE`, but provider state/county coverage and paid commercial-use licensing are explicitly `NOT_ATTESTED`. There is no evidence that the API returns cases in each named county or that the hypothetical mapped schema is identical to licensed production payloads.

**Exactly nine** source matrix rows have an official discovery reference (seven distinct URL values, because DE Kent and New Castle list both mortgage/tax references to the same page). **111** rows have no official landing-page reference in this packet. The nine references are **discovery-only**, not certified record-level feeds, APIs, source permissions, or working ingestion endpoints.

Nine referenced slots:

1. NJ Camden sheriff mortgage;
2. NJ Camden probate (NJ courts surrogate directory, not cases);
3. NJ Monmouth sheriff mortgage;
4. NJ Sussex sheriff mortgage;
5. DE Kent sheriff tax;
6. DE Kent sheriff mortgage;
7. DE Kent probate (court FAQs, not cases);
8. DE New Castle sheriff tax;
9. DE New Castle sheriff mortgage.

The existing Sussex first-page schema probe (10 rows in prior independently inspected packet) was read-only **feasibility only**; it is not proof of 70-page live coverage or permitted recurring crawling. Delaware New Castle had an HTTP 403 result in previous separate source preflight evidence; do not bypass it.

## Regression receipts inspected

- State/cycle scheduler and five-feed parity: PASS, with **NJ 00/06/12/18** and **DE 01/07/13/19** Eastern proposed wall-clock windows; state checkpoints isolated in mock.
- NJ/DE morning report appendix and preservation of the original REOS Daily Digest text: PASS in **mock Gmail and mock Sheets only**.
- Licensed sheriff API schema/cursor fixture tests: PASS for tax/mortgage separation, required IDs, duplicate/cursor/drift/quota failures and status quarantine.
- Code/vacancy/probate event fixtures: PASS for required source ID/provenance, but **not real source ingestion**.

## Authorization and production decision

The packet explicitly reports `certified_live_distress_feeds=0`, `live_source_requests=0`, `google_requests=0`, `real_property_records_exported=0`, `trigger_installs=0`, `sheet_writes=0`, `PA_production_mutations=0`; `MAO_offers=BLOCKED`.

The `source_approval_request_DRAFT_NOT_SENT.txt` is an **unsent draft**. It does not prove access permission or an approved vendor subscription. The source schema and cursor fixture tests do not establish authenticated API response compatibility, provider rate limits, event lifecycle completeness, county coverage, source ownership or reuse terms.

**Decision:** Accept offline contract artifact integrity and internal source matrix completeness. Reject all NJ/DE live ingestion, production six-hour triggers, automatic morning *lead counts*, unrestricted access to external sources, and automatic offers until permission, per-county scope, real schema/record identity, status/pagination, API endpoint protection, state locks, durable checkpoints, least-privilege ACLs and independent release approvals are attested. Existing PA production remains untouched. Never treat missing new-lead data as `0`; use `NOT AVAILABLE / SOURCE CERTIFICATION HOLD`.

**Smallest safe next move:** obtain explicit provider and source-owner use authorization, provider-supported NJ/DE county coverage, a redacted official schema/status example, and an approved rate/cadence; then implement a separately approved, bounded **read-only** source conformance test without activating production.
