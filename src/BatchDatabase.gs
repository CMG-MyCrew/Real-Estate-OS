/**
 * REOS Enterprise v3.0 - Batch Database Optimization Framework
 *
 * Batch insert/update/read helpers to reduce Apps Script service calls and
 * improve spreadsheet performance for large operations.
 */

var REOS = REOS || {};

REOS.BatchDatabase = (function () {
  function batchInsert(sheetName, records, options) {
    REOS.Security.requirePermission('finance:write');
    records = records || [];
    if (!records.length) return [];
    options = options || {};
    const started = Date.now();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error('Sheet not found: ' + sheetName);
    const headers = getHeaders_(sheet);
    const idField = options.idField || headers[0];
    const idPrefix = options.idPrefix || 'ID';
    const now = new Date();

    const rows = records.map(function (record) {
      record = Object.assign({}, record || {});
      if (idField && !record[idField]) record[idField] = REOS.generateId_(idPrefix);
      if (headers.indexOf('Created At') !== -1 && !record['Created At']) record['Created At'] = now;
      if (headers.indexOf('Updated At') !== -1) record['Updated At'] = now;
      return headers.map(function (h) { return record[h] !== undefined ? record[h] : ''; });
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
    REOS.Performance.log('BatchDatabase', 'batchInsert', Date.now() - started, { sheetName: sheetName, rows: rows.length });
    return records;
  }

  function batchUpdate(sheetName, idField, changesById) {
    REOS.Security.requirePermission('finance:write');
    changesById = changesById || {};
    const started = Date.now();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error('Sheet not found: ' + sheetName);
    const headers = getHeaders_(sheet);
    const values = sheet.getDataRange().getValues();
    const idIndex = headers.indexOf(idField);
    if (idIndex === -1) throw new Error('ID field not found: ' + idField);
    let count = 0;

    for (let r = 1; r < values.length; r++) {
      const id = String(values[r][idIndex] || '');
      const changes = changesById[id];
      if (!changes) continue;
      headers.forEach(function (header, c) {
        if (changes[header] !== undefined) values[r][c] = changes[header];
      });
      const updatedIndex = headers.indexOf('Updated At');
      if (updatedIndex !== -1) values[r][updatedIndex] = new Date();
      count++;
    }

    if (values.length > 1) sheet.getRange(1, 1, values.length, headers.length).setValues(values);
    REOS.Performance.log('BatchDatabase', 'batchUpdate', Date.now() - started, { sheetName: sheetName, rows: count });
    return { updated: count };
  }

  function readTable(sheetName) {
    REOS.Security.requirePermission('reports:read');
    const started = Date.now();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const values = sheet.getDataRange().getValues();
    const headers = values.shift();
    const rows = values.map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
    REOS.Performance.log('BatchDatabase', 'readTable', Date.now() - started, { sheetName: sheetName, rows: rows.length });
    return rows;
  }

  function getHeaders_(sheet) {
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }

  return { batchInsert: batchInsert, batchUpdate: batchUpdate, readTable: readTable };
})();

function batchDbInsert(sheetName, records, options) { return REOS.BatchDatabase.batchInsert(sheetName, records || [], options || {}); }
function batchDbUpdate(sheetName, idField, changesById) { return REOS.BatchDatabase.batchUpdate(sheetName, idField, changesById || {}); }
function batchDbRead(sheetName) { return REOS.BatchDatabase.readTable(sheetName); }
