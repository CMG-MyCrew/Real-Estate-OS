/**
 * REOS Enterprise v3.0 - Database Framework
 *
 * A lightweight data-access layer for Google Sheets tables.
 * Tables are expected to have a header row in row 1.
 */

var REOS = REOS || {};

REOS.Database = (function () {
  function getSpreadsheet_() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }

  function getSheet(sheetName) {
    const sheet = getSpreadsheet_().getSheetByName(sheetName);
    if (!sheet) throw new Error('Sheet not found: ' + sheetName);
    return sheet;
  }

  function getHeaders(sheetName) {
    const sheet = getSheet(sheetName);
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const values = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    return values.map(function (header) { return String(header || '').trim(); });
  }

  function getHeaderMap(sheetName) {
    const headers = getHeaders(sheetName);
    const map = {};
    headers.forEach(function (header, index) {
      if (header) map[header] = index;
    });
    return map;
  }

  function rowToObject(headers, row, rowNumber) {
    const record = {};
    headers.forEach(function (header, index) {
      if (header) record[header] = row[index];
    });
    record._rowNumber = rowNumber;
    return record;
  }

  function objectToRow(headers, record) {
    return headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
    });
  }

  function getAll(sheetName) {
    const sheet = getSheet(sheetName);
    const headers = getHeaders(sheetName);
    const lastRow = sheet.getLastRow();
    const lastColumn = Math.max(sheet.getLastColumn(), headers.length);

    if (lastRow < 2) return [];

    const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
    return rows
      .filter(function (row) { return row.some(function (cell) { return cell !== '' && cell !== null; }); })
      .map(function (row, index) { return rowToObject(headers, row, index + 2); });
  }

  function findById(sheetName, idField, idValue) {
    const records = getAll(sheetName);
    const id = String(idValue || '').trim();
    return records.find(function (record) { return String(record[idField] || '').trim() === id; }) || null;
  }

  function findRowById(sheetName, idField, idValue) {
    const record = findById(sheetName, idField, idValue);
    return record ? record._rowNumber : null;
  }

  function insert(sheetName, record, options) {
    options = options || {};
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      const sheet = getSheet(sheetName);
      const headers = getHeaders(sheetName);
      const now = new Date();

      if (options.idField && !record[options.idField]) {
        record[options.idField] = REOS.generateId_(options.idPrefix || 'ID');
      }

      if (headers.indexOf('Created At') !== -1 && !record['Created At']) record['Created At'] = now;
      if (headers.indexOf('Updated At') !== -1) record['Updated At'] = now;

      const row = objectToRow(headers, record);
      sheet.appendRow(row);

      const inserted = rowToObject(headers, row, sheet.getLastRow());
      REOS.Logger.info('DB insert', { sheet: sheetName, id: options.idField ? inserted[options.idField] : null });
      return inserted;
    } finally {
      lock.releaseLock();
    }
  }

  function update(sheetName, idField, idValue, changes) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      const sheet = getSheet(sheetName);
      const headers = getHeaders(sheetName);
      const rowNumber = findRowById(sheetName, idField, idValue);
      if (!rowNumber) throw new Error('Record not found: ' + idValue);

      const currentValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
      const currentRecord = rowToObject(headers, currentValues, rowNumber);
      const updatedRecord = Object.assign({}, currentRecord, changes || {});
      delete updatedRecord._rowNumber;

      if (headers.indexOf('Updated At') !== -1) updatedRecord['Updated At'] = new Date();

      const row = objectToRow(headers, updatedRecord);
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);

      REOS.Logger.info('DB update', { sheet: sheetName, id: idValue });
      return rowToObject(headers, row, rowNumber);
    } finally {
      lock.releaseLock();
    }
  }

  function softDelete(sheetName, idField, idValue) {
    const headers = getHeaders(sheetName);
    if (headers.indexOf('Active') !== -1) {
      return update(sheetName, idField, idValue, { Active: false, Status: 'Archived' });
    }
    return update(sheetName, idField, idValue, { Status: 'Archived' });
  }

  function query(sheetName, predicate) {
    return getAll(sheetName).filter(predicate || function () { return true; });
  }

  return {
    getSheet: getSheet,
    getHeaders: getHeaders,
    getHeaderMap: getHeaderMap,
    getAll: getAll,
    findById: findById,
    findRowById: findRowById,
    insert: insert,
    update: update,
    softDelete: softDelete,
    query: query,
    rowToObject: rowToObject,
    objectToRow: objectToRow
  };
})();
