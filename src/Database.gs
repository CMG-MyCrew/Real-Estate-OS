/**
 * REOS Enterprise v3.2.6 - Database Framework
 * Sheet-table data layer with safe table creation, insert, update, query, and soft delete.
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

  function ensureTable(sheetName, headers) {
    const ss = getSpreadsheet_();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setWrap(true);
      sheet.autoResizeColumns(1, headers.length);
    }
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
    return rows.filter(function (row) {
      return row.some(function (cell) { return cell !== '' && cell !== null; });
    }).map(function (row, index) {
      return rowToObject(headers, row, index + 2);
    });
  }

  function findById(sheetName, idField, idValue) {
    const id = String(idValue || '').trim();
    return getAll(sheetName).find(function (record) {
      return String(record[idField] || '').trim() === id;
    }) || null;
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
      record = Object.assign({}, record || {});
      if (options.idField && !record[options.idField]) record[options.idField] = REOS.generateId_(options.idPrefix || 'ID');
      if (headers.indexOf('Created At') !== -1 && !record['Created At']) record['Created At'] = now;
      if (headers.indexOf('Updated At') !== -1) record['Updated At'] = now;
      const row = objectToRow(headers, record);
      sheet.appendRow(row);
      const inserted = rowToObject(headers, row, sheet.getLastRow());
      if (REOS.Logger) REOS.Logger.info('DB insert', { sheet: sheetName, id: options.idField ? inserted[options.idField] : null });
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
      if (REOS.Logger) REOS.Logger.info('DB update', { sheet: sheetName, id: idValue });
      return rowToObject(headers, row, rowNumber);
    } finally {
      lock.releaseLock();
    }
  }

  function upsert(sheetName, idField, idValue, record, options) {
    const existing = idValue ? findById(sheetName, idField, idValue) : null;
    if (existing) return update(sheetName, idField, idValue, record || {});
    return insert(sheetName, record || {}, options || { idField: idField });
  }

  function softDelete(sheetName, idField, idValue) {
    const headers = getHeaders(sheetName);
    if (headers.indexOf('Active') !== -1) return update(sheetName, idField, idValue, { Active: false, Status: 'Archived' });
    return update(sheetName, idField, idValue, { Status: 'Archived' });
  }

  function query(sheetName, predicate) {
    return getAll(sheetName).filter(predicate || function () { return true; });
  }

  return {
    getSheet: getSheet,
    ensureTable: ensureTable,
    getHeaders: getHeaders,
    getHeaderMap: getHeaderMap,
    getAll: getAll,
    findById: findById,
    findRowById: findRowById,
    insert: insert,
    update: update,
    upsert: upsert,
    softDelete: softDelete,
    query: query,
    rowToObject: rowToObject,
    objectToRow: objectToRow
  };
})();
