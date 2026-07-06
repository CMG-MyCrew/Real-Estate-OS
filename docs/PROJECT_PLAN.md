# REOS Enterprise v3.0 Living Project Plan

Repository: `CMG-MyCrew/Real-Estate-OS`
Primary platform: Google Apps Script + Google Sheets + GitHub

## Current Sprint: Enterprise Dashboards

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
- CRM Dashboard Sprint 8.2 added in `src/CRMDashboard.html` with KPI cards, lead funnel, status charts, task priority, activity charts, follow-up queue, date filters, CSV export, and menu access.
- Acquisitions Dashboard Sprint 8.3 added in `src/AcquisitionsDashboard.html` with KPI cards, acquisition funnel, distress analytics, city distribution, follow-up queues, AI opportunity queue, date filters, CSV export, and menu access.
- Property Operations Dashboard Sprint 8.4 added in `src/PropertyDashboard.html` with occupancy KPIs, property status charts, property type analytics, maintenance backlog, recent properties, date filters, CSV export, and menu access.
- Vendor Operations Dashboard Sprint 8.5 added in `src/VendorDashboard.html` with vendor KPIs, service category analytics, work-order status charts, priority workload charts, active work-order focus, date filters, CSV export, and menu access.
- Automation Dashboard Sprint 8.6 added in `src/AutomationDashboard.html` with trigger health, rule execution metrics, run status charts, rules-by-module charts, recent runs, trigger controls, job execution, date filters, CSV export, and menu access.
- AI Command Center Dashboard Sprint 8.7 added in `src/AIDashboard.html` with AI usage KPIs, request-type charts, provider/status charts, token tracking, AI logs, configuration review, AI opportunity queue, date filters, CSV export, and menu access.
- Executive Dashboard Sprint 8.8 added in `src/ExecutiveDashboard.html` with enterprise KPI rollup, health panels, alert section, chart rollups, executive summary table, date filters, CSV export, and menu access.
- External Data Integrations Sprint 8.9 added in `src/ExternalIntegrations.gs` and `src/ExternalIntegrations.html` with provider registry, dry-run testing, request logging, response mapping, provider configuration, health KPIs, and menu access for MLS, ATTOM, BatchData, PropertyRadar, county records, and Google Maps stubs.
- Dashboard shell wired to router navigation and route dispatching in `src/Index.html`.
- Validation framework expanded in `src/Validation.gs` with required fields, allowed values, lookup validation, duplicates, number/boolean/date/email/phone validation, sanitizing, and clean validation responses.
- Test runner added in `src/TestRunner.gs` for setup verification, health checks, required sheets, required headers, services, security, router, and validation.
- REOS menu updated in `src/Main.gs` with Dashboard, Executive Dashboard, CRM, CRM Dashboard, Acquisitions, Acquisitions Dashboard, Vendors, Vendor Dashboard, Properties, Property Dashboard, Automation, Automation Dashboard, External Integrations, AI Workspace, AI Dashboard, Admin, Initialize Workbook, Health Check, and Run Tests actions.
- Acquisitions module foundation added in `src/Acquisitions.gs` for distressed/off-market lead intake, scoring, pipeline, follow-ups, and dashboard metrics.
- Acquisitions UI foundation added in `src/Acquisitions.html`.
- Acquisition pipeline and distress indicator lookups added to setup seed data.
- Dashboard records review service added in `src/Dashboard.gs`.
- Main dashboard updated in `src/Index.html` with KPI cards, recent CRM clients, recent acquisition leads, open task count, and record search.
- Role-management server actions added in `src/Security.gs` for admin user creation, role updates, activation, and deactivation.
- Role-management UI added in `src/Admin.html`.
- Workflow automation foundation rebuilt in `src/Automation.gs` with scheduled job registry, follow-up scanner, overdue task scanner, acquisition review, trigger install/remove functions, rule seeding, dispatching, run logs, and rule editor service actions.
- Vendor management foundation added in `src/Vendors.gs` for vendor registry, work orders, assignments, statuses, search, and KPIs.
- Vendor management UI added in `src/Vendors.html`.
- Vendor and work-order permissions added to `src/Security.gs`.
- Vendor service categories and work-order statuses added to setup seed data.
- Deployment guide added in `docs/DEPLOYMENT.md` with Apps Script setup, required files, first-run checklist, testing checklist, automation setup, production release checklist, and rollback plan.
- Production release checklist template added in `docs/PRODUCTION_RELEASE_CHECKLIST.md` with pre-release validation, Apps Script sync, security review, smoke tests, trigger review, backup, monitoring, and rollback.
- Dashboard drill-down record actions added in `src/Dashboard.gs` and `src/Index.html` for client, lead, vendor, work-order, and task details with contextual actions.
- Security audit report view added in `src/Admin.html` with event summary, permission-denied review, and user activity lookup.
- Automation management UI added in `src/Automation.html` with job controls, trigger management, rule management, rule editor forms, run history, and KPI summary.
- Automation service expanded in `src/Automation.gs` with admin dashboard data, trigger inspection, job-level manual execution, rule create/update/validate/run actions, rule activation toggles, and run history access.
- Property management module foundation added in `src/Properties.gs` for assets, units, inspections, maintenance requests, occupancy tracking, search, and KPIs.
- Property management UI added in `src/Properties.html`.
- Property, maintenance, and inspection permissions added to `src/Security.gs`.
- Property module wired into `src/Main.gs` menu, initialization, health check, and lookup seed data.
- Property dashboard drill-down actions added in `src/Dashboard.gs` and `src/Index.html` for status updates, occupancy updates, unit creation, inspection creation, maintenance creation, maintenance status updates, and related-record history views.
- GitHub/Apps Script sync guide added in `docs/APPS_SCRIPT_SYNC.md` with manual sync, clasp option, file mapping, release workflow, and troubleshooting.
- Dashboard chart data service added in `src/Dashboard.gs` for acquisition pipeline, lead priority, work-order status, property occupancy, maintenance status, and operating snapshot.
- Dashboard charts and pipeline visualizations added in `src/Index.html`.
- Dashboard framework Sprint 8.1 added in `src/DashboardService.gs`, `src/DashboardComponents.html`, `src/DashboardFilters.html`, and `src/DashboardCharts.js` with reusable KPI, chart, table, alert, filter, cache, date-range, and CSV export services.
- AI core framework Sprint 1 rebuilt in `src/AI.gs` with provider abstraction, prompt builder, response parser, OpenAI-ready connector, stub rules engine, token/cost tracking placeholders, config helpers, and AI request audit logging.
- AI lifecycle wired into `src/Main.gs` initialization and health checks through `AI_REQUESTS`.
- AI lead qualification engine Sprint 2 added in `src/AI.gs` with seller motivation analysis, distress signal detection, investment scoring, confidence scoring, risk flags, missing-data checks, recommended strategy, and next-best-action.
- AI use permission added to Agent and Coordinator roles in `src/Security.gs`.
- AI next-best-action engine Sprint 3 added in `src/AI.gs` with ranked action plans, outreach channel recommendations, priority/due-date logic, action reasoning, batch recommendations, and optional task creation.
- AI summary generator Sprint 4 added in `src/AISummaries.gs` with executive summaries, property overview, seller profile, motivation summary, risk summary, equity summary, offer guidance, and follow-up strategy.
- AI Workspace Sprint 6 added in `src/AI.html` with lead search, AI config, qualification, next-best-action, executive summary, action task creation, opportunity queue, and AI request log review.
- AI Workspace wired into `src/Main.gs` menu through `showAI`.
- AI report generation Sprint 7 added in `src/AIReports.gs` with Google Docs/PDF acquisition reports, seller summaries, negotiation guides, investment snapshots, Drive folder management, risk matrix, action plan, and report links.
- AI Workspace updated with report generation actions and reports folder access.

