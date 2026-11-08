# REOS NJ/DE — Multi-Deployment Protective Closure Decision Record

**Date:** November 8, 2026  
**Disposition:** **NO-GO** for production writes; **read-only deployment compatibility audit only**.

## Verified current position

The operator ran exact source pin `3b7a87aeb05d8466ea127b143cef0b36b730f6d4`; the four-argument immutable V167 persistence patch compatibility passed, including ScriptLock regression. The output reported:

- 13 Apps Script execution-API deployments, 12 alternates to the pinned V167 API deployment.
- 10 alternate deployments with **potential** unguarded NJ/DE generated connector code, plus the pinned V167, making **11 potentially exposed** endpoints. One alternate's version exposure remains unknown; version 4 contains 0 generated NJ/DE connectors but is not automatically safe from all county writers.
- Immutable versions 36–45 and 167 show 24 generated NJ/DE connectors, with no explicit SDK deny-only marker.
- `WRITE_ATTEMPTS=0`, `IMMUTABLE_VERSIONS_CREATED=0`, `DEPLOYMENT_UPDATES=0`; no production credential modification or scheduler execution.
- The four remaining authorization/safety gates are `OAUTH_CLIENT_PROJECT_PIN`, `WRITE_SCOPES_ATTESTED_BEFORE_ANY_MUTATION`, `NO_ALTERNATE_UNGUARDED_API_DEPLOYMENT`, `THREE_INDEPENDENT_PROTECTIVE_RELEASE_APPROVALS`.

The user-reported ZIP path was `/home/bjssnc3/REOS_NJ_DE_DENY_ONLY_20261108T181903Z.zip`, SHA-256 `04b1f2046f5724e1abda72a42816d19409ab464322ecf68a0daea67bcb86b2f7`. These bytes have **not** been independently supplied and rehashed for this review.

## Why the single-deployment rollout remains unsafe

An Apps Script API deployment points to a particular immutable project version. Updating one deployment does **not** automatically protect other deployment IDs still bound to their prior versions. Updating the project's HEAD to deny NJ/DE also **does not** retroactively modify historical immutable versions.

Blindly redirecting the other 12 API deployments to a new protected V167-based version risks:

1. Removing a function callable by an existing consumer of the older deployment.
2. Changing behavior where a similarly named function differs in historical code.
3. Modifying the Apps Script manifest's OAuth scope/runtime/library assumptions.
4. Disrupting unrelated Pennsylvania scheduler automation or old REOS modules.
5. Leaving the unversioned or unverified API deployment unresolved.

For these reasons, no code may infer production permission from a count of exported functions or a source SHA match alone.

## New read-only compatibility matrix

The program `scripts/reos-nj-de-api-deployment-compatibility-matrix.py` operates with explicit GET-only Google API restrictions (plus optional in-memory OAuth refresh). It inspects the actual pinned project, current HEAD, all execution-API deployment IDs and unique immutable versions, then compares each version against a **staged deny-only candidate built from verified V167**. It reports:

- Source version SHA-256, source-file counts and generated NJ/DE connector counts.
- Per-deployment entrypoint types, exact version number, and source-inspection status.
- Apps Script `functionSet` metadata when present, otherwise a clearly labelled lexical fallback of column-zero function declarations. **This is not an exhaustive proof of callable APIs or connected clients.**
- Function names present in the old deployment but absent in the protected candidate.
- Added, missing and changed file counts/names (not source code).
- Manifest fingerprints, runtime version, execution API access, OAuth-scope hashes and library counts.
- Explicit risk flags for historical semantic changes, legacy removals, scope/manifest divergence, and unknown versions.

The matrix is **evidence only**. It has no release/write option, no `scripts.run`, no trigger mutations, no source export, and no token output. It always reports `NO_GO`, even if every source is readable.

## Decision boundary for subsequent, separately authorized release design

A multi-deployment deny-only release requires a signed endpoint-by-endpoint disposition:

- **Protect in place** only if all original callable interfaces, manifest behavior and all known consumers are preserved and independently approved.
- **Retire deployment** only after proving no active consumers and obtaining distinct retirement/rollback authorization.
- **Quarantine or unknown**: do not repoint/delete by inference; retain HOLD and block risky execution operationally until ownership and version provenance are resolved.

Before any Apps Script writes, verify the exact current HEAD and every deployment binding **again** under the approved Google principal; obtain authenticated write scopes and a pinned client-project fingerprint; require three distinct exact-commit reviews from Matthew (custodian), Scott and Sydney in separate roles. Record approved endpoint IDs, expected source/version hashes, affected consumers, rollback order and post-release immutable readback requirements.

Do not install an all-county trigger. Preserve the PA five-feed scheduler, snapshot and checkpoint. The proposed safety patch must never enable NJ/DE or send parcel-only/assessment data to `DISTRESS_LEADS`. No automated MAO or offers unless there is independently comp-supported ARV and adequate repair scope.

**No automatic deployment, activation, or offer authority follows from this decision record.**
