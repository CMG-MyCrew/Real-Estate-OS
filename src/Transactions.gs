/**
 * REOS Enterprise v3.0 - Transaction Framework
 *
 * Handles buyer/seller transactions, status tracking, closing dates,
 * commission calculations, and deadline task generation.
 */

var REOS = REOS || {};

REOS.Transactions = (function () {
  const SHEET = 'TRANSACTIONS';
  const ID_FIELD = 'Transaction ID';

  const HEADERS = [
    'Transaction ID', 'Client ID', 'Lead ID', 'Property ID', 'Address',
    'Transaction Type', 'Status', 'Contract Date', 'Closing Date', 'Days Remaining',
    'Sale Price', 'Commission %', 'Gross Commission', 'Brokerage Split %',
    'Net Commission', 'Escrow Amount', 'Lender', 'Title Company', 'Agent',
    'Notes', 'Active', 'Created At', 'Updated At'
  ];

  const DEFAULT_CHECKLIST = [
    { task: 'Deposit earnest money', offsetType: 'contract', offsetDays: 1, priority: 'High' },
    { task: 'Schedule inspection', offsetType: 'contract', offsetDays: 3, priority: 'High' },
    { task: 'Review inspection report', offsetType: 'contract', offsetDays: 7, priority: 'High' },
    { task: 'Confirm appraisal ordered', offsetType: 'contract', offsetDays: 10, priority: 'Medium' },
    { task: 'Confirm loan commitment', offsetType: 'contract', offsetDays: 21, priority: 'High' },
    { task: 'Final walkthrough', offsetType: 'closing', offsetDays: -1, priority: 'High' },
    { task: 'Closing', offsetType: 'closing', offsetDays: 0, priority: 'Critical' }
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

  function create(transaction) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();

    transaction = prepare_(transaction || {});

    const validation = REOS.Validation.validateRecord(transaction, {
      required: ['Client ID', 'Address', 'Transaction Type', 'Status', 'Closing Date'],
      dateFields: ['Contract Date', 'Closing Date']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, transaction, {
      idField: ID_FIELD,
      idPrefix: REOS.CONFIG.IDS.TRANSACTION
    });

    createDefaultChecklist_(created);
    REOS.Logger.audit('Transaction created', { transactionId: created[ID_FIELD], clientId: created['Client ID'] });
    return created;
  }

  function update(transactionId, changes) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();

    const current = get(transactionId);
    if (!current) throw new Error('Transaction not found: ' + transactionId);

    const merged = prepare_(Object.assign({}, current, changes || {}));
    const updated = REOS.Database.update(SHEET, ID_FIELD, transactionId, merged);
    REOS.Logger.audit('Transaction updated', { transactionId: transactionId });
    return updated;
  }

  function get(transactionId) {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, transactionId);
  }

  function listActive() {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (tx) {
      return tx.Active !== false && String(tx.Status || '').toLowerCase() !== 'closed';
    });
  }

  function listByStatus(status) {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    const target = String(status || '').toLowerCase();
    return REOS.Database.query(SHEET, function (tx) {
      return String(tx.Status || '').toLowerCase() === target;
    });
  }

  function close(transactionId) {
    return update(transactionId, {
      Status: 'Closed',
      Active: false
    });
  }

  function dashboard() {
    const all = REOS.Database.getAll(SHEET);
    const active = all.filter(function (tx) {
      return tx.Active !== false && String(tx.Status || '').toLowerCase() !== 'closed';
    });
    const pending = active.filter(function (tx) {
      return ['under contract', 'inspection', 'appraisal', 'financing', 'clear to close'].indexOf(String(tx.Status || '').toLowerCase()) !== -1;
    });
    const closed = all.filter(function (tx) { return String(tx.Status || '').toLowerCase() === 'closed'; });

    return {
      activeCount: active.length,
      pendingCount: pending.length,
      closedCount: closed.length,
      pendingGci: sum_(pending, 'Gross Commission'),
      closedGci: sum_(closed, 'Gross Commission'),
      active: active.slice(0, 50)
    };
  }

  function prepare_(transaction) {
    transaction.Status = transaction.Status || 'Under Contract';
    transaction.Active = transaction.Active === false ? false : true;
    transaction['Commission %'] = Number(transaction['Commission %'] || 0.03);
    transaction['Brokerage Split %'] = Number(transaction['Brokerage Split %'] || 0.80);
    transaction['Sale Price'] = Number(transaction['Sale Price'] || 0);
    transaction['Gross Commission'] = transaction['Sale Price'] * transaction['Commission %'];
    transaction['Net Commission'] = transaction['Gross Commission'] * transaction['Brokerage Split %'];
    transaction['Days Remaining'] = daysUntil_(transaction['Closing Date']);
    return transaction;
  }

  function createDefaultChecklist_(transaction) {
    DEFAULT_CHECKLIST.forEach(function (item) {
      const dueDate = calculateDueDate_(transaction, item);
      if (!dueDate) return;
      try {
        REOS.Tasks.create({
          'Client ID': transaction['Client ID'],
          Task: item.task + ' - ' + transaction.Address,
          Category: 'Transaction',
          Priority: item.priority,
          'Due Date': dueDate,
          Status: 'Not Started',
          Notes: 'Transaction ID: ' + transaction[ID_FIELD]
        });
      } catch (error) {
        REOS.Logger.warn('Unable to create transaction checklist task', {
          transactionId: transaction[ID_FIELD],
          task: item.task,
          error: error.message
        });
      }
    });
  }

  function calculateDueDate_(transaction, item) {
    const base = item.offsetType === 'closing' ? toDate_(transaction['Closing Date']) : toDate_(transaction['Contract Date']);
    if (!base) return null;
    const date = new Date(base);
    date.setDate(date.getDate() + item.offsetDays);
    return date;
  }

  function daysUntil_(value) {
    const date = toDate_(value);
    if (!date) return '';
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.ceil((startDate.getTime() - startToday.getTime()) / 86400000);
  }

  function toDate_(value) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function sum_(records, field) {
    return records.reduce(function (total, record) {
      return total + Number(record[field] || 0);
    }, 0);
  }

  return {
    ensureSheet: ensureSheet,
    create: create,
    update: update,
    get: get,
    listActive: listActive,
    listByStatus: listByStatus,
    close: close,
    dashboard: dashboard
  };
})();

function showTransactions() {
  const html = HtmlService.createHtmlOutputFromFile('Transactions')
    .setWidth(1000)
    .setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Transactions');
}

function transactionsCreate(transaction) {
  return REOS.Transactions.create(transaction);
}

function transactionsDashboard() {
  return REOS.Transactions.dashboard();
}
