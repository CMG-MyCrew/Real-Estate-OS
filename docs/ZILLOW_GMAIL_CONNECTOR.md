# REOS Zillow Gmail Multi-Folder Connector

## Purpose

Imports Zillow lead-notification emails from multiple Gmail labels into `DISTRESS_LEADS`, records message-level audit history, prevents duplicate imports, and optionally runs the existing REOS acquisition-ingestion pipeline.

This connector reads Gmail only. It does not scrape Zillow pages or send automated requests to Zillow.

## Gmail labels

Default source labels:

- `Zillow/New Leads`
- `Zillow/Buyer Leads`
- `Zillow/Seller Leads`
- `Zillow/Rental Leads`

Processing labels:

- `Zillow/Imported`
- `Zillow/Errors`

The installer creates missing labels automatically.

## First-time terminal sync

```bash
git checkout feat/zillow-gmail-multifolder-connector
npm install
npm run login
```

Create `.clasp.json` in the repository root using the Apps Script project ID:

```json
{
  "scriptId": "YOUR_APPS_SCRIPT_PROJECT_ID",
  "rootDir": "."
}
```

Confirm the files that clasp will upload:

```bash
npm run status
```

Push the branch code to Apps Script:

```bash
npm run sync:up
```

Use the force command only when the local repository is confirmed as the source of truth:

```bash
npm run sync:up:force
```

Pull remote Apps Script changes before starting a new development session:

```bash
npm run sync:down
```

## Apps Script installation

Run these functions once from the Apps Script editor:

```javascript
reosConnectorInitialize();

reosZillowGmailConfigure({
  labels: [
    'Zillow/New Leads',
    'Zillow/Buyer Leads',
    'Zillow/Seller Leads',
    'Zillow/Rental Leads'
  ],
  importedLabel: 'Zillow/Imported',
  errorLabel: 'Zillow/Errors',
  maxThreadsPerLabel: 50,
  lookbackDays: 30,
  markRead: false,
  archiveAfterImport: false,
  runDownstreamIngestion: true,
  scoreLeads: true,
  autoPromote: false,
  defaultCity: 'Philadelphia',
  defaultState: 'PA',
  defaultAssignedTo: ''
});

reosZillowGmailInstallDefaultTrigger();
```

Google will request Gmail, Sheets, and trigger permissions during the first authorized execution.

## Manual verification

Place a Zillow lead notification in one configured label, then run:

```javascript
reosZillowGmailSync();
```

Verify:

1. A row exists in `ZILLOW_GMAIL_IMPORTS`.
2. A lead exists in `DISTRESS_LEADS`.
3. The Gmail thread has the `Zillow/Imported` label.
4. A connector run exists in `ACQUISITION_CONNECTOR_RUNS`.
5. Downstream ingestion created or updated the related intelligent-acquisition records when enabled.

## Operational commands

```bash
npm run status
npm run sync:down
npm run sync:up
npm run open
npm run deploy:list
```

## Recovery

Failed messages are labeled `Zillow/Errors` and recorded in `ZILLOW_GMAIL_ERRORS`. Correct the source email or parser configuration, remove the failed message's prior error state if appropriate, and rerun the sync manually.

Remove the scheduled trigger with:

```javascript
reosZillowGmailRemoveTriggers();
```

Disable the connector with:

```javascript
reosZillowGmailDisable();
```
