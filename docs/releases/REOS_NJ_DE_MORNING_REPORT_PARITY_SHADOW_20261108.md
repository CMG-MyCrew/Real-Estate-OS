# REOS — NJ/DE County Morning Report Parity (shadow)

**Date:** 2026-11-08  
**GitHub branch:** `feature/nj-de-philadelphia-parity-shadow-20261108`  
**Release:** STAGED/NO PRODUCTION DEPLOYMENT  
**Morning report schedule:** Existing daily 08:00 America/New_York delivery is preserved.

## Existing morning paths inspected

- `src/Notifications.gs` defines **REOS Daily Digest**, which publishes the original dashboard totals (active leads, overdue tasks, active transactions, rental cash flow, monthly net profit) through `REOS.Notifications.dailyDigest()`; `src/Triggers.gs` has its daily digest installation contract at approximately **8 AM**.
- Actual existing digest messages were visible in the connected inbox. The repository digest source does **not** expose a separate county-by-county Philadelphia morning section. Do not claim that this staging change has matched an unseen Pennsylvania county report template verbatim.
- An existing separate **REOS Daily Acquisition** scheduled morning task was identified and **its prompt updated** to include explicit Philadelphia, NJ and DE reporting sections. It stays enabled at its existing daily **8 AM Eastern** schedule. This task-prompt update is separate from unmerged Apps Script source; it does not authorize or execute NJ/DE collectors.

## Staged Apps Script reporting behavior

`src/NJDEMorningReport.gs` adds a pure in-memory report model and a text appendix. Its only source is the staged deny-only six-hour NJ/DE schedule plan. It calls **no network, Google, Sheet, property record source, collector, trigger installer, email transport or offer generator**.

`src/Notifications.gs` appends that section to its **existing** `REOS Daily Digest` body *after* all current dashboard values, without changing the original subject, recipient lookup or existing business metrics. The change is **staged in draft PR #11 only**; no new email has been sent and the live Apps Script deployment is unchanged.

The resulting report indicates:

| Section | Expected morning observation | Truthful output now |
| --- | --- | --- |
| Pennsylvania / Philadelphia | Existing morning content preserved | No PA code or production scheduler source modified |
| New Jersey — 21 counties | Proposed 06:00 Eastern window, four planned six-hour local windows | 0/105 certified feeds; `NOT AVAILABLE` new leads; live checkpoint `NOT VERIFIED` |
| Delaware — 3 counties | Proposed 07:00 Eastern window, four planned six-hour local windows | 0/15 certified feeds; `NOT AVAILABLE` new leads; live checkpoint `NOT VERIFIED` |

**"Not available" is not "zero"** — the state feeds cannot substantiate an actual new-lead count. NJ assessment inventory and DE parcel inventory are not actionable distress signals. No offer amount or MAO is generated without independent comp-supported ARV and adequate repair scope.

The two per-state six-hour schedule plans, audit namespaces and mock cycle checkpoints are separate and continue to be blocked from production. The PA schedule, writer, checkpoint and production deployment are untouched.

## Sample appended text (not live)

```text
REOS COUNTY MORNING REPORT — NJ / DE
Source status: UNCERTIFIED — no live state feeds

New Jersey (NJ) — 21 counties / 105 planned distress-feed slots
Six-hour Eastern plan: 00:00, 06:00, 12:00, 18:00 | morning slot 06:00 (NOT INSTALLED)
Certified distress feeds: 0 of 105
New distress leads: NOT AVAILABLE — no certified live distress feed
Latest completed run: NOT VERIFIED
Current source: property_assessment (inventory, NOT a distress event)
Status: HOLD — no approved ingestion, no live county trigger

Delaware (DE) — 3 counties / 15 planned distress-feed slots
Six-hour Eastern plan: 01:00, 07:00, 13:00, 19:00 | morning slot 07:00 (NOT INSTALLED)
Certified distress feeds: 0 of 15
New distress leads: NOT AVAILABLE — no certified live distress feed
Latest completed run: NOT VERIFIED
Current source: parcel_inventory (inventory, NOT a distress event)
Status: HOLD — no approved ingestion, no live county trigger
```

## Regression and authority

`scripts/test-nj-de-morning-report-parity.mjs` loads the actual staged scheduler, report and Notifications modules into a Node VM with **mock Gmail and mock Sheets only**. It asserts the exact legacy digest lines remain unchanged, the subject and recipient behavior remain preserved, the two state sections are appended, no fake lead counts are provided, unapproved source drift fails closed, and a missing reporting module produces an explicit visible warning.

**No production trigger, real email dispatch or Google write is created by CI.** Protecting the 13 historical execution API deployments under PR #10, certifying actual NJ/DE distress sources, state locks/checkpoint writes and obtaining independent sign-offs remain mandatory before any real state feed or six-hour scheduler can go live.
