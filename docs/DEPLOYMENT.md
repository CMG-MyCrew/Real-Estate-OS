# REOS Enterprise v3.0 Deployment Guide

Repository: `CMG-MyCrew/Real-Estate-OS`
Platform: Google Apps Script + Google Sheets + GitHub

## 1. Deployment Model

REOS Enterprise is deployed as a Google Sheets-bound Apps Script application.

GitHub remains the source of truth for code. Google Apps Script is the runtime.

Recommended flow:

1. Build and review code in GitHub.
2. Sync or copy Apps Script files into the bound Apps Script project.
3. Bind the script to the production REOS Google Sheet.
4. Run the install/setup functions.
5. Validate with the test runner.
6. Release to users.

## 2. Required Files

The Apps Script project should include these files from `/src`:

- `Main.gs`
- `Config.gs`
- `Database.gs`
- `Utilities.gs`
- `Setup.gs`
- `Security.gs`
- `Router.gs`
- `Validation.gs`
- `TestRunner.gs`
- `Dashboard.gs`
- `CRM.gs`
- `Acquisitions.gs`
- `Automation.gs`
- `Vendors.gs`
- `Index.html`
- `CRM.html`
- `Acquisitions.html`
- `Admin.html`
- `Vendors.html`

The Apps Script project should also include:

- `appsscript.json`

## 3. Apps Script Manifest

The manifest should use the V8 runtime and include scopes for Sheets, UI, Drive, triggers, and user email.

Required scopes currently used by REOS:

```json
[
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.container.ui",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/script.scriptapp",
  "https://www.googleapis.com/auth/userinfo.email"
]
```

## 4. First-Time Setup

### Step 1 — Create or open the master Google Sheet

Use a dedicated production workbook, for example:

`REOS Enterprise - Production`

### Step 2 — Open Apps Script

In Google Sheets:

`Extensions → Apps Script`

### Step 3 — Add project files

Copy each `.gs` and `.html` file from `/src` into Apps Script.

Use matching Apps Script file names without the `/src/` prefix.

Example:

`src/Main.gs` → `Main.gs`

### Step 4 — Add manifest

In Apps Script settings, enable manifest editing and replace the manifest with `appsscript.json` from the repository.

### Step 5 — Save and authorize

Save all files, then run:

`installREOS`

Apps Script will request permissions. Approve the required authorization prompts.

### Step 6 — Initialize workbook

Run one of the following:

- `reosInitializeWorkbook`
- Or open the spreadsheet and use `REOS → Initialize Workbook`

This creates/validates core sheets, headers, seed settings, lookups, and the initial admin user.

## 5. First-Run Checklist

After setup, confirm these sheets exist:

- `HOME`
- `SETTINGS`
- `USERS`
- `LOOKUPS`
- `CRM`
- `LEADS`
- `TASKS`
- `ACTIVITIES`
- `SYSTEM_LOG`
- `VENDORS`
- `WORK_ORDERS`
- `AUTOMATION_RULES`
- `AUTOMATION_RUNS`
- `TEST_RESULTS`

Then confirm the REOS menu appears in the spreadsheet with:

- Open Dashboard
- Open CRM
- Open Acquisitions
- Open Vendors
- Open Admin
- Initialize Workbook
- Health Check
- Run Tests

## 6. Validation Checklist

Run:

`reosRunTests`

Expected result:

- Test report writes to `TEST_RESULTS`
- Required sheets pass
- Required headers pass
- Core services pass
- Security passes
- Router passes
- Validation passes
- Health check passes

Also manually test:

- Open Dashboard
- Create CRM client
- Create acquisition lead
- Create vendor
- Create work order
- Create admin user
- Update user role

## 7. Automation Setup

Workflow automation exists in `Automation.gs`.

Available manual functions:

- `reosAutomationRunAll`
- `reosAutomationInstallTriggers`
- `reosAutomationRemoveTriggers`
- `reosAutomationDailyFollowUps`
- `reosAutomationOverdueTasks`
- `reosAutomationAcquisitionReview`

For production, run:

`reosAutomationInstallTriggers`

This installs scheduled trigger jobs for:

- Daily follow-up scanning
- Daily overdue task scanning
- Hourly acquisition lead review

Automation run history is written to:

- `AUTOMATION_RUNS`
- `SYSTEM_LOG`

## 8. Production Release Checklist

Before releasing to users:

- Confirm all code files are synced from GitHub.
- Run `reosInitializeWorkbook`.
- Run `reosRunTests`.
- Confirm `TEST_RESULTS` has no failures.
- Confirm the first admin exists in `USERS`.
- Confirm role permissions are correct.
- Confirm vendors and work-order sheets exist.
- Confirm automation sheets exist.
- Confirm dashboard loads without errors.
- Confirm Apps Script triggers are installed if automation is enabled.
- Make a backup copy of the production workbook.

## 9. Rollback Plan

If a release fails:

1. Disable Apps Script triggers using `reosAutomationRemoveTriggers`.
2. Restore the previous Apps Script version or copy code from the prior GitHub commit.
3. Restore the latest backup workbook if data structure was affected.
4. Run `reosRunTests` again.
5. Log the issue in GitHub before re-release.

## 10. Operating Rules

- GitHub is the source of truth.
- Apps Script is the runtime copy.
- Do not edit production Apps Script manually unless the change is also committed to GitHub.
- Run tests after every structural change.
- Back up the workbook before major releases.
- Keep `docs/PROJECT_PLAN.md` updated after each sprint.

## 11. Current Production Status

Current modules available for deployment:

- Core framework
- CRM
- Acquisitions
- Dashboard records review
- Security and role management
- Workflow automation foundation
- Vendor management and work orders

Next planned module:

- Property management foundation
