# REOS Enterprise Administrator Guide

## Overview

REOS Enterprise v3.0 is an Apps Script and Google Sheets based real estate operating system with CRM, tasks, transactions, rentals, finance, documents, portals, AI, integrations, security, API platform, SaaS administration, production monitoring, and performance optimization.

This guide is for system administrators responsible for setup, permissions, tenant management, integrations, monitoring, and operations.

## Core Admin Areas

### Enterprise Admin

Open **REOS > Open Enterprise Admin** to manage:

- System configuration
- Feature flags
- Licenses
- Usage analytics
- Environments
- Tenant provisioning
- Diagnostics
- API activity

### SaaS Admin

Open **REOS > Open SaaS Admin** to manage:

- Tenants
- Tenant billing profiles
- Provisioning steps
- Tenant health
- Tenant owner access

### Enterprise Security

Open **REOS > Open Enterprise Security** to manage:

- Security policies
- API keys
- Secret registry
- Rotation watch
- Security events

### Production Console

Open **REOS > Open Production Console** to manage:

- Health checks
- Incidents
- Backups
- Releases
- Smoke tests
- Release gates

### Performance Console

Open **REOS > Open Performance Console** to manage:

- Cache metrics
- Job queue
- Quota snapshots
- Slow operations
- Optimized queries

## Initial Setup Checklist

1. Run **Install / Repair REOS** from the REOS menu.
2. Open **Enterprise Admin** and click **Seed Defaults**.
3. Open **Enterprise Security** and click **Seed Policies**.
4. Open **API Platform** and click **Seed Endpoints**.
5. Open **Production Console** and create a backup.
6. Open **Performance Console** and install the worker trigger.
7. Create the first tenant in **SaaS Admin**.
8. Grant tenant owner access.
9. Provision the tenant from **Enterprise Admin** or **SaaS Admin**.
10. Run diagnostics and smoke tests.

## Permissions

REOS uses module-level permissions through the Security framework. Most administrative write actions require elevated permissions such as `finance:write`. Read-only dashboards generally require `reports:read`.

Recommended roles:

| Role | Purpose |
| --- | --- |
| Owner | Full platform control |
| Admin | Tenant, user, configuration, and operational control |
| Manager | Team operations, reporting, and workflows |
| Agent | CRM, tasks, transactions, documents, and portals |
| Viewer | Read-only access |

## Tenant Administration

Tenant records are stored in `TENANTS`. Branding is stored in `TENANT_BRANDING`. Access is stored in `TENANT_ACCESS`.

Recommended tenant workflow:

1. Create tenant.
2. Assign plan.
3. Grant owner access.
4. Configure branding.
5. Create billing profile.
6. Run provisioning.
7. Validate diagnostics.
8. Confirm feature flags.

## Configuration Management

System configuration is stored in `SYSTEM_CONFIGURATION`.

Recommended categories:

- Branding
- Email
- SMS
- AI
- API
- Security
- Storage
- Finance
- Notifications

Sensitive values should be stored through the Secret Management console, not directly in configuration rows.

## Feature Flags

Feature flags allow controlled rollout by environment or tenant.

Typical flags:

- AI Assistant
- Mobile App
- API Platform
- Client Portal
- Vendor Portal
- BI Forecasts

Use rollout percentage for staged launches.

## License Management

Licenses are stored in `LICENSES` and support editions such as Starter, Professional, Enterprise, Brokerage, WhiteLabel, and Unlimited.

Track:

- Seats
- Storage
- Expiration
- Usage
- Status

## Security Administration

Use Enterprise Security to manage:

- API keys
- Secret rotation
- Security policies
- Critical security events
- Tenant isolation checks

Never store raw secrets in Sheets. Store secrets through `REOS.Secrets` or the Security console.

## API Administration

Use API Platform to:

- Seed endpoints
- Generate OpenAPI docs
- Test requests
- Review request logs

API keys are generated in the Security console.

## Monitoring and Incidents

Use the Production Console to run health checks, open incidents, close incidents, create backups, and validate release readiness.

Recommended cadence:

- Daily health check
- Daily backup
- Weekly restore test
- Weekly smoke test
- Monthly license and access review

## Backups

Use **Create Backup** in Production Console. Backups are tracked in `BACKUPS`.

Recommended retention: 90 days.

## Release Process

1. Create backup.
2. Run health suite.
3. Run smoke tests.
4. Validate release gate.
5. Create release record.
6. Deploy Apps Script.
7. Run diagnostics.
8. Monitor incidents.

## Troubleshooting

Start with:

1. Production Console health checks.
2. System Diagnostics.
3. Security events.
4. API request logs.
5. Performance slow operations.
6. Job queue failures.

