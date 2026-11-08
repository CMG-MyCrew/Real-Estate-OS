# NJ Sussex Sheriff-Sale Schema — Independent Review

**Scope:** NJ-SUSSEX / `sheriff_mortgage_sales` — public read-only table evidence **only**.

## Evidence custody

- Operator upload: `REOS_NJ_SUSSEX_SCHEMA_READONLY_20261108T213413Z.zip`.
- **Independent ZIP SHA-256:** `d6e5f2bda7e1dd1d6795a38033d0c85822d49d9619e19cb313d881daddee860e` (**EXACT MATCH** to terminal log); ZIP CRC **PASS**.
- Member inspected: `source_schema_report.json` (single JSON entry; no HTML or case records).
- Source revision: `f0e0eef4156e07fd1e2088e6a3664a38965824fb`.
- Captured: `20261108T213413Z`.
- Official page: https://www.sussexcountysheriff.com/foreclosure-listings — 1 bounded public HTTPS GET, HTTP **200**.
- In-memory HTML: **616,520 bytes**; reported SHA256 `a79ed4d375a1287888cb26f0ac66df0404c1425665863070dc9a3291a5ef0982`. The raw HTML bytes were **not retained** in the evidence packet, so this is a reported page digest, **not an independently verified HTML digest**.

## Actual observed schema evidence

| Check | Observed evidence | Adjudication |
| --- | --- | --- |
| Table schema | `STRUCTURE_PARSABLE_UNCERTIFIED` | **Parser feasibility PASS** |
| Six required semantic fields | `case_id`, `docket_number`, `sale_date`, `address`, `city`, `status` | **All six present in parsed schema** |
| Case records accepted by parser | **10** | **Small live-page sample only**; not evidence of total inventory coverage |
| Uniqueness | `dedup_keys_unique=true` | **Within 10 sampled case IDs**, not cross-pagination or cross-day |
| Sale dates | `2026-12-02` through `2027-01-06` | **All future as of 2026-11-08**, but no cross-source freshness attestation |
| Sale status categories | `["open"]` | **Only OPEN observed**; adjournments, cancellations, completed sales not validated on live input |
| Synthetic malformed field/date/duplicate tests | PASS | **Offline assertions**, not a live-source certification |
| Raw records/names/addresses exported | 0 / false | **No raw case material retained** |
| Google requests / Apps Script executions / production writes | 0 / 0 / 0 | No production service touched in this execution |
| Trigger installs | 0 | Activation HOLD |
| Source access independently approved | false | **HOLD** |
| NJ/DE distress slots certified | **0 of 120** | All remain blocked |

## Independent decision

**APPROVE NEXT OFFLINE ENGINEERING STEP ONLY: synthetic record identity and lifecycle adapter contract.** Do not enable or call a production connector. This packet supports exact-table parser feasibility but **does not** establish full pagination coverage, stable case-ID semantics across updates, all sale-status transitions, record timeliness, official automated access approval, or correct county jurisdiction.

Before any live read-only **record-level** test beyond this bounded schema probe, obtain explicit source-owner/terms approval and confirm allowed access. Before write certification, additionally require:

1. County scope and provenance, exact case/docket identity, repeat-run idempotency, pagination completeness and terminal-state event semantics.
2. Separation of sheriff mortgage sales from tax sales, probate, assessment and inventory records.
3. Structured event destination and writer ACL; do not route inventory to `DISTRESS_LEADS`.
4. Independent historical API execution endpoint closure (13 deployments), effective OAuth client/scopes, Matthew/Scott/Sydney release sign-off.
5. Dedicated state scheduler authorization separate from Pennsylvania's five-feed scheduler.
6. No automated MAO/offer generation without independently comp-supported ARV and an adequate repair scope.

**Decision for production:** `NO_GO`. **Status:** `READ_ONLY_SCHEMA_FEASIBILITY_PASS_SOURCE_CERTIFICATION_HOLD`.
