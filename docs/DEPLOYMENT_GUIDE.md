# REOS Enterprise Deployment Guide

## Overview

This guide describes how to deploy REOS Enterprise v3.0 from GitHub into Google Apps Script and operate it safely in production.

## Deployment Components

- GitHub repository: source control
- Google Apps Script: runtime
- Google Sheets: datastore and UI container
- Google Drive: document and backup storage
- GitHub Actions: repository validation

## Prerequisites

- Google Workspace account
- Google Sheet container
- Apps Script project connected to the Sheet
- GitHub repository access
- Required Google OAuth scopes in `appsscript.json`

## Initial Deployment

1. Create or open the target Google Sheet.
2. Open Extensions > Apps Script.
3. Add the source files from `src/` and `html/`.
4. Add `appsscript.json` manifest.
5. Save the project.
6. Reload the Sheet.
7. Run `installREOS` or use **REOS > Install / Repair REOS**.
8. Authorize requested scopes.
9. Confirm the REOS menu appears.
10. Open the Production Console and run health checks.

## Required Manifest

The Apps Script manifest should include V8 runtime and relevant scopes for Sheets, Drive, documents, calendar, Gmail send, triggers, and external requests.

## Post-Deployment Setup

1. Open Enterprise Admin and seed defaults.
2. Open Enterprise Security and seed policies.
3. Open API Platform and seed endpoints.
4. Open Performance Console and install worker trigger.
5. Open Production Console and create a backup.
6. Run smoke tests.
7. Create release record.

## Web App Deployment

For mobile or API usage:

1. Open Apps Script Deploy > New deployment.
2. Select Web app.
3. Set execute as appropriate for your organization.
4. Set access level according to security model.
5. Deploy.
6. Store deployment URL in environment configuration.

## Environment Strategy

Recommended environments:

| Environment | Purpose |
| --- | --- |
| Development | Active development |
| Testing | QA and validation |
| Staging | Release candidate testing |
| Production | Live operation |

Use **Enterprise Admin > Environment Manager** to track environments and configuration snapshots.

## Release Process

1. Merge or commit approved changes to the deployment branch.
2. Confirm GitHub Actions pass.
3. Create production backup.
4. Run health checks.
5. Run smoke tests.
6. Run release gate.
7. Deploy Apps Script version.
8. Create or update release record.
9. Run diagnostics after deployment.
10. Monitor incidents and performance.

## Rollback Process

1. Open Production Console.
2. Review latest backups and release records.
3. Identify the last known good Apps Script version.
4. Redeploy prior version if needed.
5. Restore from backup copy if spreadsheet data is damaged.
6. Open incident and document root cause.
7. Run smoke tests after rollback.

## Backup Strategy

Recommended schedule:

- Daily spreadsheet backup
- Weekly restore test
- Backup before every release
- 90-day retention by default

Backups are tracked in the `BACKUPS` sheet.

## Worker Triggers

Install background worker from the Performance Console.

The job queue worker processes queued jobs such as:

- Backups
- Usage snapshots
- Health checks
- BI snapshots
- Automation events
- Webhooks

## Production Validation

Use these consoles after deployment:

- Production Console
- Enterprise Security
- API Platform
- Performance Console
- Enterprise Admin

## Common Issues

### Missing menu

Reload the spreadsheet or run `onOpen` manually from Apps Script.

### Authorization error

Run an admin function manually in Apps Script and accept scopes.

### Missing sheet

Run **Install / Repair REOS** or open the relevant module, which usually creates its tables.

### API request fails

Check API key status, scope, rate limit, endpoint registry, and API request logs.

### Slow UI

Open Performance Console and review slow operations, cache hit rate, and job queue load.

## Production Readiness Checklist

- [ ] Health suite passes
- [ ] Smoke tests pass
- [ ] Backup created
- [ ] Restore test completed
- [ ] Security policies seeded
- [ ] API endpoints seeded
- [ ] Worker trigger installed
- [ ] Admin defaults seeded
- [ ] Feature flags reviewed
- [ ] Tenant access reviewed
- [ ] Release record created
