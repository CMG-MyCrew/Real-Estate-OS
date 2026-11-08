# REOS NJ Sussex — Automated-access, pagination and sale-status coverage decision

**Date:** November 8, 2026  
**Decision:** **HOLD / NO-GO** for automated public collection, live NJ/DE ingestion, and triggers.

## Source findings

The official Sussex County Sheriff's Office [foreclosure listing](https://www.sussexcountysheriff.com/foreclosure-listings) is publicly visible and contains the required case number, docket, scheduled sale date, address, city and "Complete Status" fields. Prior user-verified HTTP 200 single-GET evidence independently established **10 valid rows** on the initial page only.

Further official page searches and read-only views show **pagination labels of 2/70 through 10/70**, with URLs such as `https://www.sussexcountysheriff.com/foreclosure-listings?comp-l20f0f0j_page=2`. This suggests **70 pages at the observed time**, but does **not** establish that every page is accessible, that page count remains constant during a scan, or that all 70 pages are part of the intended current/archived dataset.

Distinct published statuses observed in multiple displayed pages:

- **Open** — active/upcoming at time displayed.
- **Cancelled** — published cancellation, not necessarily permanent identity deletion.
- **Bankruptcy Hold** — must not be treated as actionable/sale-ready.
- **Sold to Plaintiff** — terminal-looking sale disposition, but verify source rules before classifying.
- **Sold to 3rd Party Purchaser** — distinct from sale to plaintiff.
- **Plaintiff Adjourned to 12/2/2026** — date embedded in text; requires parsing/explicit date semantics.
- **Defendant adjournments** are described in the county's procedures, but an actual tabular spelling and complete status vocabulary are **not certified**.

One historical archive record demonstrates **Plaintiff Adjourned to 2/15/2023**. The real-world status vocabulary is broader than the originally tested `open` sample and differs from the synthetic simplistic `adjourned` label. Additional statuses may exist. Unknown statuses must quarantine rather than be accepted silently.

The sheriff explicitly cautions that foreclosure listings can change at a moment's notice and directs users to its Foreclosure Unit to confirm a sale date. These are legal/operational constraints on relying on any time-sensitive observation.

## Permission and contact

**Automated-use permission has NOT been confirmed.** Official pages describing an online database and public listings do not visibly give explicit written authorization for repeated automated commercial collection or specified rate limits. The site's `robots.txt` could not be conclusively retrieved in the investigation; **even if permissive, robots.txt would not be source-owner permission or an agreement to reuse personal information**.

**Official contact:** Sussex County Sheriff's Office, Civil Process / Foreclosure Unit, 39 High Street, Newton, NJ 07860, **973-579-0850**. Published contact email: **civilprocess@sussexcountysheriff.com** (process services office contact, not a specifically attested bulk-data custodian).

REOS must seek a reply from the sheriff or authorized data custodian confirming:
- machine access permitted for REOS internal business use, permitted cadence/rate, terms/privacy/retention and lawful data reuse;
- official downloadable/API/OPRA alternative instead of HTML crawling, including full present/history coverage;
- dynamic page count, page size, archive scope, stable record identity, update timestamp, sale-status vocabulary and correction semantics;
- whether the agency approves polling 70+ pages at all and any limits on historical/closed cases.

## Engineering status

Added `scripts/reos-nj-sussex-access-pagination-status-gate.py` with:

- **No public HTTP request**, no Google credential/API, no Apps Script execution, no trigger installation, no case data export, no production writes;
- **70 synthetic pages / 700 synthetic identities**, with complete-page coverage, missing-page, duplicate-page, count-drift, case-ID duplication, blank-page and unknown-status fail-closed tests;
- normalizers for the **six observed example** public status values, including date-bearing plaintiff adjournment, with unknown statuses quarantined;
- a single ZIP containing `gate_report.json`, a **draft not-sent permission request**, and a human-readable HOLD summary.

This **does not certify** live page-by-page coverage or status transitions. A sheriff/authorized-custodian reply and separately authorized, rate-limited read-only pagination audit are prerequisite to claiming full coverage. Preserve NJ/DE 0/120 certified feeds, no NJ/DE triggers, Pennsylvania scheduler isolation, protective PR #10 13-API-deployment closure, and the MAO/offer ARV + repair evidence safety gate.

**Release decision: `NO_GO_AWAIT_WRITTEN_PERMISSION_AND_FULL_COVERAGE`.**
