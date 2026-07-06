/**
 * REOS Enterprise v3.1 - Financial Management & Accounting Integrations
 *
 * Adds invoices, vendor payments, expenses, payment approvals, property P&L,
 * and QuickBooks-ready export support.
 */

var REOS = REOS || {};

REOS.FinanceManager = (function () {
  const INVOICES_SHEET = 'FIN_INVOICES';
  const PAYMENTS_SHEET = 'FIN_VENDOR_PAYMENTS';
  const EXPENSES_SHEET = 'FIN_EXPENSES';
  const APPROVALS_SHEET = 'FIN_PAYMENT_APPROVALS';
  const EXPORTS_SHEET = 'FIN_QB_EXPORTS';
  const INVOICE_ID_FIELD = 'Invoice ID';
  const PAYMENT_ID_FIELD = 'Payment ID';
  const EXPENSE_ID_FIELD = 'Expense ID';
  const APPROVAL_ID_FIELD = 'Payment Approval ID';
  const EXPORT_ID_FIELD = 'QB Export ID';

  const INVOICE_HEADERS = ['Invoice ID', 'Property ID', 'Client', 'Invoice Date', 'Due Date', 'Status', 'Subtotal', 'Tax', 'Total', 'Paid Amount', 'Balance', 'Notes', 'Created At', 'Updated At'];
  const PAYMENT_HEADERS = ['Payment ID', 'Vendor ID', 'Vendor Name', 'Property ID', 'Work Order ID', 'Payment Date', 'Status', 'Amount', 'Method', 'Reference', 'Memo', 'Created At', 'Updated At'];
  const EXPENSE_HEADERS = ['Expense ID', 'Property ID', 'Vendor ID', 'Category', 'Expense Date', 'Amount', 'Billable', 'Status', 'Receipt URL', 'Memo', 'Created At', 'Updated At'];
  const APPROVAL_HEADERS = ['Payment Approval ID', 'Payment ID', 'Role', 'Approver', 'Status', 'Comments', 'Approved At', 'Created At', 'Updated At'];
  const EXPORT_HEADERS = ['QB Export ID', 'Export Date', 'Status', 'Invoices', 'Payments', 'Expenses', 'CSV JSON', 'Created At', 'Updated At'];
  const APPROVAL_ROLES = ['Operations Lead', 'Finance Lead'];

  function ensureSheets() {
    ensureTable_(INVOICES_SHEET, INVOICE_HEADERS);
    ensureTable_(PAYMENTS_SHEET, PAYMENT_HEADERS);
    ensureTable_(EXPENSES_SHEET, EXPENSE_HEADERS);
    ensureTable_(APPROVALS_SHEET, APPROVAL_HEADERS);
    ensureTable_(EXPORTS_SHEET, EXPORT_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setWrap(true);
      sheet.autoResizeColumns(1, headers.length);
    }
  }

  function getDashboard(filters) {
    REOS.Security.requireAdmin();
    ensureSheets();
    filters = filters || {};
    const invoices = REOS.Database.getAll(INVOICES_SHEET);
    const payments = REOS.Database.getAll(PAYMENTS_SHEET);
    const expenses = REOS.Database.getAll(EXPENSES_SHEET);
    const approvals = REOS.Database.getAll(APPROVALS_SHEET);
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        invoices: invoices.length,
        openInvoices: invoices.filter(function (i) { return String(i.Status || '') !== 'Paid'; }).length,
        receivables: sum_(invoices, 'Balance'),
        pendingPayments: payments.filter(function (p) { return String(p.Status || '') === 'Pending Approval'; }).length,
        payableAmount: sum_(payments.filter(function (p) { return String(p.Status || '') !== 'Paid'; }), 'Amount'),
        expenses: sum_(expenses, 'Amount'),
        pendingApprovals: approvals.filter(function (a) { return String(a.Status || '') === 'Pending'; }).length
      },
      invoices: latest_(invoices, 'Created At', 100),
      payments: latest_(payments, 'Created At', 100),
      expenses: latest_(expenses, 'Created At', 100),
      approvals: latest_(approvals, 'Created At', 100),
      propertyPL: getPropertyPL(filters.propertyId || '')
    };
  }

  function createInvoice(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    const subtotal = Number(record.Subtotal || 0);
    const tax = Number(record.Tax || 0);
    const total = subtotal + tax;
    const paid = Number(record['Paid Amount'] || 0);
    return REOS.Database.insert(INVOICES_SHEET, {
      'Property ID': record['Property ID'] || '',
      Client: record.Client || '',
      'Invoice Date': record['Invoice Date'] || new Date(),
      'Due Date': record['Due Date'] || '',
      Status: record.Status || 'Open',
      Subtotal: subtotal,
      Tax: tax,
      Total: total,
      'Paid Amount': paid,
      Balance: Math.max(0, total - paid),
      Notes: record.Notes || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: INVOICE_ID_FIELD, idPrefix: 'INV' });
  }

  function recordInvoicePayment(invoiceId, amount) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const invoice = REOS.Database.findById(INVOICES_SHEET, INVOICE_ID_FIELD, invoiceId);
    if (!invoice) throw new Error('Invoice not found: ' + invoiceId);
    const paid = Number(invoice['Paid Amount'] || 0) + Number(amount || 0);
    const balance = Math.max(0, Number(invoice.Total || 0) - paid);
    return REOS.Database.update(INVOICES_SHEET, INVOICE_ID_FIELD, invoiceId, {
      'Paid Amount': paid,
      Balance: balance,
      Status: balance <= 0 ? 'Paid' : 'Partial',
      'Updated At': new Date()
    });
  }

  function createVendorPayment(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    const row = REOS.Database.insert(PAYMENTS_SHEET, {
      'Vendor ID': record['Vendor ID'] || '',
      'Vendor Name': record['Vendor Name'] || '',
      'Property ID': record['Property ID'] || '',
      'Work Order ID': record['Work Order ID'] || '',
      'Payment Date': record['Payment Date'] || new Date(),
      Status: record.Status || 'Pending Approval',
      Amount: Number(record.Amount || 0),
      Method: record.Method || 'ACH',
      Reference: record.Reference || '',
      Memo: record.Memo || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: PAYMENT_ID_FIELD, idPrefix: 'PAY' });
    seedPaymentApprovals_(row[PAYMENT_ID_FIELD]);
    return row;
  }

  function approvePayment(paymentId, role, comments) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const rows = REOS.Database.getAll(APPROVALS_SHEET).filter(function (a) { return a[PAYMENT_ID_FIELD] === paymentId && a.Role === role; });
    if (!rows.length) throw new Error('Approval role not found: ' + role);
    REOS.Database.update(APPROVALS_SHEET, APPROVAL_ID_FIELD, rows[0][APPROVAL_ID_FIELD], {
      Approver: Session.getActiveUser().getEmail() || '',
      Status: 'Approved',
      Comments: comments || '',
      'Approved At': new Date(),
      'Updated At': new Date()
    });
    return refreshPaymentStatus(paymentId);
  }

  function refreshPaymentStatus(paymentId) {
    const approvals = REOS.Database.getAll(APPROVALS_SHEET).filter(function (a) { return a[PAYMENT_ID_FIELD] === paymentId; });
    const approved = approvals.filter(function (a) { return a.Status === 'Approved'; }).length;
    if (approved === APPROVAL_ROLES.length) {
      return REOS.Database.update(PAYMENTS_SHEET, PAYMENT_ID_FIELD, paymentId, { Status: 'Approved', 'Updated At': new Date() });
    }
    return { ok: true, paymentId: paymentId, approved: approved, required: APPROVAL_ROLES.length };
  }

  function markPaymentPaid(paymentId, reference) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.update(PAYMENTS_SHEET, PAYMENT_ID_FIELD, paymentId, { Status: 'Paid', Reference: reference || '', 'Updated At': new Date() });
  }

  function createExpense(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    return REOS.Database.insert(EXPENSES_SHEET, {
      'Property ID': record['Property ID'] || '',
      'Vendor ID': record['Vendor ID'] || '',
      Category: record.Category || 'General',
      'Expense Date': record['Expense Date'] || new Date(),
      Amount: Number(record.Amount || 0),
      Billable: record.Billable === true || record.Billable === 'true',
      Status: record.Status || 'Recorded',
      'Receipt URL': record['Receipt URL'] || '',
      Memo: record.Memo || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: EXPENSE_ID_FIELD, idPrefix: 'EXP' });
  }

  function getPropertyPL(propertyId) {
    ensureSheets();
    const invoices = REOS.Database.getAll(INVOICES_SHEET).filter(function (i) { return !propertyId || i['Property ID'] === propertyId; });
    const payments = REOS.Database.getAll(PAYMENTS_SHEET).filter(function (p) { return !propertyId || p['Property ID'] === propertyId; });
    const expenses = REOS.Database.getAll(EXPENSES_SHEET).filter(function (e) { return !propertyId || e['Property ID'] === propertyId; });
    const revenue = sum_(invoices, 'Total');
    const vendorPayments = sum_(payments.filter(function (p) { return String(p.Status || '') === 'Paid' || String(p.Status || '') === 'Approved'; }), 'Amount');
    const expenseTotal = sum_(expenses, 'Amount');
    return { propertyId: propertyId || 'All', revenue: revenue, vendorPayments: vendorPayments, expenses: expenseTotal, net: revenue - vendorPayments - expenseTotal };
  }

  function generateQuickBooksExport() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const invoices = REOS.Database.getAll(INVOICES_SHEET);
    const payments = REOS.Database.getAll(PAYMENTS_SHEET);
    const expenses = REOS.Database.getAll(EXPENSES_SHEET);
    const csv = {
      invoices: invoices.map(function (i) { return ['Invoice', i[INVOICE_ID_FIELD], i.Client, i['Invoice Date'], i.Total, i.Balance].join(','); }),
      payments: payments.map(function (p) { return ['VendorPayment', p[PAYMENT_ID_FIELD], p['Vendor Name'], p['Payment Date'], p.Amount, p.Status].join(','); }),
      expenses: expenses.map(function (e) { return ['Expense', e[EXPENSE_ID_FIELD], e.Category, e['Expense Date'], e.Amount, e.Status].join(','); })
    };
    return REOS.Database.insert(EXPORTS_SHEET, {
      'Export Date': new Date(),
      Status: 'Generated',
      Invoices: invoices.length,
      Payments: payments.length,
      Expenses: expenses.length,
      'CSV JSON': REOS.toJson_(csv),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: EXPORT_ID_FIELD, idPrefix: 'QBX' });
  }

  function seedPaymentApprovals_(paymentId) {
    APPROVAL_ROLES.forEach(function (role) {
      REOS.Database.insert(APPROVALS_SHEET, { [PAYMENT_ID_FIELD]: paymentId, Role: role, Approver: '', Status: 'Pending', Comments: '', 'Approved At': '', 'Created At': new Date(), 'Updated At': new Date() }, { idField: APPROVAL_ID_FIELD, idPrefix: 'FAPP' });
    });
  }

  function sum_(rows, field) { return (rows || []).reduce(function (sum, row) { return sum + Number(row[field] || 0); }, 0); }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 100); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, createInvoice: createInvoice, recordInvoicePayment: recordInvoicePayment, createVendorPayment: createVendorPayment, approvePayment: approvePayment, refreshPaymentStatus: refreshPaymentStatus, markPaymentPaid: markPaymentPaid, createExpense: createExpense, getPropertyPL: getPropertyPL, generateQuickBooksExport: generateQuickBooksExport };
})();

function reosFinanceEnsureSheets() { return REOS.FinanceManager.ensureSheets(); }
function reosFinanceDashboard(filters) { return REOS.FinanceManager.getDashboard(filters || {}); }
function reosFinanceCreateInvoice(record) { return REOS.FinanceManager.createInvoice(record || {}); }
function reosFinanceRecordInvoicePayment(invoiceId, amount) { return REOS.FinanceManager.recordInvoicePayment(invoiceId, amount || 0); }
function reosFinanceCreateVendorPayment(record) { return REOS.FinanceManager.createVendorPayment(record || {}); }
function reosFinanceApprovePayment(paymentId, role, comments) { return REOS.FinanceManager.approvePayment(paymentId, role, comments || ''); }
function reosFinanceMarkPaymentPaid(paymentId, reference) { return REOS.FinanceManager.markPaymentPaid(paymentId, reference || ''); }
function reosFinanceCreateExpense(record) { return REOS.FinanceManager.createExpense(record || {}); }
function reosFinanceQuickBooksExport() { return REOS.FinanceManager.generateQuickBooksExport(); }
function showFinanceManager() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('FinanceManager').setTitle('REOS Finance Manager').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Finance Manager');
}
