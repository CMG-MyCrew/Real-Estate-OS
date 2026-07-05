# REOS Enterprise v3.0 GitHub / Apps Script Sync Guide

Repository: `CMG-MyCrew/Real-Estate-OS`
Runtime: Google Apps Script bound to Google Sheets
Source of truth: GitHub

## 1. Purpose

This guide defines how REOS code moves from GitHub into Google Apps Script.

GitHub stores the canonical codebase. Apps Script runs the production copy attached to the REOS Google Sheet.

## 2. Recommended Sync Options

REOS can be synced in two ways:

1. Manual copy/paste sync through the Apps Script editor.
2. `clasp` command-line sync for repeatable deployments.

Manual sync is easiest for early builds. `clasp` is recommended once the platform stabilizes.

## 3. File Mapping

Copy files from `/src` into the Apps Script project using the same base filename.

| GitHub Path | Apps Script File |
| --- | --- |
| `src/Main.gs` | `Main.gs` |
| `src/Config.gs` | `Config.gs` |
| `src/Database.gs` | `Database.gs` |
| `src/Utilities.gs` | `Utilities.gs` |
| `src/Setup.gs` | `Setup.gs` |
| `src/Security.gs` | `Security.gs` |
| `src/Router.gs` | `Router.gs` |
| `src/Validation.gs` | `Validation.gs` |
| `src/TestRunner.gs` | `TestRunner.gs` |
| `src/Dashboard.gs` | `Dashboard.gs` |
| `src/CRM.gs` | `CRM.gs` |
| `src/Acquisitions.gs` | `Acquisitions.gs` |
| `src/Vendors.gs` | `Vendors.gs` |
| `src/Properties.gs` | `Properties.gs` |
| `src/Automation.gs` | `Automation.gs` |
| `src/Index.html` | `Index.html` |
| `src/CRM.html` | `CRM.html` |
| `src/Acquisitions.html` | `Acquisitions.html` |
| `src/Vendors.html` | `Vendors.html` |
| `src/Properties.html` | `Properties.html` |
| `src/Admin.html` | `Admin.html` |
| `src/Automation.html` | `Automation.html` |
| `appsscript.json` | `appsscript.json` |

## 4. Manual Sync Workflow

1. Open the GitHub repository.
2. Open the target file under `/src`.
3. Copy the full file contents.
4. Open the bound Apps Script project from the REOS Google Sheet.
5. Open the matching Apps Script file.
6. Replace the full contents.
7. Save the project.
8. Repeat for every changed file.
9. Run `reosRunTests`.
10. Confirm `TEST_RESULTS` has no failures.

## 5. Manual Sync Checklist

Before syncing:

- Confirm the GitHub branch is `main` or the approved release branch.
- Confirm `docs/PROJECT_PLAN.md` reflects the intended release.
- Confirm no file is partially copied.

After syncing:

- Save all Apps Script files.
- Refresh the Google Sheet.
- Confirm the REOS menu loads.
- Run `reosInitializeWorkbook`.
- Run `reosRunTests`.
- Open Dashboard, CRM, Acquisitions, Vendors, Properties, Automation, and Admin.

## 6. clasp Setup Option

Install clasp:

```bash
npm install -g @google/clasp
```

Login:

```bash
clasp login
```

Create or connect to the bound Apps Script project:

```bash
clasp clone <SCRIPT_ID>
```

The Script ID is available in Apps Script under:

`Project Settings → Script ID`

## 7. Recommended clasp Project Layout

Apps Script expects project files at the project root. REOS source files currently live under `/src`.

Recommended deployment layout:

```text
apps-script/
  Main.gs
  Config.gs
  Database.gs
  Utilities.gs
  Setup.gs
  Security.gs
  Router.gs
  Validation.gs
  TestRunner.gs
  Dashboard.gs
  CRM.gs
  Acquisitions.gs
  Vendors.gs
  Properties.gs
  Automation.gs
  Index.html
  CRM.html
  Acquisitions.html
  Vendors.html
  Properties.html
  Admin.html
  Automation.html
  appsscript.json
```

For now, copy `/src` files into the local clasp project root before pushing.

## 8. clasp Push Workflow

From the local Apps Script project folder:

```bash
clasp status
clasp push
```

Then open Apps Script and run:

```text
reosRunTests
```

## 9. Release Workflow

1. Build changes in GitHub.
2. Update `docs/PROJECT_PLAN.md`.
3. Review changed files.
4. Sync changed files to Apps Script manually or with clasp.
5. Run `reosInitializeWorkbook`.
6. Run `reosRunTests`.
7. Confirm UI modules open.
8. Install or refresh automation triggers if needed.
9. Back up the production workbook.
10. Mark the release complete in the project plan.

## 10. Troubleshooting

### REOS menu does not appear

- Refresh the spreadsheet.
- Run `onOpen` manually from Apps Script.
- Check for syntax errors in newly synced files.

### Function not found

- Confirm the `.gs` file exists in Apps Script.
- Confirm the function name matches exactly.
- Save the Apps Script project again.

### HTML dialog fails to open

- Confirm the `.html` file exists in Apps Script.
- Confirm `HtmlService.createHtmlOutputFromFile()` uses the exact filename without `.html`.

### Permission denied

- Confirm the current user exists in `USERS`.
- Confirm the user is Active.
- Confirm the role has the required permission.
- Open Admin and review the security audit report.

### Missing sheets

- Run `reosInitializeWorkbook`.
- Run `reosRunTests`.
- Review the health check output.

### Automation does not run

- Open Automation.
- Confirm triggers are installed.
- Run jobs manually.
- Review `AUTOMATION_RUNS` and `SYSTEM_LOG`.

## 11. Operating Rule

Never treat Apps Script as the permanent source of truth. Any production edit made in Apps Script must be copied back into GitHub immediately.
