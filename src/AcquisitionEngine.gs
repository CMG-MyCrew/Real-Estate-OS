/*******************************************************
 * REOS ENTERPRISE
 * Sprint 3.1 — Acquisition Intelligence Engine Foundation
 * File: AcquisitionEngine.gs
 *
 * Purpose:
 * - Creates acquisition intelligence database structure
 * - Seeds target markets
 * - Imports manual/API/CSV lead data from Manual_Lead_Intake
 * - Normalizes property opportunities
 * - Pushes records into Raw_Opportunity_Feed
 * - Logs automation activity
 *******************************************************/

const REOS_ACQ = {
  version: '3.1.0',
  timezone: Session.getScriptTimeZone() || 'America/New_York',

  sheets: {
    markets: 'Markets',
    manualIntake: 'Manual_Lead_Intake',
    rawFeed: 'Raw_Opportunity_Feed',
    opportunityHistory: 'Opportunity_History',
    dailyTopDeals: 'Daily_Top_25_Deals',
    automationLogs: 'Automation_Logs'
  },

  targetMarkets: [
    ['JAX-FL', 'Jacksonville', 'FL', 'Duval County', 'Jacksonville', 1, true],
    ['ORL-FL', 'Orlando', 'FL', 'Orange County', 'Orlando', 1, true],
    ['HOU-TX', 'Houston', 'TX', 'Harris County', 'Houston', 1, true],
    ['ATL-GA', 'Atlanta', 'GA', 'Fulton County', 'Atlanta', 1, true],
    ['CLE-OH', 'Cleveland', 'OH', 'Cuyahoga County', 'Cleveland', 2, true],
    ['MEM-TN', 'Memphis', 'TN', 'Shelby County', 'Memphis', 2, true],
    ['DET-MI', 'Detroit', 'MI', 'Wayne County', 'Detroit', 2, true],
    ['KC-MO', 'Kansas City', 'MO', 'Jackson County', 'Kansas City', 2, true],
    ['BHM-AL', 'Birmingham', 'AL', 'Jefferson County', 'Birmingham', 2, true],
    ['CLT-NC', 'Charlotte', 'NC', 'Mecklenburg County', 'Charlotte', 2, true],
    ['IND-IN', 'Indianapolis', 'IN', 'Marion County', 'Indianapolis', 2, true]
  ],

  headers: {
    Markets: [
      'Market ID',
      'Market Name',
      'State',
      'County',
      'City',
      'Priority',
      'Active',
      'Acquisition Manager',
      'Notes',
      'Created At',
      'Updated At'
    ],

    Manual_Lead_Intake: [
      'Source',
      'Market',
      'City',
      'State',
      'County',
      'Property Address',
      'Unit',
      'ZIP',
      'Parcel ID',
      'Owner Name',
      'Owner Mailing Address',
      'Owner City',
      'Owner State',
      'Owner ZIP',
      'Lead Type',
      'Distress Signals',
      'Estimated Value',
      'Asking Price',
      'Beds',
      'Baths',
      'Sq Ft',
      'Lot Sq Ft',
      'Year Built',
      'Last Sale Date',
      'Last Sale Price',
      'Tax Delinquent Amount',
      'Code Violations Count',
      'Vacancy Flag',
      'Probate Flag',
      'Absentee Owner Flag',
      'Source URL',
      'Notes',
      'Import Status',
      'Imported Run ID',
      'Imported At'
    ],

    Raw_Opportunity_Feed: [
      'Run ID',
      'Source',
      'Market',
      'City',
      'State',
      'County',
      'Property Address',
      'Unit',
      'ZIP',
      'Parcel ID',
      'Owner Name',
      'Owner Mailing Address',
      'Owner City',
      'Owner State',
      'Owner ZIP',
      'Lead Type',
      'Distress Signals',
      'Estimated Value',
      'Asking Price',
      'Beds',
      'Baths',
      'Sq Ft',
      'Lot Sq Ft',
      'Year Built',
      'Last Sale Date',
      'Last Sale Price',
      'Tax Delinquent Amount',
      'Code Violations Count',
      'Vacancy Flag',
      'Probate Flag',
      'Absentee Owner Flag',
      'Source URL',
      'Raw Notes',
      'Normalized Key',
      'Imported At'
    ],

    Opportunity_History: [
      'History ID',
      'Normalized Key',
      'First Seen Date',
      'Last Seen Date',
      'Times Seen',
      'Latest Run ID',
      'Latest Source',
      'Latest Market',
      'Latest Status',
      'Change Detected',
      'Created At',
      'Updated At'
    ],

    Daily_Top_25_Deals: [
      'Rank',
      'Run ID',
      'Normalized Key',
      'Market',
      'Property Address',
      'Owner Name',
      'Lead Type',
      'Distress Signals',
      'Estimated Value',
      'Estimated Repairs',
      'ARV',
      'MAO',
      'Motivation Score',
      'Deal Score',
      'Recommended Action',
      'Acquisition Manager',
      'Created At'
    ],

    Automation_Logs: [
      'Log ID',
      'Run ID',
      'Module',
      'Action',
      'Status',
      'Message',
      'Records Processed',
      'Started At',
      'Completed At'
    ]
  }
};


