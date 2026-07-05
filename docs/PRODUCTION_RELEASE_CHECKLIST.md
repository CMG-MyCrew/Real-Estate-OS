# REOS Enterprise v3.0 Production Release Checklist

Repository: `CMG-MyCrew/Real-Estate-OS`
Runtime: Google Apps Script bound to Google Sheets
Source of truth: GitHub

## 1. Release Information

| Field | Value |
| --- | --- |
| Release Version |  |
| Release Date |  |
| Release Owner |  |
| GitHub Branch |  |
| Commit SHA |  |
| Apps Script Project |  |
| Production Workbook |  |
| Backup Workbook |  |

## 2. Pre-Release Validation

- [ ] Confirm all intended files are committed to GitHub.
- [ ] Confirm `docs/PROJECT_PLAN.md` is current.
- [ ] Confirm `docs/APPS_SCRIPT_SYNC.md` matches the deployment method.
- [ ] Review changed `.gs` files for syntax issues.
- [ ] Review changed `.html` files for missing server function calls.
- [ ] Confirm no API keys, secrets, tokens, or credentials are committed.
- [ ] Confirm the release branch is approved for deployment.

## 3. Apps Script Sync Checklist

- [ ] Open the production Apps Script project.
- [ ] Sync all changed files from GitHub `/src`.
- [ ] Sync `appsscript.json` if scopes or runtime settings changed.
- [ ] Save the Apps Script project.
- [ ] Confirm Apps Script shows no syntax errors.
- [ ] Run `onOpen` manually.
- [ ] Refresh the production Google Sheet.
- [ ] Confirm the `REOS` menu appears.

## 4. Workbook Setup Validation

- [ ] Run `reosInitializeWorkbook`.
- [ ] Run `runHealthCheck`.
- [ ] Confirm required sheets exist.
- [ ] Confirm required headers exist.
- [ ] Confirm filters, frozen rows, and formatting are intact.
- [ ] Confirm `SYSTEM_LOG` is writing records.
- [ ] Confirm `AI_REQUESTS` exists if AI is enabled.
- [ ] Confirm `AUTOMATION_RULES` and `AUTOMATION_RUNS` exist.

## 5. Test Runner

- [ ] Run `reosRunTests`.
- [ ] Confirm all setup tests pass.
- [ ] Confirm all schema tests pass.
- [ ] Confirm security tests pass.
- [ ] Confirm router tests pass.
- [ ] Confirm validation tests pass.
- [ ] Confirm dashboard tests pass.
- [ ] Confirm no critical errors appear in `TEST_RESULTS`.

## 6. Security Review

- [ ] Confirm current admin user exists in `USERS`.
- [ ] Confirm admin role has full access.
- [ ] Confirm inactive users remain inactive.
- [ ] Confirm Assistant users do not have write/admin access beyond intended permissions.
- [ ] Confirm Agent and Coordinator roles have correct CRM, lead, vendor, property, and AI permissions.
- [ ] Open Admin UI.
- [ ] Review security audit report.
- [ ] Review recent permission-denied events.
- [ ] Confirm no unauthorized user activity.

## 7. Module Smoke Tests

### Dashboard

- [ ] Open Dashboard.
- [ ] Confirm KPIs load.
- [ ] Confirm charts load.
- [ ] Confirm record search works.
- [ ] Confirm drill-down opens records.
- [ ] Confirm contextual actions work.

### CRM

- [ ] Open CRM.
- [ ] Create/search client test.
- [ ] Create/search lead test.
- [ ] Create task test.
- [ ] Log activity test.

### Acquisitions

- [ ] Open Acquisitions.
- [ ] Create acquisition lead test.
- [ ] Move pipeline stage test.
- [ ] Confirm priority/scoring logic.
- [ ] Confirm follow-up task creation.

### Vendors

- [ ] Open Vendors.
- [ ] Create/search vendor test.
- [ ] Create work order test.
- [ ] Assign vendor test.
- [ ] Update work order status test.

### Properties

- [ ] Open Properties.
- [ ] Create/search property test.
- [ ] Create unit test.
- [ ] Create inspection test.
- [ ] Create maintenance request test.
- [ ] Confirm property dashboard drill-down actions.

### Automation

- [ ] Open Automation.
- [ ] Confirm jobs load.
- [ ] Confirm rules load.
- [ ] Create/edit automation rule test.
- [ ] Validate rule JSON test.
- [ ] Run rule test.
- [ ] Confirm run history updates.

### AI Workspace

- [ ] Open AI Workspace.
- [ ] Confirm config loads.
- [ ] Search/select lead.
- [ ] Run qualification.
- [ ] Run next-best-action.
- [ ] Generate executive summary.
- [ ] Create action task.
- [ ] Generate Google Doc/PDF report if Drive scopes are authorized.

## 8. Automation Trigger Review

- [ ] Open Automation UI.
- [ ] Confirm installed triggers match expected jobs.
- [ ] Install triggers if missing.
- [ ] Remove duplicate triggers if present.
- [ ] Run each job manually.
- [ ] Confirm `AUTOMATION_RUNS` logs success/failure.
- [ ] Confirm no automation creates duplicate tasks unexpectedly.

## 9. AI Configuration Review

- [ ] Confirm default provider is `stub` unless external AI is approved.
- [ ] Confirm external calls are disabled unless intentionally enabled.
- [ ] Confirm API keys are stored only in Script Properties.
- [ ] Confirm AI request logs write to `AI_REQUESTS`.
- [ ] Confirm AI reports save to the correct Drive folder.

## 10. Backup Checklist

- [ ] Create a copy of the production workbook before release.
- [ ] Record backup workbook URL.
- [ ] Export Apps Script project or confirm GitHub commit SHA.
- [ ] Confirm rollback commit SHA.
- [ ] Confirm production Drive report folder remains accessible.

## 11. Release Approval

| Reviewer | Area | Approved |
| --- | --- | --- |
|  | Security |  |
|  | Data / Workbook |  |
|  | Automation |  |
|  | AI |  |
|  | Operations |  |

## 12. Post-Release Monitoring

- [ ] Monitor `SYSTEM_LOG` for errors.
- [ ] Monitor `AUTOMATION_RUNS` for failed runs.
- [ ] Monitor `AI_REQUESTS` for AI errors.
- [ ] Confirm users can access required modules.
- [ ] Confirm no unexpected permission-denied spikes.
- [ ] Confirm workbook performance remains acceptable.
- [ ] Confirm production users understand new features.

## 13. Rollback Checklist

Use rollback if the release creates critical errors, blocks production users, corrupts records, or causes unsafe automation behavior.

- [ ] Disable automation triggers.
- [ ] Stop using the production workbook.
- [ ] Restore prior Apps Script files from the previous GitHub commit.
- [ ] Save Apps Script project.
- [ ] Refresh the workbook.
- [ ] Run `runHealthCheck`.
- [ ] Run `reosRunTests`.
- [ ] Restore from backup workbook if data was corrupted.
- [ ] Re-enable only approved triggers.
- [ ] Log rollback reason in `docs/PROJECT_PLAN.md` or release notes.

## 14. Final Release Notes

| Item | Notes |
| --- | --- |
| Released Features |  |
| Known Issues |  |
| Deferred Items |  |
| Rollback Commit |  |
| Production Confirmation |  |
