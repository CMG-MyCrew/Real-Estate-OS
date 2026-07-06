# REOS Enterprise v3.0 Operations Runbook

## Daily Operations

- Review Dashboard Hub notifications.
- Review Automation Dashboard run history.
- Review Acquisition and Property dashboards.
- Confirm external integrations remain dry-run unless approved.
- Review AI Command Center for failures.

## Weekly Operations

- Run Production Hardening readiness audit.
- Validate backups.
- Review security audit report.
- Review document/photo registry.
- Review open work orders and maintenance backlog.

## Release Operations

- Build release candidate in Release Center.
- Create rollback point.
- Approve release only after validation passes.
- Record deployment after sync.

## Incident Response

- Disable unsafe triggers.
- Stop live external integrations by enabling Dry Run.
- Restore from latest workbook backup if data corruption occurs.
- Re-run hardening audit before resuming operations.