/*******************************************************
 * PUBLIC ENTRY POINTS
 *******************************************************/

function runAcquisitionSprint31Setup() {
  return REOSAcquisitionSetup.run();
}

function runDailyAcquisitionScan() {
  return REOSAcquisitionEngine.runDailyScan();
}

function installDailyAcquisitionTrigger() {
  const existingTriggers = ScriptApp.getProjectTriggers();

  existingTriggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'runDailyAcquisitionScan') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('runDailyAcquisitionScan')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();

  Logger.log('Daily acquisition scan trigger installed for approximately 7 AM.');
}


/*******************************************************
 * SETUP MODULE
 *******************************************************/

const REOSAcquisitionSetup = {
  run() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    Object.keys(REOS_ACQ.sheets).forEach(key => {
      const sheetName = REOS_ACQ.sheets[key];
      const headers = REOS_ACQ.headers[sheetName];

      if (!headers) return;

      const sheet = this.getOrCreateSheet_(ss, sheetName);
      this.applyHeaders_(sheet, headers);
      this.formatSheet_(sheet);
    });

    this.seedMarkets_(ss);

    REOSAcquisitionLogger.log({
      runId: 'SETUP-' + this.timestampId_(),
      module: 'AcquisitionSetup',
      action: 'runAcquisitionSprint31Setup',
      status: 'SUCCESS',
      message: 'Sprint 3.1 acquisition foundation setup completed.',
      recordsProcessed: REOS_ACQ.targetMarkets.length,
      startedAt: new Date(),
      completedAt: new Date()
    });

    return {
      status: 'SUCCESS',
      message: 'REOS Acquisition Intelligence Engine Sprint 3.1 setup completed.',
      sheetsCreated: Object.values(REOS_ACQ.sheets),
      marketsSeeded: REOS_ACQ.targetMarkets.length
    };
  },

  getOrCreateSheet_(ss, sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    return sheet;
  },

  applyHeaders_(sheet, headers) {
    const existingLastColumn = Math.max(sheet.getLastColumn(), headers.length);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      return;
    }

    const existingHeaders = sheet.getRange(1, 1, 1, existingLastColumn).getValues()[0];
    const isEmptyHeader = existingHeaders.every(value => value === '');

    if (isEmptyHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      return;
    }

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  },

  formatSheet_(sheet) {
    const lastColumn = sheet.getLastColumn();
    if (lastColumn === 0) return;

    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, lastColumn)
      .setFontWeight('bold')
      .setWrap(true);

    sheet.autoResizeColumns(1, Math.min(lastColumn, 12));
  },

  seedMarkets_(ss) {
    const sheet = ss.getSheetByName(REOS_ACQ.sheets.markets);
    const headers = REOS_ACQ.headers.Markets;
    const existing = REOSSheetUtils.getObjects_(sheet);
    const existingIds = new Set(existing.map(row => String(row['Market ID']).trim()));

    const now = new Date();
    const newRows = [];

    REOS_ACQ.targetMarkets.forEach(market => {
      const marketId = market[0];

      if (!existingIds.has(marketId)) {
        newRows.push([
          market[0],
          market[1],
          market[2],
          market[3],
          market[4],
          market[5],
          market[6],
          '',
          '',
          now,
          now
        ]);
      }
    });

    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length)
        .setValues(newRows);
    }
  },

  timestampId_() {
    return Utilities.formatDate(new Date(), REOS_ACQ.timezone, 'yyyyMMdd-HHmmss');
  }
};


