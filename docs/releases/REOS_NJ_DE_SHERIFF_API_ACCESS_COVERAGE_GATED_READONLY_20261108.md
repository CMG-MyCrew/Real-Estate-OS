# REOS — NJ/DE Sheriff Sale Provider Access, County Coverage, and Read-only Source Conformance Gate

**Date:** 2026-11-08  
**Branch:** `feature/nj-de-philadelphia-parity-shadow-20261108`; draft PR #11, unmerged, stacked on protective PR #10.  
**Decision:** Source-access gate built and tested offline; **no real provider calls, account rights, real-source conformance or full county coverage have been proven in CI**.

## Why a gated paid API rather than website crawling

The public vendor documentation at https://www.sheriffsaledata.com/sheriff-sale-data-api lists a versioned, read-only JSON API:

- `GET /api/v1/me`: account, plan, payment/trial/API availability (free).
- `GET /api/v1/states/NJ/counties` and `/states/DE/counties`: provider's **exact county names** at its stated `data_as_of` (free).
- `GET /api/v1/sales/count?state=...&county=...&type=...&status=all`: authoritative **provider search-count** results per covered county and mortgage/tax type at `data_as_of` (free); these counts do not prove legal or sheriff-record completeness.
- `GET /api/v1/sales?state=...&county=...&type=...&status=all&limit=1`: a **metered sample of at most one sale per state**, never a full crawl. The live JSON is piped only in memory to the staged Apps Script parser in Node's VM; no raw parties, property addresses, court identifiers, keys or whole sale objects are saved.

The [Terms of Service](https://www.sheriffsaledata.com/terms) effective November 1, 2026, permit API data use for the subscriber's **own business**, subject to a paid active **Pro or Business** plan, quotas and restrictions. No resale, bulk republication, third-party database/service operation, disallowed credit/insurance/employment/housing eligibility decisions or harassment. A distinct downstream commercial data product needs an expanded license. These vendor API rights **do not authorize scraping any county sheriff/CivilView website**. No access rights can be established merely by passing a local script test.

## Single-command staged procedure

`scripts/reos-nj-de-provider-permission-coverage-readonly.py` must run only from an exact Git SHA-pinned clone. Its default interactive flow:

1. Verify the source pin, 21-NJ/3-DE county registry, and no-live/PA immutability flags; perform **offline** county matching, duplicate/missing-county fail-closed tests and the Node real-page adapter fixture tests.
2. Ask operator to type `I_CONFIRM_OWN_BUSINESS_API_USE` to affirm this account/data are used within the vendor's own-business terms. Decline or absent terminal => **zero requests**, evidence packet still generated.
3. Ask for private API key with **hidden terminal input**; do not enter a key into GitHub, ChatGPT, argument list or artifact. An existing `SHERIFFSALEDATA_API_KEY` environment value is supported but never printed.
4. Verify actual `/me` response: paid Pro/Business, nontrial, active, `api.keys=true` and `api.records=true`.
5. Fetch both county lists and compare exact normalized county identities against all 24 expected REOS county IDs; preserve missing counties as `NOT_LISTED_IN_PROVIDER`.
6. Fetch at most 48 free `/sales/count` requests (one for tax and mortgage each listed county), checking query filter echoes and source `data_as_of` consistency. Maximum **51 free GETs including /me and county lists**, no metered sales yet. Each row in the 24-county matrix carries provider coverage, mortgage/tax source count and evidence date. A zero result means **zero current provider matches for that query**, not no foreclosure or no investment opportunities in the county.
7. Require a **separate** `TEST_UP_TO_2_RECORDS` confirmation. Only if the account usage `day.remaining` and `month.remaining` are each at least 2, fetch at most one `limit=1` /sales page per state from a county/type with a nonzero provider count. **Up to two real sale records may count toward the subscriber's monthly allowance.**
8. Pipe the record through `scripts/reos-nj-de-provider-real-page-conformance.mjs`, which loads `src/NJDELiveFeedContracts.gs` into a sandboxed Node VM and emits **only** status category, schema result, source date, state/working county, and zero-write flags. Reject unexpected case state, county, feed, bad identity, unknown status, quota truncation and malformed date. The sample does **not** traverse another page, certify pagination completeness or activate the 48 sheriff slots.
9. Generate a local, ZIP CRC-validated and SHA-256-stamped packet with `access_coverage_report.json`, `nj_de_24_county_48_sale_type_matrix.csv`, `SUMMARY.txt` and `REVIEW_AND_APPROVAL_NEXT_ACTION.txt`. No API key, account name/email, defendant, address or other actual case data is exported.
10. Exit in **NO-GO production** mode. No Google services, Apps Script triggers, PA scheduler or CRM/Sheet writes are attempted.

## Independent offline CI

- `scripts/reos-nj-de-provider-real-page-conformance.mjs --fixture-test`: synthetic NJ mortgage/DE tax data, scope and status quarantine.
- `scripts/reos-nj-de-provider-permission-coverage-readonly.py --self-test`: county normalization, duplicate/missing test and fixture adapter.
- `scripts/test-nj-de-provider-access-full-path-offline.py`: **entire simulated** paid plan, 21+3 county lists, 48 distinct mortgage/tax count results, up to two vendor-shaped single-sale conformance calls, no credential retention, provider county omission, account not ready, filtered-count mismatch and `data_as_of` drift; no network or data persistence.

## Interpreting the outcome

| Outcome | Meaning |
| --- | --- |
| `OPERATOR_ATTESTATION_NOT_PROVIDED` or `NO_PROVIDER_KEY_SUPPLIED` | No real provider requests made; account authorization unavailable |
| `API_PLAN_NOT_ACTIVE_OR_API_NOT_ENABLED` | Provider rejected the entitlement gate |
| `COUNTY_TYPE_COUNT_DATE_DRIFT_NO_METERED_SAMPLE` | Source dates differ; full point-in-time count proof withheld |
| `COVERAGE_VERIFIED_SAMPLE_DECLINED` | Coverage/count facts obtained, but no paid real record sampled |
| `BOUNDED_PROVIDER_SAMPLE_ATTEMPTED_REVIEW_REQUIRED` | Up to one real record per state passed or failed the actual staged adapter; inspect per-state result |
| `READ_ONLY_VERIFICATION_FAILED_CLOSED` | Any access, source-schema, query-filter, transport or account error; no activation |

**Never interpret provider support, successful `/me`, positive sale counts, or a one-page schema pass as 120 certified NJ/DE distress feeds.** All 120 feed slots remain HOLD, no six-hour live triggers are installed, the morning report must show `NOT AVAILABLE` for unverified NJ/DE leads, and offers remain blocked unless independent comp-supported ARV and adequate repair scope exist. A separately reviewed release must close PR #10 historical Apps Script execution paths, certify permissions/record completeness/status lifecycle, approved destinations and per-state durable checkpoints before actual ingestion.
