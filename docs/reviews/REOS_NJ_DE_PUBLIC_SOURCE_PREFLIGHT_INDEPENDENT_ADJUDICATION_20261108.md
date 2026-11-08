# REOS NJ/DE — Independent sheriff/probate source-landing adjudication

**Evidence:** user-uploaded `REOS_NJ_DE_PUBLIC_SOURCE_PREFLIGHT_20261108T212106Z.zip`  
**Verified archive SHA-256:** `efa938b17e40fa8d6d4d2c7391b6afe700e047d0de64a4bd1eefd8e6a5171fea` — **exact match** to operator output. ZIP integrity/CRC **PASS**; two expected files parsed (`SUMMARY.txt`, `source_landing_evidence.json`).  
**Captured:** 2026-11-08T21:21:06Z. **Source pin:** `395609b3106e0d8cfdefae3ca4393a593b2027f2`.  
**Decision:** **read-only discovery evidence accepted; no feed certified, no NJ/DE trigger, no ingestion authority**. Draft PR #11 remains staged; protective PR #10 remains a blocking predecessor.

## Verified nine reference rows

| County | Proposed feed | Landing URL / description | Result | Source review decision |
| --- | --- | --- | --- | --- |
| NJ-CAMDEN | sheriff_mortgage_sales | County foreclosure sales information | HTTP **200**, 74,669 HTML bytes | **DISCOVERY PASS / NO SCHEMA APPROVAL**; actual sale listing linked externally to CivilView |
| NJ-MONMOUTH | sheriff_mortgage_sales | Sheriff's Office foreclosure sales | HTTP **200**, sample capped at 131,072 bytes | **DISCOVERY PASS / TRUNCATED**; actual sale list linked to CivilView |
| NJ-SUSSEX | sheriff_mortgage_sales | Sheriff's Office foreclosure listings | HTTP **200**, 131,072-byte sample capped (server reports 616,520 bytes) | **PRIORITY READ-ONLY SCHEMA CANDIDATE**; publicly displayed table, parsing still untested |
| DE-NEW-CASTLE | sheriff_mortgage_sales | County Sheriff's Sales landing | **HTTP 403** | **HOLD_ACCESS**; access blocked in this isolated client, alternative permitted channel or official contact needed |
| DE-NEW-CASTLE | sheriff_tax_sales | Same URL as above | **HTTP 403** | **HOLD_ACCESS**, do not bypass anti-bot/access restrictions |
| DE-KENT | sheriff_mortgage_sales | County Sheriff's Office landing | HTTP **200**, 118,467 HTML bytes | **DISCOVERY PASS / NO CASE SCHEMA**; sales listing linked to CivilView |
| DE-KENT | sheriff_tax_sales | Same County Sheriff's Office landing | HTTP **200**, 118,467 HTML bytes | **DISCOVERY PASS / TYPE SEPARATION REQUIRED**; tax/monition listings must be differentiated from mortgage |
| NJ-CAMDEN | probate | NJ courts surrogate-office directory PDF | **REFERENCE_ONLY**, not requested | **NO CASE FEED**, county surrogate record-source access needs separate attestation |
| DE-KENT | probate | DE courts general FAQ | **REFERENCE_ONLY**, not requested | **NO CASE FEED**, county Register of Wills case-source access needs separate attestation |

**Counting note:** seven GETs produced five HTTP-200 observations representing **four distinct official landing pages**. New Castle's same page returned 403 on two different feed intents. No sheriff-sale case records, probate records, or HTML bodies were stored in the uploaded ZIP; only HTTP metadata and digests were retained. The independent review of this ZIP made no Google or production requests.

## Independent official-site cross-checks, for discovery only

Official pages inspected through public read-only browsing:

- **NJ Camden:** official county information at https://www.camdencounty.com/service/sheriffs-office/foreclosure-sales-information/ explicitly links its **Sales Listing** to `https://salesweb.civilview.com/Sales/SalesSearch?countyId=1`. This is a third-party hosted list, **not** an official data API approval.
- **NJ Monmouth:** https://mcsonj.org/foreclosure-sales/ links its **Foreclosure Sales List** to `https://salesweb.civilview.com/Sales/SalesSearch?countyId=8`. Its disclaimer states list statuses change; the provider's access terms, pagination, identifiers, and freshness remain unverified.
- **NJ Sussex:** https://www.sussexcountysheriff.com/foreclosure-listings publicly displays case number, docket number, scheduled sale date, plaintiff, defendant, address, city, completed status, and related financial columns. A real tabular structure is visible but **the HTML selectors/DOM and executable pagination, anti-automation conditions, data completeness, source owner approval and change tracking have not been certified**.
- **DE Kent:** https://www.kentcountyde.gov/My-Government/Departments/Sheriffs-Office links **Current Sales List** to `https://salesweb.civilview.com/Sales/SalesSearch?countyId=4`, describes both foreclosure and **monition/tax** categories, and should map each to a distinct REOS feed after case-type verification.
- **DE New Castle:** `https://www.newcastlede.gov/172/Sheriff-Sales` returned HTTP 403 to the operator's bounded HTTPS client. This is a **client-specific access result**, not proof that the sheriff-sale records are unavailable to all users or that case-source access may be bypassed.
- **NJ and DE probate:** the staged court/surrogate resources are office directories or general references; they are not a probate docket event feed.

**CivilView routing is external to the previously permitted official-host allowlist.** Do **not** automatically add `salesweb.civilview.com` to any crawler or bypass 403/robots/terms. The external provider's legal/technical approval, stable dataset and schema, permissible machine access and actual owner must be independently confirmed. A public HTML table is not automatically an approved reusable API.

## Separate schema-certification decisions

| Next engineering gate | Source | Status | Required evidence |
| --- | --- | --- | --- |
| Read-only snapshot/DOM schema review | NJ-SUSSEX | **ELIGIBLE FOR INVESTIGATION, NOT LIVE USE** | Approved scope/access, exact column and stable case ID, validation of dates and sale status, sample completeness, fresh changes |
| Third-party listing-provider contract review | NJ-CAMDEN, NJ-MONMOUTH, DE-KENT | **HOLD_PROVIDER_ACCESS** | CivilView terms/permission, county mapping, records, idempotency and status semantics, separate tax/mortgage classification |
| Official access resolution | DE-NEW-CASTLE | **HOLD_ACCESS_403** | County contact or documented permitted alternative, no workaround to access controls |
| Probate record-source discovery | NJ/DE | **HOLD_NO_CASE_SOURCE** | County surrogate/Register of Wills case event source, access policy, record date/event identity, estate address matching, safeguards |
| County-level distress source rollout | Remaining NJ and DE | **HOLD_NO_SOURCE** | Authorized code, vacant, sheriff tax, sheriff mortgage and probate source for each specific county |

**Invariants that cannot be relaxed:** 21 NJ + 3 DE counties, 120 feed slots initially blocked, no NJ/DE triggers installed, no entry into `DISTRESS_LEADS` from parcel/assessment inventory, no mutation of PA scheduler or checkpoints, independent 13-deployment execution API closure and separate Matthew/Scott/Sydney release authorization. MAO and offers remain blocked without comp-supported ARV and adequate repair scope.

**Next expected work product:** one standalone **offline-only Sussex sheriff-sale schema/identity parser test harness**, using synthetic HTML fixtures or separately approved public snapshots. It must emit only schema/identity coverage metrics; no actual property records to production, and no claims of approved live connector status.