/*******************************************************
 * ACQUISITION ENGINE CONTROLLER
 *******************************************************/

const REOSAcquisitionEngine = {
  runDailyScan() {
    const startedAt = new Date();
    const runId = this.createRunId_();

    try {
      REOSAcquisitionSetup.run();

      REOSAcquisitionLogger.log({
        runId,
        module: 'AcquisitionEngine',
        action: 'runDailyScan',
        status: 'STARTED',
        message: 'Daily acquisition scan started.',
        recordsProcessed: 0,
        startedAt,
        completedAt: ''
      });

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const markets = this.getActiveMarkets_(ss);
      const scanResults = [];

      markets.forEach(market => {
        const result = REOSMarketScanner.scanManualIntakeForMarket({
          runId,
          market
        });

        scanResults.push(result);
      });

      const totalImported = scanResults.reduce((sum, item) => sum + item.importedCount, 0);
      const totalSkipped = scanResults.reduce((sum, item) => sum + item.skippedCount, 0);

      REOSAcquisitionLogger.log({
        runId,
        module: 'AcquisitionEngine',
        action: 'runDailyScan',
        status: 'SUCCESS',
        message: `Daily acquisition scan completed. Imported ${totalImported} records. Skipped ${totalSkipped} records.`,
        recordsProcessed: totalImported,
        startedAt,
        completedAt: new Date()
      });

      return {
        status: 'SUCCESS',
        runId,
        marketsScanned: markets.length,
        recordsImported: totalImported,
        recordsSkipped: totalSkipped,
        nextSprint: 'Sprint 3.2 — Deduplication Engine'
      };

    } catch (error) {
      REOSAcquisitionLogger.log({
        runId,
        module: 'AcquisitionEngine',
        action: 'runDailyScan',
        status: 'ERROR',
        message: error.message,
        recordsProcessed: 0,
        startedAt,
        completedAt: new Date()
      });

      throw error;
    }
  },

  getActiveMarkets_(ss) {
    const sheet = ss.getSheetByName(REOS_ACQ.sheets.markets);
    const rows = REOSSheetUtils.getObjects_(sheet);

    return rows
      .filter(row => REOSDataUtils.toBoolean_(row.Active))
      .map(row => ({
        marketId: row['Market ID'],
        marketName: row['Market Name'],
        state: row.State,
        county: row.County,
        city: row.City,
        priority: Number(row.Priority || 99),
        manager: row['Acquisition Manager'] || ''
      }))
      .sort((a, b) => a.priority - b.priority);
  },

  createRunId_() {
    const stamp = Utilities.formatDate(new Date(), REOS_ACQ.timezone, 'yyyyMMdd-HHmmss');
    return `ACQ-${stamp}`;
  }
};


/*******************************************************
 * MARKET SCANNER
 * Sprint 3.1 uses Manual_Lead_Intake as the source.
 * Later sprints can replace this with APIs, CSV imports,
 * county feeds, land bank feeds, or scraping connectors.
 *******************************************************/

