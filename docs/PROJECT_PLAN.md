# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: v3.1.3 Finance Dashboards

Status: In progress

### Completed

- Apps Script manifest exists with V8 runtime and required scopes.
- Main application bootstrap exists in `src/Main.gs`.
- Configuration object exists in `src/Config.gs`.
- Database framework exists in `src/Database.gs`.
- Core operational, dashboard, AI, deployment, launch, maintenance, and finance foundations are in place.
- v3.1 Financial Management added in `src/FinanceManager.gs`, `src/FinanceManager.html`, and `docs/V3_1_FINANCIAL_MANAGEMENT.md`.
- v3.1.1 Finance Enhancements added in `src/FinanceEnhancements.gs`, `src/FinanceEnhancements.html`, and `docs/V3_1_1_FINANCE_ENHANCEMENTS.md`.
- v3.1.2 QuickBooks Connector Foundation added in `src/QuickBooksConnector.gs`, `src/QuickBooksConnector.html`, and `docs/V3_1_2_QUICKBOOKS_CONNECTOR.md`.
- v3.1.2.2 QuickBooks OAuth / Token Foundation added in `src/QuickBooksOAuth.gs`, `src/QuickBooksOAuth.html`, and `docs/V3_1_2_2_QUICKBOOKS_OAUTH.md`.
- v3.1.3 Finance Dashboards added in `src/FinanceDashboards.gs`, `src/FinanceDashboards.html`, and `docs/V3_1_3_FINANCE_DASHBOARDS.md` with executive finance KPIs, cash flow metrics, monthly trends, AR/AP aging charts, property profitability, budget variance, finance snapshots, and menu access.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Keep GitHub as the source of truth for all framework code.
- Provide executive financial visibility before moving into portal foundation work.

## Phase Roadmap

| Phase | Status | Description |
| --- | --- | --- |
| Product Foundations | Complete | Core framework, CRM, acquisitions, property, vendors, automation, AI, dashboards, integrations, hardening, export, and documents. |
| GA Release | Complete | Deployment, seeding, validation, monitoring, release package, and production launch/sign-off. |
| v3.0.1 Maintenance | Complete | Patch issue tracking, regression runs, hotfix approvals, and patch release readiness. |
| v3.1 Financial Management | Complete | Invoices, vendor payments, expenses, approvals, property P&L, and accounting-ready exports. |
| v3.1.1 Finance Enhancements | Complete | Invoice line items, PDF-ready invoice output, accounting category mapping, receivables aging, and payables aging. |
| v3.1.2 QuickBooks Connector | In Progress | Connector registry, OAuth/token foundation, account/entity mapping, export queue, dry-run sync logging, and sandbox testing. |
| v3.1.3 Finance Dashboards | In Progress | Executive financial dashboards, KPI snapshots, cash flow, profitability, aging, and budget variance. |

## Acceptance Criteria

- Health check validates `FIN_DASHBOARD_SNAPSHOTS` and `FIN_BUDGETS`.
- Finance Dashboards is available from the REOS menu.
- Dashboard KPIs calculate from finance source sheets.
- AR/AP aging charts and monthly finance trend charts are available.
- Property P&L and budget variance tables are available.
- Finance dashboard snapshots can be created.

## Next Build Items

1. Build v3.2 Portal Foundation.
2. Build v3.1.2.3 QuickBooks sandbox API request wrapper.
3. Add Chart of Accounts pull and mapping review.
4. Add customer/vendor lookup and entity matching.
