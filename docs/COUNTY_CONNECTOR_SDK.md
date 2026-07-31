# REOS County Connector SDK

## Purpose

The County Connector SDK imports county public-record datasets into the REOS `DISTRESS_LEADS` table through a consistent adapter contract.

The framework provides:

- Connector registration and discovery
- Dataset-specific fetch adapters
- Lead normalization and validation
- Natural-key deduplication
- Dry-run and live execution modes
- Run-level audit records in `COUNTY_CONNECTOR_RUNS`
- Daily Apps Script trigger installation
- Terminal-driven syncs through Node.js and `clasp`

## Connector contract

Each connector must register an object with:

```javascript
REOS.CountyConnectorSDK.register({
  id: 'PA-PHILADELPHIA',
  county: 'Philadelphia',
  state: 'PA',
  version: '1.0.0',
  enabled: true,
  datasets: ['tax_delinquent'],
  fetch: function (context) {},
  normalize: function (raw, context) {},
  validate: function (record, context) {}
});
```

`fetch(context)` returns:

```javascript
{
  records: [],
  nextCursor: '',
  message: ''
}
```

## Initial setup

```bash
git checkout feature/county-connector-sdk
npm install
npx clasp login
npx clasp status
npm run county:setup
npm run county:list
```

Then confirm `DISTRESS_LEADS` contains the connector fields, configure county endpoint Script Properties, and run a dry test before enabling live persistence.

`clasp run` requires the Apps Script project to be configured for API execution. The terminal command reports the underlying clasp error when execution access is missing.

## Philadelphia Script Properties

Create one property per enabled dataset:

- `REOS_COUNTY_PA_PHILADELPHIA_TAX_DELINQUENT_URL`
- `REOS_COUNTY_PA_PHILADELPHIA_CODE_VIOLATIONS_URL`
- `REOS_COUNTY_PA_PHILADELPHIA_VACANT_PROPERTIES_URL`
- `REOS_COUNTY_PA_PHILADELPHIA_PROPERTY_ASSESSMENT_URL`
- `REOS_COUNTY_PA_PHILADELPHIA_API_KEY` when the source requires an application token

The adapter expects Socrata-style query parameters but can be extended for ArcGIS, CKAN, CSV, SFTP, or county-specific APIs.

## Apps Script commands

```javascript
REOS_COUNTY_LIST();
REOS_COUNTY_DRY_RUN('PA-PHILADELPHIA', 'tax_delinquent', 100);
REOS_COUNTY_SYNC('PA-PHILADELPHIA', 'tax_delinquent', 500, '');
REOS_COUNTY_SYNC_ALL_DRY_RUN();
REOS_COUNTY_SYNC_ALL();
REOS_COUNTY_INSTALL_DAILY_TRIGGER();
```

## Terminal sync commands

All terminal executions automatically run `clasp push` first unless `--no-push` is supplied.

List registered connectors:

```bash
npm run county:list
```

Dry-run one dataset:

```bash
npm run county:dry -- \
  --connector PA-PHILADELPHIA \
  --dataset tax_delinquent \
  --limit 100
```

Run a live sync:

```bash
npm run county:sync -- \
  --connector PA-PHILADELPHIA \
  --dataset tax_delinquent \
  --limit 500 \
  --live
```

Continue from a source cursor:

```bash
npm run county:sync -- \
  --connector PA-PHILADELPHIA \
  --dataset code_violations \
  --cursor 500 \
  --limit 500 \
  --live
```

Dry-run every registered connector:

```bash
npm run county:sync-all
```

Live sync every registered connector:

```bash
npm run county:sync-all -- --live
```

Print compact machine-readable output:

```bash
npm run county:dry -- \
  --connector PA-PHILADELPHIA \
  --dataset vacant_properties \
  --json
```

Terminal execution defaults to dry-run. Persistence only occurs when `--live` is passed; the Apps Script gateway independently requires `confirmLive=true` as a second safety control.

## Required lead fields

The SDK writes the following normalized values when matching columns exist in `DISTRESS_LEADS`:

- `Distress Lead ID`
- `Address`
- `City`
- `State`
- `Zip`
- `County`
- `Parcel ID`
- `Owner Name`
- `Distress Type`
- `Source`
- `Source Dataset`
- `Source Record ID`
- `Source Record Key`
- `Connector Run ID`
- `Source Updated At`
- `Last Seen At`
- `Tax Delinquent Amount`
- `Violation Amount`
- `Estimated Value`
- `Notes`
- `Created At`
- `Updated At`

Before live execution, update the sheet schema if any required connector columns are absent.

## Adding another county

Create `src/connectors/<CountyName>CountyConnector.gs`, implement the connector contract, and register it at file load. Keep source-specific field names inside the adapter. The shared SDK should only receive normalized REOS records.

Recommended connector ID format:

```text
<STATE>-<COUNTY>
```

Examples:

- `PA-PHILADELPHIA`
- `PA-DELAWARE`
- `PA-MONTGOMERY`
- `NJ-CAMDEN`
- `NJ-BURLINGTON`

## Safety controls

- New runs default to dry-run unless `dryRun: false` is explicitly passed.
- Terminal live mode requires the explicit `--live` flag.
- Apps Script terminal live mode independently requires `confirmLive=true`.
- Connectors must be registered and enabled.
- Dataset names are allow-listed per connector.
- Invalid records are rejected without stopping the entire run.
- Every run records counts, duration, cursor, status, and failure message.
- Existing records are matched by source natural key, then normalized address.
