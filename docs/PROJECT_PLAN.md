# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: v3.1 Financial Management

Status: In progress

### Completed

- Apps Script manifest exists with V8 runtime and required scopes.
- Main application bootstrap exists in `src/Main.gs`.
- Configuration object exists in `src/Config.gs`.
- Database framework exists in `src/Database.gs`.
- Core operational, dashboard, AI, deployment, launch, and maintenance foundations are in place.
- v3.1 Financial Management added in `src/FinanceManager.gs`, `src/FinanceManager.html`, and `docs/V3_1_FINANCIAL_MANAGEMENT.md` with invoices, invoice payments, vendor payment requests, payment approvals, expense tracking, property P&L, QuickBooks-ready exports, finance KPIs, and menu access.
- REOS menu includes Finance Manager and the existing enterprise modules.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Keep GitHub as the source of truth for all framework code.
- Expand REOS into financial management, accounting exports, and property-level profitability reporting.

## Phase Roadmap

| Phase | Status | Description |
| --- | --- | --- |
| Product Foundations | Complete | Core framework, CRM, acquisitions, property, vendors, automation, AI, dashboards, integrations, hardening, export, and documents. |
| GA Release | Complete | Deployment, seeding, validation, monitoring, release package, and production launch/sign-off. |
| v3.0.1 Maintenance | Complete | Patch issue tracking, regression runs, hotfix approvals, and patch release readiness. |
| v3.1 Financial Management | In Progress | Invoices, vendor payments, expenses, approvals, property P&L, and accounting-ready exports. |

## Acceptance Criteria

- Health check validates `FIN_INVOICES`, `FIN_VENDOR_PAYMENTS`, `FIN_EXPENSES`, `FIN_PAYMENT_APPROVALS`, and `FIN_QB_EXPORTS`.
- Finance Manager can create invoices, record invoice payments, create vendor payments, approve payments, mark payments paid, create expenses, calculate property P&L, and generate accounting-ready exports.
- Finance Manager is available from the REOS menu.

## Next Build Items

1. Add invoice line items and PDF invoice output.
2. Add accounting category mapping.
3. Add QuickBooks Online connector configuration.
4. Build v3.2 portal foundation.