const REOSMarketScanner = {
  scanManualIntakeForMarket({ runId, market }) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const intakeSheet = ss.getSheetByName(REOS_ACQ.sheets.manualIntake);
    const rawFeedSheet = ss.getSheetByName(REOS_ACQ.sheets.rawFeed);

    const intakeRows = REOSSheetUtils.getObjectsWithRowNumbers_(intakeSheet);
    const feedHeaders = REOS_ACQ.headers.Raw_Opportunity_Feed;

    const rowsToAppend = [];
    const rowsToMarkImported = [];
    let skippedCount = 0;

    intakeRows.forEach(item => {
      const row = item.data;
      const rowNumber = item.rowNumber;

      const status = String(row['Import Status'] || '').trim().toUpperCase();
      if (status === 'IMPORTED') {
        skippedCount++;
        return;
      }

      const rowMarket = String(row.Market || '').trim().toLowerCase();
      const rowCity = String(row.City || '').trim().toLowerCase();
      const rowState = String(row.State || '').trim().toLowerCase();

      const belongsToMarket =
        rowMarket === String(market.marketName || '').trim().toLowerCase() ||
        rowCity === String(market.city || '').trim().toLowerCase() ||
        rowState === String(market.state || '').trim().toLowerCase();

      if (!belongsToMarket) {
        return;
      }

      const normalized = REOSOpportunityNormalizer.normalize({
        runId,
        market,
        sourceRow: row
      });

      if (!normalized['Property Address']) {
        skippedCount++;
        return;
      }

      rowsToAppend.push(feedHeaders.map(header => normalized[header] || ''));
      rowsToMarkImported.push(rowNumber);
    });

    if (rowsToAppend.length > 0) {
      rawFeedSheet
        .getRange(rawFeedSheet.getLastRow() + 1, 1, rowsToAppend.length, feedHeaders.length)
        .setValues(rowsToAppend);

      this.markRowsImported_(intakeSheet, rowsToMarkImported, runId);
    }

    return {
      market: market.marketName,
      importedCount: rowsToAppend.length,
      skippedCount
    };
  },

  markRowsImported_(sheet, rowNumbers, runId) {
    const headers = REOSSheetUtils.getHeaders_(sheet);
    const statusCol = headers.indexOf('Import Status') + 1;
    const runCol = headers.indexOf('Imported Run ID') + 1;
    const importedAtCol = headers.indexOf('Imported At') + 1;

    rowNumbers.forEach(rowNumber => {
      if (statusCol > 0) sheet.getRange(rowNumber, statusCol).setValue('IMPORTED');
      if (runCol > 0) sheet.getRange(rowNumber, runCol).setValue(runId);
      if (importedAtCol > 0) sheet.getRange(rowNumber, importedAtCol).setValue(new Date());
    });
  }
};


/*******************************************************
 * OPPORTUNITY NORMALIZER
 *******************************************************/

const REOSOpportunityNormalizer = {
  normalize({ runId, market, sourceRow }) {
    const propertyAddress = REOSDataUtils.cleanText_(sourceRow['Property Address']);
    const city = REOSDataUtils.cleanText_(sourceRow.City || market.city);
    const state = REOSDataUtils.cleanText_(sourceRow.State || market.state);
    const zip = REOSDataUtils.cleanZip_(sourceRow.ZIP);
    const parcelId = REOSDataUtils.cleanText_(sourceRow['Parcel ID']);
    const ownerName = REOSDataUtils.cleanText_(sourceRow['Owner Name']);

    const normalizedKey = REOSDataUtils.createPropertyKey_({
      propertyAddress,
      city,
      state,
      zip,
      parcelId
    });

    return {
      'Run ID': runId,
      'Source': sourceRow.Source || 'Manual Intake',
      'Market': market.marketName,
      'City': city,
      'State': state,
      'County': sourceRow.County || market.county,
      'Property Address': propertyAddress,
      'Unit': sourceRow.Unit || '',
      'ZIP': zip,
      'Parcel ID': parcelId,
      'Owner Name': ownerName,
      'Owner Mailing Address': REOSDataUtils.cleanText_(sourceRow['Owner Mailing Address']),
      'Owner City': REOSDataUtils.cleanText_(sourceRow['Owner City']),
      'Owner State': REOSDataUtils.cleanText_(sourceRow['Owner State']),
      'Owner ZIP': REOSDataUtils.cleanZip_(sourceRow['Owner ZIP']),
      'Lead Type': REOSDataUtils.cleanText_(sourceRow['Lead Type']),
      'Distress Signals': REOSDataUtils.cleanText_(sourceRow['Distress Signals']),
      'Estimated Value': REOSDataUtils.toNumber_(sourceRow['Estimated Value']),
      'Asking Price': REOSDataUtils.toNumber_(sourceRow['Asking Price']),
      'Beds': REOSDataUtils.toNumber_(sourceRow.Beds),
      'Baths': REOSDataUtils.toNumber_(sourceRow.Baths),
      'Sq Ft': REOSDataUtils.toNumber_(sourceRow['Sq Ft']),
      'Lot Sq Ft': REOSDataUtils.toNumber_(sourceRow['Lot Sq Ft']),
      'Year Built': REOSDataUtils.toNumber_(sourceRow['Year Built']),
      'Last Sale Date': sourceRow['Last Sale Date'] || '',
      'Last Sale Price': REOSDataUtils.toNumber_(sourceRow['Last Sale Price']),
      'Tax Delinquent Amount': REOSDataUtils.toNumber_(sourceRow['Tax Delinquent Amount']),
      'Code Violations Count': REOSDataUtils.toNumber_(sourceRow['Code Violations Count']),
      'Vacancy Flag': REOSDataUtils.toBoolean_(sourceRow['Vacancy Flag']),
      'Probate Flag': REOSDataUtils.toBoolean_(sourceRow['Probate Flag']),
      'Absentee Owner Flag': REOSDataUtils.toBoolean_(sourceRow['Absentee Owner Flag']),
      'Source URL': sourceRow['Source URL'] || '',
      'Raw Notes': sourceRow.Notes || '',
      'Normalized Key': normalizedKey,
      'Imported At': new Date()
    };
  }
};


