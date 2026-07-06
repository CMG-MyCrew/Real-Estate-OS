# REOS Enterprise v3.0 RC1 Checklist

## Build
- [ ] Sync GitHub files to Apps Script.
- [ ] Run Initialize Workbook.
- [ ] Open Release Center.
- [ ] Seed/select current environment.
- [ ] Build Release Candidate.
- [ ] Confirm rollback point backup created.
- [ ] Confirm readiness score is acceptable.

## Validation
- [ ] Health Check passes.
- [ ] Run Tests passes.
- [ ] Production Hardening is not Blocked.
- [ ] Dashboard Hub opens.
- [ ] Dashboard Export works.
- [ ] Documents module opens.
- [ ] External integrations remain dry-run unless approved.
- [ ] Automation triggers are reviewed.

## Approval
- [ ] Release owner reviews validation JSON.
- [ ] Critical issues equal zero.
- [ ] Backup URL is accessible.
- [ ] Rollback commit SHA documented.
- [ ] Release approved in Release Center.

## Deployment Record
- [ ] Record deployment to target environment.
- [ ] Archive release notes.
- [ ] Save production hardening report.
