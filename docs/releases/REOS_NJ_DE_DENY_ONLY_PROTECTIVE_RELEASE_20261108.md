# REOS NJ/DE Deny-Only Protective Release — Independent Authorization and Execution Contract

**Date:** 2026-11-08  
**Scope:** EMERGENCY DENY-ONLY safety change, **not** county authorization or activation.  
**Current disposition:** STAGED IN GITHUB, NOT INSTALLED IN PRODUCTION.

## Exact production binding

- Apps Script: `159EMqc5tB9oQJGhci97j6b41BUvhG5wxUErTZgBFqSCghRcw4msFaKi7`
- Existing execution API deployment: `AKfycbxTPu2haRrW9Ls0mkRV4uambT5ajC5RlNC5m7IBxPlcmspVjF5DGdNxOG4pCzjQbHeX`
- Original immutable deployed version: **V167**, do not modify it.
- Source-count precondition: **481 files**, production HEAD **exactly equals V167 across the entire source tree**, not just the PA scheduler.
- Pennsylvania scheduler baseline source SHA-256: `7b850103cd0a5b7dd2d2cc6776f2c92c55ae7bf2107336417b8b5b956b2cc855`
- A production source mismatch, alternate execution-API deployment, absent or conflicting approval, missing OAuth client/write scope, unknown SDK patch anchor, or concurrent HEAD/deployment change must stop the release with **zero intended writes**.

## Protective-only change set

The installer constructs a candidate from the authenticated, immutable V167 source and makes **25 source-file changes only**:

1. `CountyConnectorSDK`: force every NJ/DE connector registration disabled, reject all NJ/DE `run()` calls before infrastructure, audit, IDs or network calls, and reject NJ/DE plus parcel/assessment persistence as a last-resort safety boundary.
2. All **21 NJ** and **3 DE** generated connector source manifests: change exactly one top-level `enabled: true` to `enabled: false` per connector. Dataset source URLs are not changed in the live project by this deny-only release.
3. Nothing else changes: specifically **`CountyProductionScheduler` unchanged**, PA five-feed order/checkpoint untouched, no credentials, triggers, authorizations, schemas, or spreadsheets mutated.

The read-only candidate preflight hashes the full source tree and verifies the exact 25-file patch surface; no merging the GitHub feature tree into the 481-file production project.

**Important:** This emergency patch does not claim to install the unrelated staged PA dry-run audit fix or resolve prior canonical-data lineage. NJ/DE dry-run calls are denied before audit writes. Pennsylvania active live workflow is preserved.

## Independent approval / separation

The release is not authorized by the project request alone. Before `--apply`, require an independently recorded GitHub review for the **exact PR #10 head commit**, by **three distinct accounts** documented by custodian/operations/independent roles, with a local JSON mapping under `~/.config/reos-approvals/NJ_DE_DENY_ONLY_PROTECTIVE.json`. All three latest reviews must be `APPROVED` for that exact head. **Matthew** serves as custodian; **Scott** and **Sydney** remain separate reviewers in accordance with the custody model. Reviewers' GitHub account names must be independently verified and must not be guessed.

The approval manifest includes `release=NJ_DE_DENY_ONLY_V1`, `git_commit=<exact PR head>`, `script_id=<pinned production script>`, and `github_reviewers={custodian:<login>, operations:<login>, independent:<login>}`. The text of a manifest does not itself establish an authentic signature; it is cross-checked against the GitHub review API. A PR approval is **approval for the scoped deny-only release**, not permission to ingest NJ/DE records, issue offers, or alter acquisition rules.

## Production release and readback

Only after approvals and full-source/OAuth-source parity:

1. Re-read complete HEAD and pinned execution API deployment for concurrent changes.
2. Call `projects.updateContent` once, retaining the full original 481-file file set (Google's method replaces all files). On any discrepancy, **stop**; do not blindly retry or restore HEAD over others' edits.
3. Call `projects.versions.create` once to preserve a **new immutable guarded version**.
4. Read back the exact newly minted immutable source and compare the full tree to the protected candidate.
5. Update **the same existing execution API deployment ID** to the new version. Creating a separate new deployment while V167 remains the active API would not close the vulnerable entrypoint.
6. Read back the new active deployment, HEAD, immutable candidate, 24 disabled manifests, SDK denial guards, and unchanged PA scheduler source.
7. Independently execute `scripts/reos-nj-de-independent-protective-attest.py` under a separately controlled review session. Its Google operations are GET only; it cannot update Apps Script, trigger, Sheets, or credential state. A second run under the same Google principal is repeatability, not proof of independent role authorization.

The installer always emits local `REOS_NJ_DE_DENY_ONLY_<UTC>.zip` including a JSON decision summary and sanitized source hash evidence. The readback emits a distinct read-only ZIP. **Neither result constitutes NJ/DE activation authority.**

## Expected blockers today

The earlier independent production attestation confirmed effective Google user but **did not attest the OAuth client-project fingerprint** (pinned Cloud project `761052091881`) and returned Sheets HTTP 403 for the clasp token. No approvals from the three reviewers are known to be signed. These remain hard release blockers. The release installer is deliberately **non-mutating unless all preflight gates pass**; the earlier V167 source must be independently retrieved in the approved environment and matched exactly.

## Emergency rollback / incident boundary

Retain V167 and its original deployment metadata untouched in the evidence. If a partial failure happens after HEAD update, **do not automatically revert HEAD**, because this could overwrite subsequent edits or reinstate an unsafe live pathway; stop and require custodian-led recovery. If deployment readback fails, disable NJ/DE execution operationally until independently reconciled; never assume a failed response means no write occurred. Rollback of an API deployment requires separate scoped authorization and a current immutable deployment/version readback.

## Separate future county activation

**NO GO** until the 24-county NJ/DE source/scope approvals, canonical inventory-only staging destination, stable idempotent record identity/replay, Delaware address/owner enrichment and authoritative distress evidence, source-provenance ACLs and independent safety sign-off are complete. Automatic MAO and offers remain blocked absent comp-supported ARV and adequate repair scope.
