# REOS Enterprise v3.0 Release Candidate QA Checklist

Repository: `CMG-MyCrew/Real-Estate-OS`
Release type: Release Candidate
Runtime: Google Apps Script + Google Sheets

## 1. Release Candidate Metadata

| Field | Value |
| --- | --- |
| RC Version |  |
| RC Date |  |
| QA Owner |  |
| GitHub Branch |  |
| Commit SHA |  |
| Apps Script Project |  |
| Test Workbook |  |
| Production Workbook |  |
| Result | Pass / Fail / Blocked |

## 2. Pre-QA Setup

- [ ] Confirm GitHub branch is current.
- [ ] Confirm Apps Script runtime has all `/src` files synced.
- [ ] Confirm `appsscript.json` is synced if scopes changed.
- [ ] Confirm no secrets are committed to GitHub.
- [ ] Create or refresh the QA workbook.
- [ ] Run `onOpen` manually.
- [ ] Confirm the `REOS` menu appears.
- [ ] Run `reosInitializeWorkbook`.
- [ ] Run `runHealthCheck`.
- [ ] Run `reosRunTests`.

## 3. Core Framework QA

- [ ] Required sheets are created.
- [ ] Required headers are present.
- [ ] Lookup values are seeded.
- [ ] Settings are seeded.
- [ ] Initial admin is seeded.
- [ ] `SYSTEM_LOG` writes records.
- [ ] Router navigation loads.
- [ ] Dashboard opens.
- [ ] Health check returns no critical missing sheets.

## 4. Security & Permissions QA

- [ ] Admin can open Admin UI.
- [ ] Admin can create users.
- [ ] Admin can update roles.
- [ ] Admin can deactivate/reactivate users.
- [ ] Non-admin users are blocked from admin-only views.
- [ ] Permission-denied events are logged.
- [ ] Security audit report loads.
- [ ] User activity lookup works.

## 5. CRM QA

- [ ] Open CRM module.
- [ ] Create client.
- [ ] Search client.
- [ ] Update client.
- [ ] Archive client.
- [ ] Create CRM lead.
- [ ] Create task.
- [ ] Log activity.
- [ ] Open CRM Dashboard.
- [ ] Confirm KPI cards load.
- [ ] Confirm charts load.
- [ ] Confirm follow-up queue loads.
- [ ] Confirm CSV export returns data.

## 6. Acquisitions QA

- [ ] Open Acquisitions module.
- [ ] Create acquisition lead.
- [ ] Confirm lead scoring and priority.
- [ ] Move pipeline stage.
- [ ] Create follow-up task.
- [ ] Search acquisition lead.
- [ ] Open Acquisitions Dashboard.
- [ ] Confirm funnel loads.
- [ ] Confirm distress analytics load.
- [ ] Confirm city distribution loads.
- [ ] Confirm AI opportunity queue loads.
- [ ] Confirm CSV export returns data.

## 7. Property Operations QA

- [ ] Open Properties module.
- [ ] Create property.
- [ ] Create unit.
- [ ] Create inspection.
- [ ] Create maintenance request.
- [ ] Search property.
- [ ] Search maintenance.
- [ ] Open Property Dashboard.
- [ ] Confirm occupancy KPIs load.
- [ ] Confirm property status charts load.
- [ ] Confirm maintenance backlog loads.
- [ ] Confirm CSV export returns data.
- [ ] Confirm dashboard drill-down property actions work.

## 8. Vendor Operations QA

- [ ] Open Vendors module.
- [ ] Create vendor.
- [ ] Search vendor.
- [ ] Create work order.
- [ ] Assign vendor to work order.
- [ ] Update work order status.
- [ ] Open Vendor Dashboard.
- [ ] Confirm vendor KPIs load.
- [ ] Confirm service category chart loads.
- [ ] Confirm work-order status chart loads.
- [ ] Confirm active work-order focus table loads.
- [ ] Confirm CSV export returns data.

## 9. Automation QA

- [ ] Open Automation UI.
- [ ] Confirm jobs load.
- [ ] Confirm rules load.
- [ ] Create automation rule.
- [ ] Validate rule JSON.
- [ ] Run rule manually.
- [ ] Confirm run history updates.
- [ ] Open Automation Dashboard.
- [ ] Confirm trigger health loads.
- [ ] Install triggers.
- [ ] Remove duplicate triggers.
- [ ] Run individual job.
- [ ] Run all jobs.
- [ ] Confirm CSV export returns data.

## 10. Automation Templates QA

- [ ] Open Automation Templates.
- [ ] Seed templates.
- [ ] Confirm template KPIs load.
- [ ] Select a template.
- [ ] Create rule from template with defaults.
- [ ] Create rule from template with JSON overrides.
- [ ] Confirm created rules appear in Automation UI.
- [ ] Confirm invalid JSON is rejected.

## 11. External Integrations QA

- [ ] Open External Integrations.
- [ ] Initialize providers.
- [ ] Confirm provider registry loads.
- [ ] Confirm dry-run providers are marked dry-run.
- [ ] Edit provider settings.
- [ ] Run ATTOM property lookup dry-run.
- [ ] Run BatchData skip trace dry-run.
- [ ] Run PropertyRadar distress search dry-run.
- [ ] Confirm requests are logged in `EXTERNAL_REQUESTS`.
- [ ] Confirm no live API call occurs while Dry Run is enabled.

## 12. AI QA

- [ ] Open AI Workspace.
- [ ] Confirm AI config loads.
- [ ] Search/select acquisition lead.
- [ ] Run lead qualification.
- [ ] Run next-best-action.
- [ ] Generate executive summary.
- [ ] Create action task.
- [ ] Generate acquisition report.
- [ ] Open AI Dashboard.
- [ ] Confirm AI request KPIs load.
- [ ] Confirm provider/status charts load.
- [ ] Confirm request log table loads.
- [ ] Confirm CSV export returns data.

## 13. Executive Dashboard QA

- [ ] Open Executive Dashboard.
- [ ] Confirm enterprise KPI rollup loads.
- [ ] Confirm health panels load.
- [ ] Confirm alerts load when applicable.
- [ ] Confirm chart rollups load.
- [ ] Confirm date filters work.
- [ ] Confirm CSV export returns data.

## 14. Deployment & Sync QA

- [ ] Confirm `docs/APPS_SCRIPT_SYNC.md` is accurate.
- [ ] Confirm `docs/PRODUCTION_RELEASE_CHECKLIST.md` is accurate.
- [ ] Confirm changed files are listed in release notes.
- [ ] Confirm rollback commit SHA is documented.
- [ ] Confirm production backup plan is ready.

## 15. Regression Test Matrix

| Area | Test | Result | Notes |
| --- | --- | --- | --- |
| Core | Open menu |  |  |
| Core | Health check |  |  |
| Security | Admin enforcement |  |  |
| CRM | Client workflow |  |  |
| Acquisitions | Lead workflow |  |  |
| Properties | Property workflow |  |  |
| Vendors | Work order workflow |  |  |
| Automation | Trigger workflow |  |  |
| Templates | Create rule from template |  |  |
| Integrations | Dry-run request |  |  |
| AI | Qualification workflow |  |  |
| Dashboards | Executive rollup |  |  |

## 16. Release Decision

| Decision | Criteria |
| --- | --- |
| Ship RC | All critical checks pass, no blocker defects. |
| Hold RC | One or more blocker defects remain. |
| Patch RC | Minor issues can be fixed without architecture changes. |
| Rollback | QA finds data corruption, permission risk, or unsafe automation behavior. |

## 17. Defects / Follow-Up Items

| ID | Severity | Area | Description | Owner | Status |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |
