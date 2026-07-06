# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: Build Sprint 3 / v3.2.4 Client Lender Portal UI

Status: In progress

### Completed

- Main application bootstrap exists in `src/Main.gs`.
- Configuration object exists in `src/Config.gs`.
- Database framework exists in `src/Database.gs`.
- Core operational, finance, QuickBooks, dashboard, and portal foundations are in place.
- v3.2 Portal Foundation added in `src/PortalFoundation.gs`, `src/PortalFoundation.html`, and `docs/V3_2_PORTAL_FOUNDATION.md`.
- v3.2.1 Portal Authentication & Web App Shell added in `src/PortalAuth.gs`, `src/PortalAuth.html`, `src/PortalWebApp.html`, and `docs/V3_2_1_PORTAL_AUTH_WEB_APP.md`.
- v3.2.2 Investor Portal UI added in `src/InvestorPortal.gs`, `src/InvestorPortal.html`, and `docs/V3_2_2_INVESTOR_PORTAL_UI.md`.
- v3.2.3 Vendor Portal UI added in `src/VendorPortal.gs`, `src/VendorPortal.html`, and `docs/V3_2_3_VENDOR_PORTAL_UI.md`.
- Build Sprint 3 / v3.2.4 Client Lender Portal UI added in `src/ClientLenderPortal.gs`, `src/ClientLenderPortal.html`, and `docs/V3_2_4_CLIENT_LENDER_PORTAL_UI.md` with property visibility, shared documents, messages, tasks, updates, notes, menu access, and health-check wiring.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Keep GitHub as the source of truth for all framework code.
- Continue portal work in small secure increments by role.

## Phase Roadmap

| Phase | Status | Description |
| --- | --- | --- |
| Product Foundations | Complete | Core framework, CRM, acquisitions, property, vendors, automation, AI, dashboards, integrations, hardening, export, and documents. |
| v3.1 Financial Management | Complete | Invoices, vendor payments, expenses, approvals, property P&L, and accounting-ready exports. |
| v3.1.2 QuickBooks Connector | In Progress | Connector registry, OAuth/token foundation, account/entity mapping, export queue, dry-run sync logging, and sandbox testing. |
| v3.1.3 Finance Dashboards | Complete | Executive financial dashboards, KPI snapshots, cash flow, profitability, aging, and budget variance. |
| v3.2 Portal Foundation | Complete | Portal account model, invitations, sessions, document sharing, messages, tasks, and portal dashboards. |
| v3.2.1 Portal Auth & Web App Shell | Complete | Login/session validation, route registry, logout, web app shell, and responsive portal entrypoint. |
| v3.2.2 Investor Portal UI | Complete | Investor dashboard, property performance, documents, messages, tasks, updates, and watchlist. |
| v3.2.3 Vendor Portal UI | Complete | Vendor dashboard, assigned work, payments, documents, messages, tasks, updates, and completion records. |
| v3.2.4 Client Lender Portal UI | In Progress | Client/lender dashboard, property visibility, documents, messages, tasks, updates, and notes. |

## Acceptance Criteria

- Health check validates `CLIENT_LENDER_PORTAL_UPDATES` and `LENDER_PORTAL_NOTES`.
- Client Lender Portal is available from the REOS menu.
- Dashboard loads only for Client or Lender portal accounts.
- Properties, documents, messages, tasks, updates, and notes display.

## Next Build Items

1. Build v3.2.5 Portal Web App Role Pages.
2. Build v3.2.6 Portal Notification Center.
3. Build v3.2.7 Portal Security Hardening.
4. Build v3.1.2.3 QuickBooks sandbox API request wrapper.
