/**
 * REOS Enterprise v3.1.1 - Finance Enhancements
 *
 * Increment 3.1.1.1-3.1.1.4 foundation:
 * invoice line items, invoice recalculation, PDF-ready invoice HTML,
 * aging reports, accounting categories, and finance enhancement dashboard.
 */

var REOS = REOS || {};

REOS.FinanceEnhancements = (function () {
  const INVOICE_LINES_SHEET = 'FIN_INVOICE_LINES';
  const ACCOUNT_CATEGORIES_SHEET = 'FIN_ACCOUNT_CATEGORIES';
  const PDF_LOG_SHEET = 'FIN_INVOICE_PDFS';
  const LINE_ID_FIELD = 'Invoice Line ID';
  const CATEGORY_ID_FIELD = 'Account Category ID';
  const PDF_ID_FIELD = 'Invoice PDF ID';

  const LINE_HEADERS = ['Invoice Line ID', 'Invoice ID', 'Line #', 'Item', 'Description', 'Quantity', 'Unit Price', 'Taxable', 'Tax Rate', 'Line Subtotal', 'Line Tax', 'Line Total', 'Created At', 'Updated At'];
  const CATEGORY_HEADERS = ['Account Category ID', 'Type', 'Name', 'Code', 'QuickBooks Account', 'Default For', 'Active', 'Created At', 'Updated At'];
  const PDF_HEADERS = ['Invoice PDF ID', 'Invoice ID', 'Status', 'File URL', 'HTML Snapshot', 'Generated At', 'Created At', 'Updated At'];

  const DEFAULT_CATEGORIES = [
    ['Income', 'Property Management Income', '4000', 'Property Management Income', 'Invoice', true],
    ['Income', 'Maintenance Reimbursement', '4010', 'Maintenance Reimbursement', 'Invoice Line', true],
    ['Expense', 'Repairs and Maintenance', '6000', 'Repairs and Maintenance', 'Expense', true],
    ['Expense', 'Cleaning and Preservation', '6010', 'Cleaning and Preservation', 'Vendor Payment', true],
    ['Expense', 'Utilities', '6020', 'Utilities', 'Expense', true],
    ['Asset', 'Accounts Receivable', '1200', 'Accounts Receivable', 'Invoice', true],
    ['Liability', 'Accounts Payable', '2000', 'Accounts Payable', 'Vendor Payment', true]
  ];

  function ensureSheets() {
    ensureTable_(INVOICE_LINES_SHEET, LINE_HEADERS);
    ensureTable_(ACCOUNT_CATEGORIES_SHEET, CATEGORY_HEADERS);
    ensureTable_(PDF_LOG_SHEET, PDF_HEADERS);
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

  function getDashboard() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const lines = REOS.Database.getAll(INVOICE_LINES_SHEET);
    const categories = REOS.Database.getAll(ACCOUNT_CATEGORIES_SHEET);
    const pdfs = REOS.Database.getAll(PDF_LOG_SHEET);
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        invoiceLines: lines.length,
        accountCategories: categories.length,
        invoicePdfs: pdfs.length,
        arCurrent: getReceivablesAging().current,
        ar30: getReceivablesAging().days30,
        ar60: getReceivablesAging().days60,
        ar90: getReceivablesAging().days90,
        ar120: getReceivablesAging().days120
      },
      recentLines: latest_(lines, 'Created At', 100),
      categories: categories,
      pdfs: latest_(pdfs, 'Created At', 50),
      receivablesAging: getReceivablesAging(),
      payablesAging: getPayablesAging()
    };
  }

  function seedAccountCategories() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const existing = REOS.Database.getAll(ACCOUNT_CATEGORIES_SHEET).map(function (r) { return String(r.Type) + '|' + String(r.Name); });
    let created = 0;
    DEFAULT_CATEGORIES.forEach(function (row) {
      const key = row[0] + '|' + row[1];
      if (existing.indexOf(key) !== -1) return;
      REOS.Database.insert(ACCOUNT_CATEGORIES_SHEET, {
        Type: row[0], Name: row[1], Code: row[2], 'QuickBooks Account': row[3], 'Default For': row[4], Active: row[5], 'Created At': new Date(), 'Updated At': new Date()
      }, { idField: CATEGORY_ID_FIELD, idPrefix: 'ACCT' });
      created++;
    });
    return { ok: true, created: created, categories: REOS.Database.getAll(ACCOUNT_CATEGORIES_SHEET) };
  }

  function addInvoiceLine(record) {
    REOS.Security.requireAdmin();
    ensureSheets();
    record = record || {};
    if (!record['Invoice ID']) throw new Error('Invoice ID is required.');
    const quantity = Number(record.Quantity || 1);
    const unitPrice = Number(record['Unit Price'] || 0);
    const taxable = record.Taxable === true || record.Taxable === 'true';
    const taxRate = Number(record['Tax Rate'] || 0);
    const subtotal = quantity * unitPrice;
    const tax = taxable ? subtotal * taxRate : 0;
    const total = subtotal + tax;
    const lineNumber = nextLineNumber_(record['Invoice ID']);
    const line = REOS.Database.insert(INVOICE_LINES_SHEET, {
      'Invoice ID': record['Invoice ID'],
      'Line #': lineNumber,
      Item: record.Item || 'Service',
      Description: record.Description || '',
      Quantity: quantity,
      'Unit Price': unitPrice,
      Taxable: taxable,
      'Tax Rate': taxRate,
      'Line Subtotal': subtotal,
      'Line Tax': tax,
      'Line Total': total,
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: LINE_ID_FIELD, idPrefix: 'ILIN' });
    recalculateInvoice(record['Invoice ID']);
    return line;
  }

  function recalculateInvoice(invoiceId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const lines = REOS.Database.getAll(INVOICE_LINES_SHEET).filter(function (l) { return l['Invoice ID'] === invoiceId; });
    const subtotal = sum_(lines, 'Line Subtotal');
    const tax = sum_(lines, 'Line Tax');
    const total = subtotal + tax;
    const invoice = REOS.Database.findById('FIN_INVOICES', 'Invoice ID', invoiceId);
    if (!invoice) return { ok: false, message: 'Invoice not found', invoiceId: invoiceId, subtotal: subtotal, tax: tax, total: total };
    const paid = Number(invoice['Paid Amount'] || 0);
    return REOS.Database.update('FIN_INVOICES', 'Invoice ID', invoiceId, {
      Subtotal: subtotal,
      Tax: tax,
      Total: total,
      Balance: Math.max(0, total - paid),
      Status: Math.max(0, total - paid) <= 0 && total > 0 ? 'Paid' : invoice.Status || 'Open',
      'Updated At': new Date()
    });
  }

  function getInvoicePreview(invoiceId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const invoice = REOS.Database.findById('FIN_INVOICES', 'Invoice ID', invoiceId);
    if (!invoice) throw new Error('Invoice not found: ' + invoiceId);
    const lines = REOS.Database.getAll(INVOICE_LINES_SHEET).filter(function (l) { return l['Invoice ID'] === invoiceId; });
    return { ok: true, invoice: invoice, lines: lines, html: buildInvoiceHtml_(invoice, lines) };
  }

  function generateInvoicePdfRecord(invoiceId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const preview = getInvoicePreview(invoiceId);
    return REOS.Database.insert(PDF_LOG_SHEET, {
      'Invoice ID': invoiceId,
      Status: 'HTML Generated',
      'File URL': '',
      'HTML Snapshot': preview.html,
      'Generated At': new Date(),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: PDF_ID_FIELD, idPrefix: 'IPDF' });
  }

  function getReceivablesAging() {
    ensureSheets();
    const invoices = safeGetAll_('FIN_INVOICES').filter(function (i) { return Number(i.Balance || 0) > 0; });
    return aging_(invoices, 'Due Date', 'Balance');
  }

  function getPayablesAging() {
    ensureSheets();
    const payments = safeGetAll_('FIN_VENDOR_PAYMENTS').filter(function (p) { return String(p.Status || '') !== 'Paid'; });
    return aging_(payments, 'Payment Date', 'Amount');
  }

  function aging_(rows, dateField, amountField) {
    const today = new Date();
    const result = { current: 0, days30: 0, days60: 0, days90: 0, days120: 0, total: 0, records: [] };
    rows.forEach(function (row) {
      const amount = Number(row[amountField] || 0);
      const date = row[dateField] ? new Date(row[dateField]) : today;
      const days = Math.floor((today.getTime() - date.getTime()) / 86400000);
      if (days <= 0) result.current += amount;
      else if (days <= 30) result.days30 += amount;
      else if (days <= 60) result.days60 += amount;
      else if (days <= 90) result.days90 += amount;
      else result.days120 += amount;
      result.total += amount;
      result.records.push(Object.assign({}, row, { AgingDays: days, AgingAmount: amount }));
    });
    return result;
  }

  function buildInvoiceHtml_(invoice, lines) {
    const lineRows = (lines || []).map(function (l) {
      return '<tr><td>' + esc_(l.Item) + '</td><td>' + esc_(l.Description) + '</td><td>' + esc_(l.Quantity) + '</td><td>$' + Number(l['Unit Price'] || 0).toFixed(2) + '</td><td>$' + Number(l['Line Total'] || 0).toFixed(2) + '</td></tr>';
    }).join('');
    return '<html><body style="font-family:Arial;padding:32px;color:#111827">' +
      '<h1>Invoice ' + esc_(invoice['Invoice ID']) + '</h1>' +
      '<p><strong>Client:</strong> ' + esc_(invoice.Client) + '<br><strong>Property:</strong> ' + esc_(invoice['Property ID']) + '<br><strong>Due:</strong> ' + esc_(invoice['Due Date']) + '</p>' +
      '<table style="width:100%;border-collapse:collapse" border="1" cellpadding="8"><thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>' + lineRows + '</tbody></table>' +
      '<h2 style="text-align:right">Balance: $' + Number(invoice.Balance || 0).toFixed(2) + '</h2>' +
      '</body></html>';
  }

  function nextLineNumber_(invoiceId) { return REOS.Database.getAll(INVOICE_LINES_SHEET).filter(function (l) { return l['Invoice ID'] === invoiceId; }).length + 1; }
  function safeGetAll_(sheetName) { try { return REOS.Database.getAll(sheetName); } catch (error) { return []; } }
  function sum_(rows, field) { return (rows || []).reduce(function (s, r) { return s + Number(r[field] || 0); }, 0); }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 50); }
  function esc_(v) { return String(v == null ? '' : v).replace(/[&<>'"]/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]; }); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, seedAccountCategories: seedAccountCategories, addInvoiceLine: addInvoiceLine, recalculateInvoice: recalculateInvoice, getInvoicePreview: getInvoicePreview, generateInvoicePdfRecord: generateInvoicePdfRecord, getReceivablesAging: getReceivablesAging, getPayablesAging: getPayablesAging };
})();

function reosFinanceEnhancementsEnsureSheets() { return REOS.FinanceEnhancements.ensureSheets(); }
function reosFinanceEnhancementsDashboard() { return REOS.FinanceEnhancements.getDashboard(); }
function reosFinanceSeedAccountCategories() { return REOS.FinanceEnhancements.seedAccountCategories(); }
function reosFinanceAddInvoiceLine(record) { return REOS.FinanceEnhancements.addInvoiceLine(record || {}); }
function reosFinanceRecalculateInvoice(invoiceId) { return REOS.FinanceEnhancements.recalculateInvoice(invoiceId); }
function reosFinanceInvoicePreview(invoiceId) { return REOS.FinanceEnhancements.getInvoicePreview(invoiceId); }
function reosFinanceGenerateInvoicePdfRecord(invoiceId) { return REOS.FinanceEnhancements.generateInvoicePdfRecord(invoiceId); }
function showFinanceEnhancements() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('FinanceEnhancementsUI').setTitle('REOS Finance Enhancements').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Finance Enhancements');
}
