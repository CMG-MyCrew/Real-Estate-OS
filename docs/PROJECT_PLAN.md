# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: v3.2.2 Investor Portal UI

Status: In progress

### Completed

- Main application bootstrap exists in `src/Main.gs`.
- Configuration object exists in `src/Config.gs`.
- Database framework exists in `src/Database.gs`.
- Core operational, finance, QuickBooks, dashboard, and portal foundations are in place.
- v3.2 Portal Foundation added in `src/PortalFoundation.gs`, `src/PortalFoundation.html`, and `docs/V3_2_PORTAL_FOUNDATION.md`.
- v3.2.1 Portal Authentication & Web App Shell added in `src/PortalAuth.gs`, `src/PortalAuth.html`, `src/PortalWebApp.html`, and `docs/V3_2_1_PORTAL_AUTH_WEB_APP.md`.
- v3.2.2 Investor Portal UI added in `src/InvestorPortal.gs`, `src/InvestorPortal.html`, and `docs/V3_2_2_INVESTOR_PORTAL_UI.md` with investor portfolio KPIs, property performance, monthly trend charts, documents, messages, tasks, investor updates, investor property watchlist, menu access, and health-check wiring.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Keep GitHub as the source of truth for all framework code.
- Continue portal work in small secure increments by role.

## Phase Roadmap

| Phase | Status | Description |
| --- | --- | --- |
| Product Foundations | Complete | Core framework, CRM, acquisitions, property, vendors, automation, AI, dashboards, integrations, hardening, export, and documents. |
| GA Release | Complete | Deployment, seeding, validation, monitoring, release package, and production launch/sign-off. |
| v3.1 Financial Management | Complete | Invoices, vendor payments, expenses, approvals, property P&L, and accounting-ready exports. |
| v3.1.2 QuickBooks Connector | In Progress | Connector registry, OAuth/token foundation, account/entity mapping, export queue, dry-run sync logging, and sandbox testing. |
| v3.1.3 Finance Dashboards | Complete | Executive financial dashboards, KPI snapshots, cash flow, profitability, aging, and budget variance. |
| v3.2 Portal Foundation | Complete | Portal account model, invitations, sessions, document sharing, messages, tasks, and portal dashboards. |
| v3.2.1 Portal Auth & Web App Shell | Complete | Login/session validation, route registry, logout, web app shell, and responsive portal entrypoint. |
| v3.2.2 Investor Portal UI | In Progress | Investor dashboard, property performance, documents, messages, tasks, updates, and watchlist. |

## Acceptance Criteria

- Health check validates `INVESTOR_PORTAL_UPDATES` and `INVESTOR_PROPERTY_WATCHLIST`.
- Investor Portal is available from the REOS menu.
- Investor dashboard loads only for Investor portal accounts.
- Investor KPIs calculate from finance dashboard data.
- Investor documents, messages, tasks, updates, and watchlist records display.

## Next Build Items

1. Build v3.2.3 Vendor Portal UI.
2. Build v3.2.4 Client/Lender Portal UI.
3. Build v3.2.5 Portal Web App Role Pages.
4. Build v3.1.2.3 QuickBooks sandbox API request wrapper.
