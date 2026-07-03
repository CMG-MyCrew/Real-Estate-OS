/**
 * REOS Enterprise v3.0 - Rental Management Framework
 *
 * Tracks rental portfolio records, occupancy, income, expenses, and cash flow.
 */

var REOS = REOS || {};

REOS.Rentals = (function () {
  const SHEET = 'RENTALS';
  const ID_FIELD = 'Rental ID';

  const HEADERS = [
    'Rental ID', 'Property ID', 'Address', 'Status', 'Occupancy Status',
    'Monthly Rent', 'Mortgage', 'Taxes', 'Insurance', 'HOA',
    'Maintenance Reserve', 'Vacancy Reserve', 'Other Expenses',
    'Total Monthly Expenses', 'Net Monthly Cash Flow', 'Annual Cash Flow',
    'Current Tenant ID', 'Lease ID', 'Notes', 'Active', 'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET);
    if (!sheet) sheet = ss.insertSheet(SHEET);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function create(rental) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();

    rental = calculate_(rental || {});
    rental.Status = rental.Status || 'Active';
    rental['Occupancy Status'] = rental['Occupancy Status'] || 'Vacant';
    rental.Active = rental.Active === false ? false : true;

    const validation = REOS.Validation.validateRecord(rental, {
      required: ['Property ID', 'Address']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, rental, {
      idField: ID_FIELD,
      idPrefix: 'R'
    });
    REOS.Logger.audit('Rental created', { rentalId: created[ID_FIELD], propertyId: created['Property ID'] });
    return created;
  }

  function update(rentalId, changes) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();

    const current = get(rentalId);
    if (!current) throw new Error('Rental not found: ' + rentalId);
    const merged = calculate_(Object.assign({}, current, changes || {}));
    const updated = REOS.Database.update(SHEET, ID_FIELD, rentalId, merged);
    REOS.Logger.audit('Rental updated', { rentalId: rentalId });
    return updated;
  }

  function get(rentalId) {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, rentalId);
  }

  function listActive() {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (rental) {
      return rental.Active !== false;
    });
  }

  function dashboard() {
    ensureSheet();
    const active = listActive();
    const occupied = active.filter(function (r) { return String(r['Occupancy Status'] || '').toLowerCase() === 'occupied'; });
    const vacant = active.filter(function (r) { return String(r['Occupancy Status'] || '').toLowerCase() === 'vacant'; });
    return {
      rentalCount: active.length,
      occupiedCount: occupied.length,
      vacantCount: vacant.length,
      occupancyRate: active.length ? occupied.length / active.length : 0,
      monthlyRent: sum_(active, 'Monthly Rent'),
      monthlyCashFlow: sum_(active, 'Net Monthly Cash Flow'),
      active: active.slice(0, 50)
    };
  }

  function calculate_(record) {
    const expenses = num_(record.Mortgage) + num_(record.Taxes) + num_(record.Insurance) +
      num_(record.HOA) + num_(record['Maintenance Reserve']) + num_(record['Vacancy Reserve']) +
      num_(record['Other Expenses']);
    const rent = num_(record['Monthly Rent']);
    record['Total Monthly Expenses'] = expenses;
    record['Net Monthly Cash Flow'] = rent - expenses;
    record['Annual Cash Flow'] = (rent - expenses) * 12;
    return record;
  }

  function num_(value) {
    return Number(value || 0) || 0;
  }

  function sum_(records, field) {
    return records.reduce(function (total, record) {
      return total + num_(record[field]);
    }, 0);
  }

  return {
    ensureSheet: ensureSheet,
    create: create,
    update: update,
    get: get,
    listActive: listActive,
    dashboard: dashboard
  };
})();

function showRentals() {
  const html = HtmlService.createHtmlOutputFromFile('Rentals')
    .setWidth(1000)
    .setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Rentals');
}

function rentalsCreate(rental) {
  return REOS.Rentals.create(rental);
}

function rentalsDashboard() {
  return REOS.Rentals.dashboard();
}
