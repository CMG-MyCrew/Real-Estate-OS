# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: Core Framework

Status: In progress

### Completed

- Apps Script manifest exists with V8 runtime and required scopes.
- Main application bootstrap exists in `src/Main.gs`.
- Configuration object exists in `src/Config.gs`.
- Database framework exists in `src/Database.gs`.
- Shared utilities and logger strengthened in `src/Utilities.gs`.
- Dashboard shell added in `src/Index.html`.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Standardize lifecycle functions: `onOpen`, `onInstall`, `installREOS`, and `runHealthCheck`.
- Maintain module-ready architecture for CRM, acquisitions, properties, vendors, automation, and AI agents.
- Keep GitHub as the source of truth for all framework code.

## Phase Roadmap

| Phase | Status | Description |
| --- | --- | --- |
| 0. Repository & Architecture | Complete | Repository connected and accessible. |
| 1. Core Framework | In Progress | Bootstrap, config, utilities, dashboard shell, health check. |
| 2. Database Layer | In Progress | Sheet-backed data access framework. |
| 3. Security | Planned | Roles, permissions, audit logs. |
| 4. CRM | Planned | Contacts, leads, pipeline, activities. |
| 5. Acquisitions | Planned | Distressed property and off-market lead workflows. |
| 6. Property Management | Planned | Assets, inspections, maintenance, occupancy. |
| 7. Vendors | Planned | Vendor registry, work orders, field services. |
| 8. Automation Engine | Planned | Triggers, scheduled jobs, workflow rules. |
| 9. AI Agents | Planned | Lead qualification, reporting, document processing. |
| 10. Dashboards | Planned | Executive KPIs and operational dashboards. |
| 11. Testing | Planned | QA scripts, validation, regression checks. |
| 12. Deployment | Planned | Production release process and documentation. |

## Core Framework Acceptance Criteria

- Spreadsheet opens with a REOS menu.
- Install routine creates required sheets and seeds settings/lookups.
- Health check validates required sheets.
- Dashboard shell opens from the REOS menu.
- Logger writes structured records to `SYSTEM_LOG`.
- Database layer can insert, update, query, and soft-delete sheet records.

## Next Build Items

1. Add workbook schema definitions for every core sheet.
2. Add `Setup.gs` to initialize headers and formatting consistently.
3. Add `Security.gs` for users, roles, and permission checks.
4. Add `Router.gs` for UI navigation and module registration.
5. Add CRM module foundation.
