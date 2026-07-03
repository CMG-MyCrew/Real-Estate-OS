/**
 * REOS Enterprise v3.0 - Financial System Framework
 *
 * Tracks income, expenses, monthly P&L, tax reserve, and cash-flow summary.
 */

var REOS = REOS || {};

REOS.Finance = (function () {
  const SHEET = 'FINANCE';
  const ID_FIELD = 'Finance ID';

  const HEADERS = [
    'Finance ID', 'Date', 'Type', 'Category', 'Subcategory', 'Amount',
    'Record Type', 'Record ID', 'Client ID', 'Property ID', 'Transaction ID',
    'Payment Status', 'Payment Method', 'Tax Deductible', 'Tax Reserve Rate',
    'Tax Reserve Amount', 'Notes', 'Active', 'Created At', 'Updated At'
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

  function create(entry) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();

    entry = prepare_(entry || {});

    const validation = REOS.Validation.validateRecord(entry, {
      required: ['Date', 'Type', 'Category', 'Amount'],
      dateFields: ['Date']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, entry, {
      idField: ID_FIELD,
      idPrefix: 'F'
    });
    REOS.Logger.audit('Finance entry created', { financeId: created[ID_FIELD], type: created.Type, amount: created.Amount });
    return created;
  }

  function update(financeId, changes) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();

    const current = get(financeId);
    if (!current) throw new Error('Finance entry not found: ' + financeId);
    const merged = prepare_(Object.assign({}, current, changes || {}));
    const updated = REOS.Database.update(SHEET, ID_FIELD, financeId, merged);
    REOS.Logger.audit('Finance entry updated', { financeId: financeId });
    return updated;
  }

  function get(financeId) {
    REOS.Security.requirePermission('finance:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, financeId);
  }

  function listActive() {
    REOS.Security.requirePermission('finance:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (entry) {
      return entry.Active !== false;
    });
  }

  function monthlySummary(year, month) {
    REOS.Security.requirePermission('finance:read');
    ensureSheet();

    year = Number(year || new Date().getFullYear());
    month = Number(month || (new Date().getMonth() + 1));

    const records = listActive().filter(function (entry) {
      const date = toDate_(entry.Date);
      return date && date.getFullYear() === year && date.getMonth() + 1 === month;
    });

    const income = sumByType_(records, 'Income');
    const expenses = sumByType_(records, 'Expense');
    const taxReserve = sum_(records, 'Tax Reserve Amount');

    return {
      year: year,
      month: month,
      income: income,
      expenses: expenses,
      netProfit: income - expenses,
      taxReserve: taxReserve,
      cashFlow: income - expenses - taxReserve,
      records: records
    };
  }

  function dashboard() {
    const today = new Date();
    const current = monthlySummary(today.getFullYear(), today.getMonth() + 1);
    const all = listActive();
    return {
      currentMonth: current,
      totalIncome: sumByType_(all, 'Income'),
      totalExpenses: sumByType_(all, 'Expense'),
      totalTaxReserve: sum_(all, 'Tax Reserve Amount'),
      recent: all.slice(-50).reverse()
    };
  }

  function prepare_(entry) {
    entry.Date = entry.Date || new Date();
    entry.Type = entry.Type || 'Expense';
    entry.Amount = num_(entry.Amount);
    entry['Tax Reserve Rate'] = num_(entry['Tax Reserve Rate'] || 0.30);
    entry['Tax Reserve Amount'] = String(entry.Type).toLowerCase() === 'income'
      ? entry.Amount * entry['Tax Reserve Rate']
      : 0;
    entry['Payment Status'] = entry['Payment Status'] || 'Paid';
    entry.Active = entry.Active === false ? false : true;
    return entry;
  }

  function toDate_(value) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function num_(value) {
    return Number(value || 0) || 0;
  }

  function sum_(records, field) {
    return records.reduce(function (total, record) {
      return total + num_(record[field]);
    }, 0);
  }

  function sumByType_(records, type) {
    const target = String(type || '').toLowerCase();
    return records.reduce(function (total, record) {
      return String(record.Type || '').toLowerCase() === target ? total + num_(record.Amount) : total;
    }, 0);
  }

  return {
    ensureSheet: ensureSheet,
    create: create,
    update: update,
    get: get,
    listActive: listActive,
    monthlySummary: monthlySummary,
    dashboard: dashboard
  };
})();

function showFinance() {
  const html = HtmlService.createHtmlOutputFromFile('Finance')
    .setWidth(1000)
    .setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Finance');
}

function financeCreate(entry) {
  return REOS.Finance.create(entry);
}

function financeDashboard() {
  return REOS.Finance.dashboard();
}
