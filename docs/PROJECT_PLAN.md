# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: v3.2 Portal Foundation

Status: In progress

### Completed

- Apps Script manifest exists with V8 runtime and required scopes.
- Main application bootstrap exists in `src/Main.gs`.
- Configuration object exists in `src/Config.gs`.
- Database framework exists in `src/Database.gs`.
- Core operational, dashboard, AI, deployment, launch, maintenance, finance, QuickBooks, and dashboard foundations are in place.
- v3.1.3 Finance Dashboards added in `src/FinanceDashboards.gs`, `src/FinanceDashboards.html`, and `docs/V3_1_3_FINANCE_DASHBOARDS.md`.
- v3.2 Portal Foundation added in `src/PortalFoundation.gs`, `src/PortalFoundation.html`, and `docs/V3_2_PORTAL_FOUNDATION.md` with portal accounts, invitations, sessions, document shares, messages, tasks, activity logs, investor/lender/client/vendor role dashboards, admin UI, menu access, and health-check wiring.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Keep GitHub as the source of truth for all framework code.
- Build secure portal access incrementally before exposing a public web app shell.

## Phase Roadmap

| Phase | Status | Description |
| --- | --- | --- |
| Product Foundations | Complete | Core framework, CRM, acquisitions, property, vendors, automation, AI, dashboards, integrations, hardening, export, and documents. |
| GA Release | Complete | Deployment, seeding, validation, monitoring, release package, and production launch/sign-off. |
| v3.1 Financial Management | Complete | Invoices, vendor payments, expenses, approvals, property P&L, and accounting-ready exports. |
| v3.1.1 Finance Enhancements | Complete | Invoice line items, PDF-ready invoice output, accounting category mapping, receivables aging, and payables aging. |
| v3.1.2 QuickBooks Connector | In Progress | Connector registry, OAuth/token foundation, account/entity mapping, export queue, dry-run sync logging, and sandbox testing. |
| v3.1.3 Finance Dashboards | Complete | Executive financial dashboards, KPI snapshots, cash flow, profitability, aging, and budget variance. |
| v3.2 Portal Foundation | In Progress | Investor, lender, client, and vendor portal account model, invitations, sessions, document sharing, messages, tasks, and portal dashboards. |

## Acceptance Criteria

- Health check validates `PORTAL_ACCOUNTS`, `PORTAL_SESSIONS`, `PORTAL_INVITATIONS`, `PORTAL_DOCUMENT_SHARES`, `PORTAL_MESSAGES`, `PORTAL_TASKS`, and `PORTAL_ACTIVITY_LOG`.
- Portal Foundation is available from the REOS menu.
- Admin can create portal invitations.
- Invitations can create active portal accounts.
- Portal document shares, messages, and tasks can be created.
- Role-specific portal dashboard data can be loaded for investor, lender, client, and vendor accounts.

## Next Build Items

1. Build v3.2.1 Portal Authentication & Web App Shell.
2. Build v3.2.2 Investor Portal UI.
3. Build v3.2.3 Vendor Portal UI.
4. Build v3.1.2.3 QuickBooks sandbox API request wrapper.