### Active Objectives

- Keep `REOS` as the shared namespace across all Apps Script files.
- Standardize lifecycle functions: `onOpen`, `onInstall`, `installREOS`, and `runHealthCheck`.
- Maintain module-ready architecture for CRM, acquisitions, properties, vendors, automation, dashboards, integrations, and AI agents.
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
| 8. Automation Engine | In Progress | Scheduled jobs, reminders, workflow scans, trigger management, automation UI, automation dashboard, rule editor. |
| 9. AI Agents | In Progress | AI core, provider abstraction, lead qualification, next-best-action, summary generation, AI workspace, AI command center, report generation, document processing. |
| 10. Dashboards | In Progress | Dashboard framework, CRM dashboard, acquisitions dashboard, property dashboard, vendor dashboard, automation dashboard, AI dashboard, executive dashboard, record review, drill-downs, charts, and pipeline visualizations. |
| 11. External Integrations | In Progress | Provider registry, dry-run API stubs, request logs, property data mapping, skip tracing, public records, geocoding, and future live API connectors. |
| 12. Testing | In Progress | QA scripts, validation, regression checks. |
| 13. Deployment | In Progress | Production release process, checklists, documentation, sync workflow. |

## Core Framework Acceptance Criteria

- Spreadsheet opens with a REOS menu.
- Install routine creates required sheets and seeds settings/lookups.
- Health check validates required sheets.
- Dashboard shell opens from the REOS menu.
- Logger writes structured records to `SYSTEM_LOG`.
- Database layer can insert, update, query, and soft-delete sheet records.
- Workbook setup creates sheets, headers, filters, frozen rows, and HOME status records.
- Security layer can seed the initial admin, create users, update roles, deactivate users, reactivate users, enforce permissions, and generate audit reports.
- Router can register modules, build permission-aware navigation, and dispatch server routes.
- CRM foundation can create/search/update/archive clients, create/update/list leads, create tasks, and log activities.
- CRM Dashboard can display KPIs, lead/status charts, task/activity charts, follow-up queue, recent clients, date filters, and CSV export data.
- Acquisitions Dashboard can display KPIs, acquisition pipeline, distress analytics, geographic distribution, hot leads, follow-up queue, AI opportunity queue, date filters, and CSV export data.
- Property Operations Dashboard can display occupancy KPIs, property status charts, property type analytics, maintenance status, maintenance backlog, recent properties, date filters, and CSV export data.
- Vendor Operations Dashboard can display vendor KPIs, service category charts, work-order status charts, priority workload, recent vendors, active work orders, date filters, and CSV export data.
- Automation Dashboard can display trigger health, rule execution charts, run status metrics, rules-by-module metrics, recent runs, trigger controls, job execution controls, date filters, and CSV export data.
- AI Command Center can display AI usage KPIs, request-type charts, provider/status charts, token tracking, AI logs, configuration review, AI opportunity queue, date filters, and CSV export data.
- Executive Dashboard can display enterprise KPI rollups, cross-module health panels, alerts, chart rollups, executive summary, date filters, and CSV export data.
- External Integrations can seed providers, manage provider configuration, run dry-run requests, log external requests, map external property/lead records, and prepare live API connectors.
- Main dashboard can load modules, dispatch routes, initialize workbook, and run health checks.
- Validation framework supports reusable record validation, lookup validation, duplicate checks, and clean error handling.
- Test runner can verify setup, schema, services, router, security, validation, and health status.
- Acquisitions module can create/search/update acquisition leads, calculate priority, move pipeline stages, create follow-up tasks, and return dashboard KPIs.
- Dashboard records review can display KPIs, recent clients, recent acquisition leads, open task count, and record search results.
- Dashboard service can return module dashboards with KPIs, charts, tables, alerts, date filters, caching, and CSV export data.
- Admin UI can create users, list users, update roles, activate users, deactivate users, review security events, review denied permissions, and inspect user activity history.
- Automation engine can install/remove scheduled jobs, run follow-up scans, escalate overdue tasks, review acquisition leads, write automation run logs, manage automation from UI, and create/edit/validate/run automation rules.
- Vendor module can create/search/update vendors, create/search/assign/update work orders, and return vendor/work-order KPIs.
- Property module can create/search/update properties, create units, create inspections, create/search maintenance requests, optionally create vendor work orders, return property KPIs, and support property dashboard drill-down actions.
- AI core can initialize config, build prompts, run stub lead qualification, support OpenAI-ready calls, parse responses, track usage, and log AI requests.
- AI lead qualification can calculate seller motivation, distress signals, opportunity score, confidence, risk flags, recommended strategy, and next-best-action.
- AI next-best-action can rank recommended actions, explain reasoning, assign priority, set due dates, recommend outreach channels, and create CRM tasks.
- AI summaries can generate executive lead summaries, seller profiles, risk summaries, preliminary offer guidance, and follow-up strategies.
- AI Workspace can run qualification, next-best-action, summary generation, task creation, queue review, config management, request-log review, and report generation from a UI.
- AI reports can create Google Docs and PDF-ready acquisition reports with seller, risk, offer, investment, negotiation, and action-plan sections.
- Production release checklist supports validation, sync, smoke testing, security review, automation review, backup, monitoring, and rollback.
- Deployment guide documents setup, authorization, validation, automation, production release, and rollback.
- Apps Script sync guide documents GitHub-to-runtime file mapping, manual sync, clasp workflow, release process, and troubleshooting.
- Dashboard drill-down supports viewing full records, activity history, related property records, and contextual actions.
- Dashboard visualizations display acquisition pipeline, lead priority, work-order status, property occupancy, maintenance status, and operating snapshot charts.

## Next Build Items

1. Add automation rule templates library.
2. Add release candidate QA checklist.
3. Add module dashboard navigation hub.
4. Add dashboard print/PDF export support.
5. Add document/photo management foundation.
