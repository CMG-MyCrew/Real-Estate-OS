# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: v3.1.2.2 QuickBooks OAuth / Token Foundation

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
- v3.1.2.2 QuickBooks OAuth / Token Foundation added in `src/QuickBooksOAuth.gs`, `src/QuickBooksOAuth.html`, and `docs/V3_1_2_2_QUICKBOOKS_OAUTH.md` with OAuth state tracking, authorization URL generation, callback recording, token exchange foundation, refresh-token foundation, sandbox-safe connection tests, token event logs, and menu access.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Keep GitHub as the source of truth for all framework code.
- Keep QuickBooks connector safe-by-default and dry-run-first until sandbox credentials are verified.

## Phase Roadmap

| Phase | Status | Description |
| --- | --- | --- |
| Product Foundations | Complete | Core framework, CRM, acquisitions, property, vendors, automation, AI, dashboards, integrations, hardening, export, and documents. |
| GA Release | Complete | Deployment, seeding, validation, monitoring, release package, and production launch/sign-off. |
| v3.0.1 Maintenance | Complete | Patch issue tracking, regression runs, hotfix approvals, and patch release readiness. |
| v3.1 Financial Management | Complete | Invoices, vendor payments, expenses, approvals, property P&L, and accounting-ready exports. |
| v3.1.1 Finance Enhancements | Complete | Invoice line items, PDF-ready invoice output, accounting category mapping, receivables aging, and payables aging. |
| v3.1.2 QuickBooks Connector | In Progress | Connector registry, OAuth/token foundation, account/entity mapping, export queue, dry-run sync logging, and sandbox testing. |

## Acceptance Criteria

- Health check validates `QB_OAUTH_STATES`, `QB_TOKEN_EVENTS`, and `QB_CONNECTION_TESTS`.
- QuickBooks OAuth is available from the REOS menu.
- OAuth authorization URLs can be generated for connection records.
- Authorization callbacks can be recorded.
- Token exchange and refresh flows support dry-run mode and live mode guards.
- Sandbox connection test supports dry-run mode and live mode guards.

## Next Build Items

1. Build v3.1.2.3 QuickBooks sandbox API request wrapper.
2. Add Chart of Accounts pull and mapping review.
3. Add customer/vendor lookup and entity matching.
4. Build v3.1.3 Finance Dashboards.
