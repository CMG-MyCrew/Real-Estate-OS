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

1. Pull the branch and deploy with clasp.
2. Confirm `DISTRESS_LEADS` contains the fields used by the connector framework.
3. Run `REOS_COUNTY_SETUP()` once.
4. Configure Philadelphia endpoint Script Properties.
5. Run a dry test before enabling live persistence.

## Philadelphia Script Properties

Create one property per enabled dataset:

- `REOS_COUNTY_PA_PHILADELPHIA_TAX_DELINQUENT_URL`
- `REOS_COUNTY_PA_PHILADELPHIA_CODE_VIOLATIONS_URL`
- `REOS_COUNTY_PA_PHILADELPHIA_VACANT_PROPERTIES_URL`
- `REOS_COUNTY_PA_PHILADELPHIA_PROPERTY_ASSESSMENT_URL`
- `REOS_COUNTY_PA_PHILADELPHIA_API_KEY` when the source requires an application token

The adapter expects Socrata-style query parameters but can be extended for ArcGIS, CKAN, CSV, SFTP, or county-specific APIs.

## Commands

```javascript
REOS_COUNTY_LIST();
REOS_COUNTY_DRY_RUN('PA-PHILADELPHIA', 'tax_delinquent', 100);
REOS_COUNTY_SYNC('PA-PHILADELPHIA', 'tax_delinquent', 500, '');
REOS_COUNTY_SYNC_ALL_DRY_RUN();
REOS_COUNTY_SYNC_ALL();
REOS_COUNTY_INSTALL_DAILY_TRIGGER();
```

Live syncs are opt-in. `REOS_COUNTY_DRY_RUN` is the recommended first execution for every new connector and dataset.

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
- Connectors must be registered and enabled.
- Dataset names are allow-listed per connector.
- Invalid records are rejected without stopping the entire run.
- Every run records counts, duration, cursor, status, and failure message.
- Existing records are matched by source natural key, then normalized address.