/*******************************************************
 * LOGGER
 *******************************************************/

const REOSAcquisitionLogger = {
  log({ runId, module, action, status, message, recordsProcessed, startedAt, completedAt }) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(REOS_ACQ.sheets.automationLogs);

    if (!sheet) {
      sheet = ss.insertSheet(REOS_ACQ.sheets.automationLogs);
      sheet.getRange(1, 1, 1, REOS_ACQ.headers.Automation_Logs.length)
        .setValues([REOS_ACQ.headers.Automation_Logs]);
    }

    const logId = `LOG-${Utilities.getUuid()}`;

    sheet.appendRow([
      logId,
      runId,
      module,
      action,
      status,
      message,
      recordsProcessed || 0,
      startedAt || new Date(),
      completedAt || ''
    ]);
  }
};


/*******************************************************
 * SHEET UTILITIES
 *******************************************************/

const REOSSheetUtils = {
  getHeaders_(sheet) {
    if (!sheet || sheet.getLastRow() === 0) return [];
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  },

  getObjects_(sheet) {
    if (!sheet || sheet.getLastRow() < 2) return [];

    const headers = this.getHeaders_(sheet);
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();

    return values.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
  },

  getObjectsWithRowNumbers_(sheet) {
    if (!sheet || sheet.getLastRow() < 2) return [];

    const headers = this.getHeaders_(sheet);
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();

    return values.map((row, rowIndex) => {
      const obj = {};
      headers.forEach((header, colIndex) => {
        obj[header] = row[colIndex];
      });

      return {
        rowNumber: rowIndex + 2,
        data: obj
      };
    });
  }
};


/*******************************************************
 * DATA UTILITIES
 *******************************************************/

const REOSDataUtils = {
  cleanText_(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/\s+/g, ' ')
      .trim();
  },

  cleanZip_(value) {
    if (value === null || value === undefined || value === '') return '';
    return String(value)
      .replace(/[^\d]/g, '')
      .substring(0, 5);
  },

  toNumber_(value) {
    if (value === null || value === undefined || value === '') return '';

    if (typeof value === 'number') return value;

    const cleaned = String(value).replace(/[$,%\s,]/g, '');
    const number = Number(cleaned);

    return isNaN(number) ? '' : number;
  },

  toBoolean_(value) {
    if (value === true) return true;
    if (value === false) return false;
    if (value === null || value === undefined) return false;

    const cleaned = String(value).trim().toLowerCase();

    return [
      'true',
      'yes',
      'y',
      '1',
      'x',
      'vacant',
      'probate',
      'absentee'
    ].includes(cleaned);
  },

  createPropertyKey_({ propertyAddress, city, state, zip, parcelId }) {
    const parcel = this.cleanText_(parcelId).toUpperCase();

    if (parcel) {
      return `PARCEL:${parcel}`;
    }

    const addressKey = [
      propertyAddress,
      city,
      state,
      zip
    ]
      .map(value => this.cleanText_(value).toUpperCase())
      .filter(Boolean)
      .join('|');

    return `ADDR:${addressKey}`;
  }
};
