# REOS NJ/DE — Independent API Deployment Matrix Adjudication

**Evidence capture:** 2026-11-08T18:28:20Z  
**Independent archive check:** `REOS_NJ_DE_API_MATRIX_20261108T182820Z.zip` SHA-256 **732d7fc36f1782432733bedd2234009fce0060ce53b89b64272adeaa00c8b196**; ZIP CRC **PASS**; both `SUMMARY.txt` and `compatibility_matrix.json` parsed.  
**GitHub source pin represented by evidence:** `a8bd7fac16e16fb222376222bd3cbc652aac3d97`.  
**Decision:** **NO-GO / HOLD** for release, NJ/DE ingestion and MAO/offers. All dispositions below are **recommendations, NOT executed changes**.

## Reconciled evidence

| Measurement | Independently verified from ZIP |
| --- | --- |
| Execution-API deployment IDs | **13** |
| Alternate deployment IDs relative to pinned V167 | **12** |
| Distinct readable immutable source versions | **12** |
| Versionless/unverified API endpoint | **1** |
| Potentially exposed NJ/DE source (including V167) | **11** |
| No generated NJ/DE connectors, other writers still unknown | **1** (V4) |
| Deployments flagged for compatibility review (includes V167 lexical inventory uncertainty) | **12** |
| Complete HEAD = immutable V167 | **PASS** |
| V167 candidate source changes | **25 / 481 files**; 24 NJ/DE connector manifests disabled |
| Google GETs | **17** |
| OAuth refresh | **1**, in memory |
| Apps Script executions / remote write attempts | **0 / 0** |
| Credential files changed | **FALSE** |
| Confirmed release approvals, OAuth client project + writer grants | **NOT ATTESTED** |

The matrix inventories static code/manifest sources, not actual executed calls, complete export surfaces, or connected API client ownership. "Potential exposure" **does not establish that a deployment has been used for NJ/DE live ingestion**. Conversely, no observed execution is **not** a proof of safety. No deployment was changed.

## Required endpoint-by-endpoint disposition

**Classification key:**
- **PROTECT CANDIDATE / HOLD:** V167 can be source-patched by the reviewed 25-file guard, **only as part of a separately approved closure of every exposed execution path**.
- **LEGACY QUARANTINE REVIEW:** do not repoint, retire, disable or delete until caller identities, ownership, manifests, behavioral compatibility, access and rollback have been independently verified. Quarantine is a required operational decision, **not a change already performed**.
- **UNKNOWN QUARANTINE REVIEW:** first establish whether a versionless API endpoint resolves to HEAD or other effective source and who calls it; refuse mutations in the meantime.
- **V4 LEGACY PRESERVATION REVIEW:** do not repoint to V167 candidate because older APIs would be removed; look for live clients and legacy offer pipeline safeguards before separately authorized retirement or version-preserving protection.

| # | Deployment ID | Version | NJ/DE generated | Source compatibility with protected V167 candidate | Proposed disposition |
| --- | --- | --- | --- | --- | --- |
| 1 | `AKfycbxlWu9Ge9nhxgO6vaXCukhznVX9aR0GKOI1PMjsIKY` | **Unspecified** | Unverified | Effective source, exported API and consumers unknown | **UNKNOWN QUARANTINE REVIEW** |
| 2 | `AKfycbxekcfit01ag89qSfFeCpLfz8gUUx-PpanX-BV5NmLHkET33Jay2cxdmJWk04S8TKk7` | V39 | 24 | 41 changed, 120 new source files; older manifest | **LEGACY QUARANTINE REVIEW** |
| 3 | `AKfycbyR-bbtcu5J3qoyJICl41YxlIkwmL0s8Q8gboN6DppvWaYgILs_WiV6Oy1jJ6WRb6Ga` | V44 | 24 | 42 changed, 116 new source files; older manifest | **LEGACY QUARANTINE REVIEW** |
| 4 | `AKfycbwLtLKwf1ei39_v27MzxD7V56D2fbg6alyuFSqaupB0imIIbaqYFK5yDmXJePAUcM9G` | V38 | 24 | 41 changed, 121 new source files; older manifest | **LEGACY QUARANTINE REVIEW** |
| 5 | `AKfycbzXnlt6wEGvW9aArEBOMhAl7w0cx4OKl_dHHr8NjqOH9LM54m7J1POf9zoW7Hzy8rR9` | V37 | 24 | 41 changed, 122 new source files; older manifest | **LEGACY QUARANTINE REVIEW** |
| 6 | `AKfycbwuvwySv8oo1FqRdTFuzA_13buFtBOIyVdeHDj6sfYd0AFeAgKC_Qd-Yi81pCH0Ajpw` | V45 | 24 | 41 changed, 114 new source files; older manifest | **LEGACY QUARANTINE REVIEW** |
| 7 | `AKfycbxGn46c72lsM0g8AbIyPNDdbPy4kVhamIyI5XdVU-cDM-RwnDzaiQb9cs-D8bYyTU1a` | V42 | 24 | 42 changed, 117 new source files; older manifest | **LEGACY QUARANTINE REVIEW** |
| 8 | `AKfycbxzKXr8B1FuKbp1fCxMpn9YSrZ_drEmWEYFbu4ntntmSB1Fc9E9hZiCkjV4HnqM22v1` | V36 | 24 | 41 changed, 123 new source files; older manifest | **LEGACY QUARANTINE REVIEW** |
| 9 | `AKfycbxTPu2haRrW9Ls0mkRV4uambT5ajC5RlNC5m7IBxPlcmspVjF5DGdNxOG4pCzjQbHeX` | **V167** | 24 | **Exactly 25 changed, 0 added, 0 removed source files, same manifest** | **PROTECT CANDIDATE / HOLD** |
| 10 | `AKfycbxSMHoqgYyxvS1u9OJvwg8Y-ROQTQwx81GNnEpvxNr5WjbExRSOCpRIbRuUiE6rAdo` | V41 | 24 | 42 changed, 117 new source files; older manifest | **LEGACY QUARANTINE REVIEW** |
| 11 | `AKfycbzqia63JL-zyoRUFt99LN22sEVxgpodovIIbP-4szRIB6u_RvLhBuZhJ50uqe1FlzIf` | V43 | 24 | 43 changed, 116 new source files; older manifest | **LEGACY QUARANTINE REVIEW** |
| 12 | `AKfycbyRD5WMgkfytK7IUUs4ybjLtzG9sJcsCXeew5NDQiWAv5t__uKp2kkq93fGH5xTgiQj` | V40 | 24 | 41 changed, 118 new source files; older manifest | **LEGACY QUARANTINE REVIEW** |
| 13 | `AKfycbxJfDXkXTPWhIDvc9rLmC2pOJKNAgGUjKMple9QXlzHNiWnkJgBt52G2OFVKpY9fLsE` | **V4** | **0** | **27 exported names missing, 8 original source files missing, 35 changed files, different manifest** | **V4 LEGACY PRESERVATION REVIEW** |

