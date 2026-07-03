/**
 * REOS Enterprise v3.0 - Commissions Framework
 *
 * Tracks projected and paid commissions, brokerage split, referral fees,
 * transaction fees, tax reserve, and net commission.
 */

var REOS = REOS || {};

REOS.Commissions = (function () {
  const SHEET = 'COMMISSIONS';
  const ID_FIELD = 'Commission ID';

  const HEADERS = [
    'Commission ID', 'Transaction ID', 'Client ID', 'Close Date', 'Sale Price',
    'Commission %', 'GCI', 'Brokerage Split %', 'Brokerage Split Amount',
    'Referral Fee', 'Transaction Fee', 'Royalty Fee', 'Net Commission',
    'Tax Reserve Rate', 'Tax Reserve Amount', 'Projected Paid Date', 'Paid Date',
    'Payment Status', 'Notes', 'Active', 'Created At', 'Updated At'
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

  function create(commission) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();

    commission = calculate_(commission || {});
    commission['Payment Status'] = commission['Payment Status'] || 'Projected';
    commission.Active = commission.Active === false ? false : true;

    const validation = REOS.Validation.validateRecord(commission, {
      required: ['Sale Price', 'Commission %'],
      dateFields: ['Close Date', 'Projected Paid Date', 'Paid Date']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, commission, {
      idField: ID_FIELD,
      idPrefix: 'COM'
    });
    REOS.Logger.audit('Commission created', { commissionId: created[ID_FIELD], transactionId: created['Transaction ID'] });
    return created;
  }

  function createFromTransaction(transactionId) {
    REOS.Security.requirePermission('finance:write');
    const tx = REOS.Transactions.get(transactionId);
    if (!tx) throw new Error('Transaction not found: ' + transactionId);

    return create({
      'Transaction ID': tx['Transaction ID'],
      'Client ID': tx['Client ID'],
      'Close Date': tx['Closing Date'],
      'Sale Price': tx['Sale Price'],
      'Commission %': tx['Commission %'],
      'Brokerage Split %': tx['Brokerage Split %'],
      'Payment Status': tx.Status === 'Closed' ? 'Pending Payment' : 'Projected',
      Notes: 'Created from transaction record.'
    });
  }

  function update(commissionId, changes) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();

    const current = get(commissionId);
    if (!current) throw new Error('Commission not found: ' + commissionId);
    const merged = calculate_(Object.assign({}, current, changes || {}));
    const updated = REOS.Database.update(SHEET, ID_FIELD, commissionId, merged);
    REOS.Logger.audit('Commission updated', { commissionId: commissionId });
    return updated;
  }

  function markPaid(commissionId, paidDate) {
    const updated = update(commissionId, {
      'Payment Status': 'Paid',
      'Paid Date': paidDate || new Date()
    });

    try {
      REOS.Finance.create({
        Date: updated['Paid Date'] || new Date(),
        Type: 'Income',
        Category: 'Commission Income',
        Amount: updated['Net Commission'],
        'Record Type': 'Commission',
        'Record ID': updated[ID_FIELD],
        'Client ID': updated['Client ID'],
        'Transaction ID': updated['Transaction ID'],
        Notes: 'Commission paid: ' + updated[ID_FIELD]
      });
    } catch (error) {
      REOS.Logger.warn('Unable to create finance income from commission', { commissionId: commissionId, error: error.message });
    }

    return updated;
  }

  function get(commissionId) {
    REOS.Security.requirePermission('finance:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, commissionId);
  }

  function listActive() {
    REOS.Security.requirePermission('finance:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (commission) {
      return commission.Active !== false;
    });
  }

  function dashboard() {
    const all = listActive();
    const projected = all.filter(function (c) { return String(c['Payment Status'] || '').toLowerCase() !== 'paid'; });
    const paid = all.filter(function (c) { return String(c['Payment Status'] || '').toLowerCase() === 'paid'; });
    return {
      projectedCount: projected.length,
      paidCount: paid.length,
      projectedGci: sum_(projected, 'GCI'),
      projectedNet: sum_(projected, 'Net Commission'),
      paidNet: sum_(paid, 'Net Commission'),
      taxReserve: sum_(all, 'Tax Reserve Amount'),
      recent: all.slice(-50).reverse()
    };
  }

  function calculate_(record) {
    const salePrice = num_(record['Sale Price']);
    const commissionRate = num_(record['Commission %'] || 0.03);
    const gci = salePrice * commissionRate;
    const splitRate = num_(record['Brokerage Split %'] || 0.80);
    const brokerageSplitAmount = gci * splitRate;
    const fees = num_(record['Referral Fee']) + num_(record['Transaction Fee']) + num_(record['Royalty Fee']);
    const net = brokerageSplitAmount - fees;
    const taxRate = num_(record['Tax Reserve Rate'] || 0.30);

    record.GCI = gci;
    record['Brokerage Split Amount'] = brokerageSplitAmount;
    record['Net Commission'] = net;
    record['Tax Reserve Amount'] = net * taxRate;
    record['Tax Reserve Rate'] = taxRate;
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
    createFromTransaction: createFromTransaction,
    update: update,
    markPaid: markPaid,
    get: get,
    listActive: listActive,
    dashboard: dashboard
  };
})();

function commissionsCreate(commission) {
  return REOS.Commissions.create(commission);
}

function commissionsDashboard() {
  return REOS.Commissions.dashboard();
}
