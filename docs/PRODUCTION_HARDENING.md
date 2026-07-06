# REOS Enterprise v3.0 Sprint 13 Production Hardening Guide

Repository: `CMG-MyCrew/Real-Estate-OS`
Runtime: Google Apps Script + Google Sheets

## Purpose

Sprint 13 adds a production-readiness gate before release candidate deployment. The hardening layer checks workbook structure, sheet size, trigger state, security posture, secrets configuration, automation rule JSON, external integration safety, AI error rates, and deployment documentation readiness.

## Added Files

| File | Purpose |
| --- | --- |
| `src/ProductionHardening.gs` | Server-side production readiness audit, report persistence, trigger review, cache cleanup, and log-retention review. |
| `src/ProductionHardening.html` | Admin UI for running audits and reviewing readiness results. |
| `docs/PRODUCTION_HARDENING.md` | Operating guide for Sprint 13 production hardening. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `HARDENING_REPORTS` | Stores each production readiness audit summary. |
| `HARDENING_CHECKS` | Stores each individual check attached to an audit report. |

## Menu Access

After syncing Apps Script and refreshing the workbook:

`REOS → Open Production Hardening`

Admin access is required.

## Readiness Audit Areas

### Workbook

- Required sheets exist.
- Sprint 8+ operational sheets exist.
- External integration sheets exist.
- Automation template sheet exists.

### Performance

- Reviews row/column footprint per sheet.
- Flags large sheets that may affect Apps Script performance.

### Automation

- Counts installed triggers.
- Flags duplicate trigger handlers.
- Checks automation rules for valid condition/action JSON.

### Security

- Confirms active admin exists.
- Confirms user table is populated.
- Confirms script properties are used for secret-like values.

### Integrations

- Confirms external provider registry exists.
- Blocks release if any live provider is enabled without a base URL.
- Supports dry-run-only integration posture.

### AI

- Reviews AI request failures.
- Warns if AI failure rate is above release threshold.

### Deployment

- Confirms release QA and production release checklist should be reviewed.

## Release Gate Status

| Status | Meaning |
| --- | --- |
| Ready | No critical issues and no failed checks. |
| Needs Review | Warnings or non-critical failures exist. |
| Blocked | One or more critical issues exist. Do not release. |

## Recommended Sprint 13 QA Flow

1. Sync all files from GitHub to Apps Script.
2. Refresh the workbook.
3. Run `REOS → Initialize Workbook`.
4. Run `REOS → Health Check`.
5. Run `REOS → Run Tests`.
6. Open `REOS → Open Production Hardening`.
7. Click `Run Readiness Audit`.
8. Review critical issues and warnings.
9. Resolve blockers.
10. Re-run readiness audit.
11. Attach the latest hardening report status to release notes.

## Manual Hardening Checklist

- [ ] No secrets are committed to GitHub.
- [ ] API keys are stored only in Script Properties.
- [ ] External integrations remain dry-run unless explicitly approved.
- [ ] Duplicate triggers are removed.
- [ ] Automation rules have valid JSON.
- [ ] AI provider is `stub` unless live AI is approved.
- [ ] Production workbook backup exists.
- [ ] Rollback commit SHA is recorded.
- [ ] Release Candidate QA checklist has been completed.
- [ ] Production release checklist has been completed.

## Rollback Criteria

Rollback or hold release if any of the following occur:

- Missing required sheets.
- No active admin user.
- Live external provider enabled without endpoint or secret configuration.
- Unsafe duplicate triggers.
- Data corruption during QA.
- Automation creates duplicate tasks or unsafe status changes.
- AI calls fail in a way that blocks operations.

## Notes

This sprint does not physically delete logs. The log cleanup tool identifies cleanup candidates so the release owner can review retention before enabling destructive cleanup in a later hardening pass.
