/**
 * REOS Enterprise v3.0 - Investment Framework
 *
 * Deal analyzer, flip/rental metrics, MAO, ROI, and cash-flow calculations.
 */

var REOS = REOS || {};

REOS.Investments = (function () {
  const SHEET = 'INVESTMENTS';
  const ID_FIELD = 'Investment ID';

  const HEADERS = [
    'Investment ID', 'Property ID', 'Strategy', 'Status', 'Asking Price',
    'Offer Price', 'Purchase Price', 'ARV', 'Rehab Budget', 'Actual Rehab',
    'Holding Costs', 'Closing Costs', 'Selling Costs', 'Financing Costs',
    'Total Investment', 'MAO', 'Estimated Profit', 'Actual Profit', 'ROI',
    'Monthly Rent', 'Mortgage', 'Taxes', 'Insurance', 'HOA', 'Maintenance Reserve',
    'Vacancy Reserve', 'Monthly Cash Flow', 'Cap Rate', 'Notes', 'Active',
    'Created At', 'Updated At'
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

  function create(investment) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();

    investment = calculate_(investment || {});
    investment.Status = investment.Status || 'Prospect';
    investment.Active = investment.Active === false ? false : true;

    const validation = REOS.Validation.validateRecord(investment, {
      required: ['Strategy']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, investment, {
      idField: ID_FIELD,
      idPrefix: 'I'
    });
    REOS.Logger.audit('Investment created', { investmentId: created[ID_FIELD], propertyId: created['Property ID'] });
    return created;
  }

  function update(investmentId, changes) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();

    const current = get(investmentId);
    if (!current) throw new Error('Investment not found: ' + investmentId);
    const merged = calculate_(Object.assign({}, current, changes || {}));
    const updated = REOS.Database.update(SHEET, ID_FIELD, investmentId, merged);
    REOS.Logger.audit('Investment updated', { investmentId: investmentId });
    return updated;
  }

  function get(investmentId) {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, investmentId);
  }

  function listActive() {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (record) {
      return record.Active !== false;
    });
  }

  function analyze(input) {
    REOS.Security.requirePermission('transactions:read');
    return calculate_(input || {});
  }

  function dashboard() {
    ensureSheet();
    const active = listActive();
    const flips = active.filter(function (i) { return String(i.Strategy || '').toLowerCase() === 'flip'; });
    const rentals = active.filter(function (i) { return String(i.Strategy || '').toLowerCase() === 'rental'; });

    return {
      activeCount: active.length,
      flipCount: flips.length,
      rentalCount: rentals.length,
      totalEstimatedProfit: sum_(active, 'Estimated Profit'),
      totalActualProfit: sum_(active, 'Actual Profit'),
      monthlyCashFlow: sum_(rentals, 'Monthly Cash Flow'),
      active: active.slice(0, 50)
    };
  }

  function calculate_(record) {
    const arv = num_(record.ARV);
    const purchase = num_(record['Purchase Price'] || record['Offer Price']);
    const rehabBudget = num_(record['Rehab Budget']);
    const actualRehab = num_(record['Actual Rehab']);
    const rehab = actualRehab || rehabBudget;
    const holding = num_(record['Holding Costs']);
    const closing = num_(record['Closing Costs']);
    const selling = num_(record['Selling Costs']);
    const financing = num_(record['Financing Costs']);
    const totalInvestment = purchase + rehab + holding + closing + selling + financing;

    record['Total Investment'] = totalInvestment;
    record.MAO = (arv * 0.70) - rehabBudget;
    record['Estimated Profit'] = arv - totalInvestment;
    record.ROI = totalInvestment ? record['Estimated Profit'] / totalInvestment : 0;

    const rent = num_(record['Monthly Rent']);
    const mortgage = num_(record.Mortgage);
    const taxes = num_(record.Taxes);
    const insurance = num_(record.Insurance);
    const hoa = num_(record.HOA);
    const maintenance = num_(record['Maintenance Reserve']);
    const vacancy = num_(record['Vacancy Reserve']);
    record['Monthly Cash Flow'] = rent - mortgage - taxes - insurance - hoa - maintenance - vacancy;
    record['Cap Rate'] = arv ? ((rent * 12) - ((taxes + insurance + hoa + maintenance + vacancy) * 12)) / arv : 0;

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
    analyze: analyze,
    dashboard: dashboard
  };
})();

function showInvestments() {
  const html = HtmlService.createHtmlOutputFromFile('Investments')
    .setWidth(1000)
    .setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Investments');
}

function investmentsAnalyze(input) {
  return REOS.Investments.analyze(input);
}

function investmentsCreate(input) {
  return REOS.Investments.create(input);
}

function investmentsDashboard() {
  return REOS.Investments.dashboard();
}
