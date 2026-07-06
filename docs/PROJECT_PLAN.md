# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: v3.1.2 QuickBooks Connector Foundation

Status: In progress

### Completed

- Apps Script manifest exists with V8 runtime and required scopes.
- Main application bootstrap exists in `src/Main.gs`.
- Configuration object exists in `src/Config.gs`.
- Database framework exists in `src/Database.gs`.
- Core operational, dashboard, AI, deployment, launch, maintenance, and finance foundations are in place.
- v3.1 Financial Management added in `src/FinanceManager.gs`, `src/FinanceManager.html`, and `docs/V3_1_FINANCIAL_MANAGEMENT.md`.
- v3.1.1 Finance Enhancements added in `src/FinanceEnhancements.gs`, `src/FinanceEnhancements.html`, and `docs/V3_1_1_FINANCE_ENHANCEMENTS.md`.
- v3.1.1 is wired into `src/Main.gs` with lifecycle initialization, menu access, and health-check sheets.
- v3.1.2 QuickBooks Connector Foundation added in `src/QuickBooksConnector.gs`, `src/QuickBooksConnector.html`, and `docs/V3_1_2_QUICKBOOKS_CONNECTOR.md` with connection registry, account mapping, entity mapping, export queue, dry-run sync logs, and dashboard UI.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Keep GitHub as the source of truth for all framework code.
- Keep QuickBooks connector in dry-run mode until OAuth and sandbox testing are complete.

## Phase Roadmap

| Phase | Status | Description |
| --- | --- | --- |
| Product Foundations | Complete | Core framework, CRM, acquisitions, property, vendors, automation, AI, dashboards, integrations, hardening, export, and documents. |
| GA Release | Complete | Deployment, seeding, validation, monitoring, release package, and production launch/sign-off. |
| v3.0.1 Maintenance | Complete | Patch issue tracking, regression runs, hotfix approvals, and patch release readiness. |
| v3.1 Financial Management | Complete | Invoices, vendor payments, expenses, approvals, property P&L, and accounting-ready exports. |
| v3.1.1 Finance Enhancements | Complete | Invoice line items, PDF-ready invoice output, accounting category mapping, receivables aging, and payables aging. |
| v3.1.2 QuickBooks Connector | In Progress | Connection registry, OAuth placeholders, account/entity mapping, export queue, and dry-run sync logging. |

## Acceptance Criteria

- Health check validates `FIN_INVOICE_LINES`, `FIN_ACCOUNT_CATEGORIES`, `FIN_INVOICE_PDFS`, `QB_CONNECTIONS`, `QB_SYNC_LOG`, `QB_ACCOUNT_MAP`, `QB_ENTITY_MAP`, and `QB_EXPORT_QUEUE`.
- Finance Enhancements is available from the REOS menu.
- QuickBooks Connector is available from the REOS menu.
- QuickBooks Connector can create connection records, seed account mappings, queue finance exports, and run dry-run sync logs.

## Next Build Items

1. Build v3.1.2.2 QuickBooks OAuth/token foundation.
2. Build v3.1.2.3 QuickBooks sandbox API request wrapper.
3. Build v3.1.3 Finance Dashboards.
4. Build v3.2 Portal Foundation.
