/*
 * REOS Enterprise v3.6.2
 * Deal Logic Diagnostics
 *
 * Read-only diagnostics for verifying the spreadsheet context and
 * DEAL_ANALYSIS persistence behavior used by the Deal Analyzer.
 */

var REOS = REOS || {};

REOS.DealLogicDiagnostics = (function () {
  var ANALYSIS = 'DEAL_ANALYSIS';
  var EXPECTED_SPREADSHEET_ID = '1N_5Saw8paJbUZ3FYWr2LmqMDV5qcHSNHda6RoxyqNTU';

  function inspect() {
    if (!REOS.Database) throw new Error('REOS.Database is required.');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('No active spreadsheet is available.');

    var sheet = ss.getSheetByName(ANALYSIS);
    var rows = sheet ? REOS.Database.getAll(ANALYSIS) : [];
    var latestFive = rows.slice(-5).map(function (row) {
      return {
        rowNumber: row._rowNumber || null,
        analysisId: row['Analysis ID'] || '',
        dealId: row['Deal ID'] || '',
        version: row['Analysis Version'] || '',
        saveMode: row['Save Mode'] || '',
        purchasePrice: row['Purchase Price'] || '',
        arv: row.ARV || '',
        repairCost: row['Repair Cost'] || '',
        mao: row.MAO || '',
        updatedAt: serializeDate_(row['Updated At'] || row['Created At'])
      };
    });

    var result = {
      ok: true,
      spreadsheetId: ss.getId(),
      expectedSpreadsheetId: EXPECTED_SPREADSHEET_ID,
      correctSpreadsheet: ss.getId() === EXPECTED_SPREADSHEET_ID,
      spreadsheetName: ss.getName(),
      sheetName: sheet ? sheet.getName() : null,
      sheetExists: Boolean(sheet),
      lastRow: sheet ? sheet.getLastRow() : 0,
      lastColumn: sheet ? sheet.getLastColumn() : 0,
      analysisCount: rows.length,
      latestFive: latestFive,
      checkedAt: new Date().toISOString()
    };

    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  function inspectDeal(dealId) {
    if (!REOS.Database) throw new Error('REOS.Database is required.');
    dealId = String(dealId || '').trim();
    if (!dealId) throw new Error('Deal ID is required.');

    var base = inspect();
    var matches = REOS.Database.getAll(ANALYSIS).filter(function (row) {
      return String(row['Deal ID'] || '').trim() === dealId;
    }).map(function (row) {
      return {
        rowNumber: row._rowNumber || null,
        analysisId: row['Analysis ID'] || '',
        dealId: row['Deal ID'] || '',
        version: row['Analysis Version'] || '',
        previousAnalysisId: row['Previous Analysis ID'] || '',
        saveMode: row['Save Mode'] || '',
        purchasePrice: row['Purchase Price'] || '',
        arv: row.ARV || '',
        repairCost: row['Repair Cost'] || '',
        mao: row.MAO || '',
        createdAt: serializeDate_(row['Created At']),
        updatedAt: serializeDate_(row['Updated At'])
      };
    });

    base.dealId = dealId;
    base.dealAnalysisCount = matches.length;
    base.dealAnalyses = matches;
    console.log(JSON.stringify(base, null, 2));
    return base;
  }

  function serializeDate_(value) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  return {
    inspect: inspect,
    inspectDeal: inspectDeal
  };
})();

function reosDealLogicDiagnostic() {
  return REOS.DealLogicDiagnostics.inspect();
}

function reosDealLogicDiagnosticForDeal(dealId) {
  return REOS.DealLogicDiagnostics.inspectDeal(dealId);
}
