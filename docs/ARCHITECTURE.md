# REOS Enterprise Architecture

## Platform Overview

REOS Enterprise v3.0 is a modular Google Apps Script application backed by Google Sheets, Google Drive, and optional external integrations.

The platform is organized into domain frameworks, infrastructure frameworks, portals, administration tools, and production services.

## Runtime

- Google Apps Script V8
- Google Sheets as primary datastore
- Google Drive for document storage
- HtmlService for modal apps, portals, and app shells
- CacheService for cache layer
- PropertiesService for configuration and secrets references
- Script triggers for automation and background jobs

## Repository Structure

```text
src/        Apps Script server-side modules
html/       HtmlService user interfaces
styles/     Shared UI assets when applicable
docs/       Documentation and knowledge base
.github/    CI workflow definitions
```

## Core Layers

### Application Foundation

- `Main.gs`
- `Menu.gs`
- `Database.gs`
- `Security.gs`
- Shared helpers and validation

### Business Modules

- CRM
- Tasks
- Transactions
- Investments
- Rentals
- Finance
- Reporting
- Documents
- Workflow Automation

### Portal Layer

- Agent Portal
- Client Portal
- Vendor Portal
- Mobile/PWA app shell

### Intelligence Layer

- AI Assistant
- AI Insights
- Business Intelligence
- Predictive Analytics

### Platform Layer

- Integration Hub
- API Platform
- Webhooks
- API Keys
- OpenAPI docs

### SaaS Layer

- Tenants
- Tenant Security
- SaaS Admin
- Branding
- Billing
- Tenant provisioning

### Enterprise Operations

- Enterprise Admin
- Security Hardening
- Production Console
- Performance Console
- Monitoring
- Backup
- Deployment
- QA

## Data Model

Each framework creates its own sheet with a header row and uses `REOS.Database` for insert, update, find, and query operations.

Common fields:

- ID field
- Status
- Active
- Created At
- Updated At
- Tenant ID when tenant-scoped

## Module Pattern

Most modules follow this pattern:

```javascript
var REOS = REOS || {};

REOS.ModuleName = (function () {
  function ensureSheet() {}
  function createRecord(record) {}
  function listRecords() {}
  return { ensureSheet, createRecord, listRecords };
})();

function moduleCreateRecord(record) {
  return REOS.ModuleName.createRecord(record);
}
```

## UI Pattern

HTML files use `google.script.run` to call global Apps Script wrapper functions.

Shared UI patterns:

- `setText`
- `escapeHtml`
- KPI cards
- data tables
- status panels
- modal dialogs

## Security Architecture

Security is layered:

1. Base role and permission checks
2. Tenant access controls
3. Row-level tenant boundary checks
4. API key validation
5. Secret registry
6. Security event logging
7. Incident creation for critical events

## API Architecture

API Platform flow:

1. Request enters web app or internal handler.
2. Endpoint is resolved from `API_ENDPOINTS`.
3. API key is validated.
4. Scope and rate limits are checked.
5. Tenant context is set when present.
6. Resource route is executed.
7. Response envelope is returned.
8. Request is logged.

## Performance Architecture

Performance tools include:

- Cache layer
- Batch database reads and writes
- Query optimizer
- Job queue
- Background worker trigger
- Performance logs
- Quota monitor

## Deployment Architecture

Deployment is controlled through:

- GitHub repository
- GitHub Actions validation
- Apps Script deployment
- Production backups
- Release records
- Smoke tests
- Release gates
- Monitoring dashboard

## Integration Architecture

Integration Hub provides a common registry and adapters for:

- Google Workspace
- MLS / RESO
- QuickBooks
- DocuSign
- Stripe
- Twilio
- RingCentral
- Zapier / Make
- Webhooks

## Extension Guidelines

When adding a new module:

1. Create server-side `src/<Module>.gs`.
2. Create optional UI `html/<Module>.html`.
3. Add sheet initialization.
4. Add validation.
5. Add permission checks.
6. Add audit logging.
7. Add menu/sidebar shortcut.
8. Add diagnostics if production-critical.
9. Update documentation.
