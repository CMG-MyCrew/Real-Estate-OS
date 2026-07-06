# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: Production Hardening

Status: In progress

### Completed

- Apps Script manifest exists with V8 runtime and required scopes.
- Main application bootstrap exists in `src/Main.gs`.
- Configuration object exists in `src/Config.gs`.
- Database framework exists in `src/Database.gs`.
- Shared utilities and logger strengthened in `src/Utilities.gs`.
- Dashboard shell added in `src/Index.html`.
- Workbook setup framework added in `src/Setup.gs`.
- Core sheet schema definitions added for HOME, SETTINGS, USERS, LOOKUPS, CRM, LEADS, TASKS, ACTIVITIES, and SYSTEM_LOG.
- Security framework expanded in `src/Security.gs` for users, roles, permissions, admin checks, audit logging, audit summaries, and user activity review.
- Router framework added in `src/Router.gs` for module registration, navigation, and route dispatching.
- CRM module foundation rebuilt in `src/CRM.gs` for clients, leads, tasks, activities, route registration, and compatibility aliases.
- CRM UI foundation added in `src/CRM.html`.
- CRM Dashboard Sprint 8.2 added in `src/CRMDashboard.html`.
- Acquisitions Dashboard Sprint 8.3 added in `src/AcquisitionsDashboard.html`.
- Property Operations Dashboard Sprint 8.4 added in `src/PropertyDashboard.html`.
- Vendor Operations Dashboard Sprint 8.5 added in `src/VendorDashboard.html`.
- Automation Dashboard Sprint 8.6 added in `src/AutomationDashboard.html`.
- AI Command Center Dashboard Sprint 8.7 added in `src/AIDashboard.html`.
- Executive Dashboard Sprint 8.8 added in `src/ExecutiveDashboard.html`.
- External Data Integrations Sprint 8.9 added in `src/ExternalIntegrations.gs` and `src/ExternalIntegrations.html`.
- Automation Rule Templates Sprint 8.10 added in `src/AutomationTemplates.gs` and `src/AutomationTemplates.html`.
- Release Candidate QA Checklist Sprint 8.11 added in `docs/RELEASE_CANDIDATE_QA.md`.
- Dashboard Hub Sprint 8.12 added in `src/DashboardHub.gs` and `src/DashboardHub.html`.
- Sprint 13 Production Hardening added in `src/ProductionHardening.gs`, `src/ProductionHardening.html`, and `docs/PRODUCTION_HARDENING.md` with readiness audits, hardening reports, check persistence, performance checks, trigger audits, secrets review, automation JSON validation, integration safety checks, AI failure review, cache cleanup, log-retention review, and menu access.
- Dashboard shell wired to router navigation and route dispatching in `src/Index.html`.
- Validation framework expanded in `src/Validation.gs`.
- Test runner added in `src/TestRunner.gs`.
- REOS menu updated in `src/Main.gs` with Dashboard Hub, Dashboard, Executive Dashboard, CRM, CRM Dashboard, Acquisitions, Acquisitions Dashboard, Vendors, Vendor Dashboard, Properties, Property Dashboard, Automation, Automation Dashboard, Automation Templates, External Integrations, Production Hardening, AI Workspace, AI Dashboard, Admin, Initialize Workbook, Health Check, and Run Tests actions.
- Acquisitions module foundation added in `src/Acquisitions.gs`.
- Acquisitions UI foundation added in `src/Acquisitions.html`.
- Dashboard records review service added in `src/Dashboard.gs`.
- Role-management UI added in `src/Admin.html`.
- Workflow automation foundation rebuilt in `src/Automation.gs`.
- Vendor management foundation added in `src/Vendors.gs`.
- Vendor management UI added in `src/Vendors.html`.
- Property management module foundation added in `src/Properties.gs`.
- Property management UI added in `src/Properties.html`.
- GitHub/Apps Script sync guide added in `docs/APPS_SCRIPT_SYNC.md`.
- Deployment guide added in `docs/DEPLOYMENT.md`.
- Production release checklist template added in `docs/PRODUCTION_RELEASE_CHECKLIST.md`.
- AI core, lead qualification, next-best-action, summaries, workspace, and report generation foundations added.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Standardize lifecycle functions: `onOpen`, `onInstall`, `installREOS`, and `runHealthCheck`.
- Maintain module-ready architecture for CRM, acquisitions, properties, vendors, automation, dashboards, integrations, production hardening, and AI agents.
- Keep GitHub as the source of truth for all framework code.

