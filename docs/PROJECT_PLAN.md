# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: v3.1.1 Finance Enhancements

Status: In progress

### Completed

- Apps Script manifest exists with V8 runtime and required scopes.
- Main application bootstrap exists in `src/Main.gs`.
- Configuration object exists in `src/Config.gs`.
- Database framework exists in `src/Database.gs`.
- Core operational, dashboard, AI, deployment, launch, maintenance, and finance foundations are in place.
- v3.1 Financial Management added in `src/FinanceManager.gs`, `src/FinanceManager.html`, and `docs/V3_1_FINANCIAL_MANAGEMENT.md`.
- v3.1.1 Finance Enhancements added in `src/FinanceEnhancements.gs`, `src/FinanceEnhancements.html`, and `docs/V3_1_1_FINANCE_ENHANCEMENTS.md` with invoice line items, invoice recalculation, PDF-ready invoice snapshots, accounting categories, AR aging, AP aging, and finance enhancement dashboard.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Keep GitHub as the source of truth for all framework code.
- Continue finance expansion in small, testable increments before the QuickBooks connector.

## Phase Roadmap

| Phase | Status | Description |
| --- | --- | --- |
| Product Foundations | Complete | Core framework, CRM, acquisitions, property, vendors, automation, AI, dashboards, integrations, hardening, export, and documents. |
| GA Release | Complete | Deployment, seeding, validation, monitoring, release package, and production launch/sign-off. |
| v3.0.1 Maintenance | Complete | Patch issue tracking, regression runs, hotfix approvals, and patch release readiness. |
| v3.1 Financial Management | Complete | Invoices, vendor payments, expenses, approvals, property P&L, and accounting-ready exports. |
| v3.1.1 Finance Enhancements | In Progress | Invoice line items, PDF-ready invoice output, accounting category mapping, receivables aging, and payables aging. |

## Acceptance Criteria

- Finance Enhancements creates `FIN_INVOICE_LINES`, `FIN_ACCOUNT_CATEGORIES`, and `FIN_INVOICE_PDFS`.
- Invoice line items recalculate invoice subtotal, tax, total, and balance.
- PDF-ready invoice HTML snapshots can be generated.
- Accounting categories can be seeded.
- Receivables and payables aging reports are available.

## Next Build Items

1. Wire Finance Enhancements into the main REOS menu and health check.
2. Build v3.1.2 QuickBooks Connector foundation.
3. Build v3.1.3 Finance Dashboards.
4. Build v3.2 Portal Foundation.