### Why the V36–V45 group is not automatically compatible

The 10 historical versions report between **826 and 837** observed callable-function names. The lexical/functionSet comparison returned **0 missing names** when compared with protected V167, but these are only a subset of API-compatibility requirements. Each old version has 41–43 changed files and 114–123 new files if replaced with V167. All V36–V45 manifests have 10 OAuth scopes and `V8`, but differ from V167 in their manifest SHA; V167 has **one enabled advanced service**, while V36–V45 have **zero**. Similar function names **do not prove equivalent behavior, permissions, client contract or scheduler behavior**. **No automatic repoint**.

### V4 is especially sensitive

The V4 to protected V167 comparison found **27 functions missing**, including `aiAsk`, `documentsCreateChecklist`, `documentsForRecord`, `documentsSearch`, `propertiesCreate`, `propertiesSearch`, multiple `reosAutonomousOfferPipeline*` functions, and offer-execution validation functions. Eight original source files are absent from the candidate and its manifest has **0 explicit OAuth scopes**, versus 10 on V167. Removing these APIs could disrupt an existing consumer; their presence is not proof of authorized automated offers. **Do not repoint or automatically retire V4.** Audit any consumer and preserve the acquisition safety gate requiring comp-supported ARV and sufficient repair scope.

### Unversioned endpoint is the highest uncertainty

`AKfycbxlWu9Ge9nhxgO6vaXCukhznVX9aR0GKOI1PMjsIKY` has no valid numeric `deploymentConfig.versionNumber` in the evidence. It may behave differently from fixed immutable-version deployments, and **its effective execution binding must be independently established**; do not assume it is harmless or equivalent to V167.

## What must happen before a production protective release

1. **Endpoint / consumer evidence:** enumerate each deployment's owner, external callers, clients, service accounts, invocation patterns, manifest contract and functional dependencies with the minimal read-only permissions available. Static function names are insufficient.
2. **Disposition approval:** Matthew as independent custodian and Scott/Sydney as distinct reviewers must approve a signed decision for every endpoint: a precise version-preserving guard, approved retirement after consumer proof, or a documented operational quarantine. Neither V4 nor the unversioned endpoint may be silently transformed.
3. **Runtime authorization:** establish the actual OAuth client-to-GCP project binding and **effective token scopes**, not a guess from missing local token metadata; do not replace, paste, or elevate credentials without explicitly approved scope. Enforce a valid independent writer identity and no concurrent production changes.
4. **Release mechanics:** design and separately review the exact immutable source versions, deployment ID updates, rollback plan, consumer protection, and post-deployment GET-only attestation. The existing one-deployment `--apply` runner **will remain HOLD** while other execution API deployment IDs exist.
5. **County activation is separate:** keep all 24 NJ/DE live connectors disabled, isolate Pennsylvania's five-feed scheduler/trigger/checkpoint, require signed NJ/DE 24-county scope, inventory-only data destination, idempotency, Delaware owner/address + distress verification, and the independent acquisition ARV/repair safety gate before any offers.

## Exact evidence provenance and limitations

- The uploaded archive was opened and rehashed in this review; no production Google API, GitHub deployment or credential mutation was performed while reviewing its bytes.
- The ZIP contains **aggregated diagnostics** and version-source differences. It does not include raw Google API receipts, live client invocation logs, or independently signed reviewer decisions. Thus endpoint dispositions are **review recommendations**, not executed closure.
- As of this review: **0 of 13 endpoints certified closed; 0 endpoints modified; PR #10 unmerged**. **No-go** for live NJ/DE ingestion and automatic MAO/offers.