## Phase Roadmap

| Phase | Status | Description |
| --- | --- | --- |
| 0. Repository & Architecture | Complete | Repository connected and accessible. |
| 1. Core Framework | In Progress | Bootstrap, config, utilities, setup, router, dashboard shell, health check, test runner. |
| 2. Database Layer | In Progress | Sheet-backed data access framework. |
| 3. Security | In Progress | Roles, permissions, audit logs, audit reports. |
| 4. CRM | In Progress | Contacts, leads, pipeline, activities, CRM dashboard. |
| 5. Acquisitions | In Progress | Distressed property and off-market lead workflows, acquisitions dashboard. |
| 6. Property Management | In Progress | Assets, inspections, maintenance, occupancy, drill-down actions, operations dashboard. |
| 7. Vendors | In Progress | Vendor registry, work orders, field services, operations dashboard. |
| 8. Automation Engine | In Progress | Scheduled jobs, reminders, workflow scans, trigger management, automation UI, automation dashboard, rule editor, templates. |
| 9. AI Agents | In Progress | AI core, provider abstraction, lead qualification, next-best-action, summary generation, AI workspace, AI command center, report generation, document processing. |
| 10. Dashboards | In Progress | Dashboard framework, dashboard hub, module dashboards, executive dashboard, record review, drill-downs, charts, and pipeline visualizations. |
| 11. External Integrations | In Progress | Provider registry, dry-run API stubs, request logs, property data mapping, skip tracing, public records, geocoding, and future live API connectors. |
| 12. Testing | In Progress | QA scripts, validation, regression checks, release candidate checklist. |
| 13. Production Hardening | In Progress | Readiness audits, performance checks, trigger audits, secrets review, log retention, cache cleanup, release gate reporting. |
| 14. Deployment | In Progress | Production release process, checklists, documentation, sync workflow. |

## Core Framework Acceptance Criteria

- Spreadsheet opens with a REOS menu.
- Install routine creates required sheets and seeds settings/lookups.
- Health check validates required sheets, including `AUTOMATION_TEMPLATES`, `HARDENING_REPORTS`, and `HARDENING_CHECKS`.
- Dashboard shell opens from the REOS menu.
- Dashboard Hub provides permission-aware navigation, quick actions, enterprise KPIs, notifications, system health, recent activity, and global search.
- Logger writes structured records to `SYSTEM_LOG`.
- Database layer can insert, update, query, and soft-delete sheet records.
- Security layer can enforce permissions and generate audit reports.
- Router can register modules, build permission-aware navigation, and dispatch server routes.
- CRM foundation and CRM Dashboard can manage and review client/lead activity.
- Acquisitions Dashboard can display pipeline, distress analytics, geographic distribution, follow-ups, and AI opportunity queue.
- Property Operations Dashboard can display occupancy, property status, maintenance backlog, and recent properties.
- Vendor Operations Dashboard can display vendor KPIs, service charts, active work orders, and export data.
- Automation Dashboard can display trigger health, rule execution, run status, and job controls.
- Automation Templates can seed reusable templates and create automation rules from templates with JSON overrides.
- AI Command Center can display AI usage KPIs, request charts, token tracking, logs, config review, and AI queue.
- Executive Dashboard can display enterprise KPI rollups, health panels, alerts, chart rollups, and export data.
- External Integrations can seed providers, manage provider configuration, run dry-run requests, log external requests, and map external property/lead records.
- Production Hardening can run readiness audits, persist hardening reports/checks, review workbook performance, audit triggers, validate automation JSON, review external integration safety, review AI failure rates, clear dashboard cache, and identify log-retention cleanup candidates.
- Test runner can verify setup, schema, services, router, security, validation, and health status.
- Release Candidate QA checklist supports end-to-end module QA, dashboard QA, automation QA, integration QA, AI QA, security QA, deployment QA, and go/no-go release decisions.
- Production release checklist supports validation, sync, smoke testing, security review, automation review, backup, monitoring, and rollback.

## Next Build Items

1. Add dashboard print/PDF export support.
2. Add document/photo management foundation.
3. Add release notes template.
4. Add mobile field operations shell.
5. Add final release candidate package.
