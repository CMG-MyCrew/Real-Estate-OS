/** REOS Enterprise v3.0 - License Management Administration */
var REOS = REOS || {};

REOS.Licensing = (function () {
  const SHEET = 'LICENSES';
  const HEADERS = ['License ID','Tenant ID','Customer','Edition','Seats','Storage GB','Status','Expiration','Usage JSON','Notes','Created At','Updated At'];
  const EDITIONS = { Starter: { seats: 5, storage: 5 }, Professional: { seats: 25, storage: 50 }, Enterprise: { seats: 250, storage: 500 }, Brokerage: { seats: 500, storage: 1000 }, WhiteLabel: { seats: 1000, storage: 2500 }, Unlimited: { seats: 99999, storage: 99999 } };

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET);
    if (!sheet) sheet = ss.insertSheet(SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function createLicense(record) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    record = record || {};
    record.Edition = record.Edition || 'Professional';
    const defaults = EDITIONS[record.Edition] || EDITIONS.Professional;
    record.Seats = Number(record.Seats || defaults.seats);
    record['Storage GB'] = Number(record['Storage GB'] || defaults.storage);
    record.Status = record.Status || 'Active';
    record['Usage JSON'] = record['Usage JSON'] || JSON.stringify({ seatsUsed: 0, storageUsedGb: 0 });
    const validation = REOS.Validation.validateRecord(record, { required: ['Customer', 'Edition'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    return REOS.Database.insert(SHEET, record, { idField: 'License ID', idPrefix: 'LIC' });
  }

  function updateUsage(licenseId, usage) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    return REOS.Database.update(SHEET, 'License ID', licenseId, { 'Usage JSON': JSON.stringify(usage || {}) });
  }

  function listLicenses() {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    return REOS.Database.getAll(SHEET);
  }

  function dashboard() {
    const licenses = listLicenses();
    return {
      licenseCount: licenses.length,
      activeCount: licenses.filter(function (l) { return String(l.Status || '').toLowerCase() === 'active'; }).length,
      expiredCount: licenses.filter(isExpired_).length,
      seats: sum_(licenses, 'Seats'),
      storageGb: sum_(licenses, 'Storage GB'),
      licenses: licenses
    };
  }

  function isExpired_(row) {
    if (!row.Expiration) return false;
    const d = new Date(row.Expiration);
    return !isNaN(d.getTime()) && d.getTime() < Date.now();
  }

  function sum_(rows, field) { return rows.reduce(function (t, r) { return t + (Number(r[field] || 0) || 0); }, 0); }

  return { ensureSheet: ensureSheet, createLicense: createLicense, updateUsage: updateUsage, listLicenses: listLicenses, dashboard: dashboard };
})();

function licensingCreate(record) { return REOS.Licensing.createLicense(record || {}); }
function licensingList() { return REOS.Licensing.listLicenses(); }
function licensingDashboard() { return REOS.Licensing.dashboard(); }
