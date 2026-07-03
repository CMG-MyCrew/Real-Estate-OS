/**
 * REOS Enterprise v3.0 - Leases Framework
 *
 * Tracks tenants, lease dates, renewals, deposits, and expiration alerts.
 */

var REOS = REOS || {};

REOS.Leases = (function () {
  const SHEET = 'LEASES';
  const ID_FIELD = 'Lease ID';

  const HEADERS = [
    'Lease ID', 'Rental ID', 'Property ID', 'Tenant Name', 'Tenant Email', 'Tenant Phone',
    'Lease Start', 'Lease End', 'Renewal Date', 'Notice Date', 'Monthly Rent',
    'Security Deposit', 'Status', 'Days Until Expiration', 'Notes', 'Active',
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

  function create(lease) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();

    lease = prepare_(lease || {});
    lease.Status = lease.Status || 'Active';
    lease.Active = lease.Active === false ? false : true;

    const validation = REOS.Validation.validateRecord(lease, {
      required: ['Rental ID', 'Tenant Name', 'Lease Start', 'Lease End'],
      emailField: 'Tenant Email',
      phoneField: 'Tenant Phone',
      dateFields: ['Lease Start', 'Lease End', 'Renewal Date', 'Notice Date']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, lease, {
      idField: ID_FIELD,
      idPrefix: 'LS'
    });

    updateRentalOccupancy_(created);
    createRenewalTask_(created);
    REOS.Logger.audit('Lease created', { leaseId: created[ID_FIELD], rentalId: created['Rental ID'] });
    return created;
  }

  function update(leaseId, changes) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();

    const current = get(leaseId);
    if (!current) throw new Error('Lease not found: ' + leaseId);
    const merged = prepare_(Object.assign({}, current, changes || {}));
    const updated = REOS.Database.update(SHEET, ID_FIELD, leaseId, merged);
    REOS.Logger.audit('Lease updated', { leaseId: leaseId });
    return updated;
  }

  function get(leaseId) {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.findById(SHEET, ID_FIELD, leaseId);
  }

  function listActive() {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (lease) {
      return lease.Active !== false && String(lease.Status || '').toLowerCase() === 'active';
    });
  }

  function expiringWithin(days) {
    days = Number(days || 90);
    return listActive().filter(function (lease) {
      const remaining = Number(lease['Days Until Expiration']);
      return !isNaN(remaining) && remaining <= days;
    });
  }

  function prepare_(lease) {
    lease['Tenant Email'] = REOS.normalizeEmail_(lease['Tenant Email']);
    lease['Tenant Phone'] = REOS.normalizePhone_(lease['Tenant Phone']);
    lease['Days Until Expiration'] = daysUntil_(lease['Lease End']);
    if (!lease['Renewal Date'] && lease['Lease End']) {
      const renewal = toDate_(lease['Lease End']);
      if (renewal) {
        renewal.setDate(renewal.getDate() - 90);
        lease['Renewal Date'] = renewal;
      }
    }
    if (!lease['Notice Date'] && lease['Lease End']) {
      const notice = toDate_(lease['Lease End']);
      if (notice) {
        notice.setDate(notice.getDate() - 60);
        lease['Notice Date'] = notice;
      }
    }
    return lease;
  }

  function updateRentalOccupancy_(lease) {
    try {
      REOS.Rentals.update(lease['Rental ID'], {
        'Occupancy Status': 'Occupied',
        'Current Tenant ID': lease['Tenant Name'],
        'Lease ID': lease[ID_FIELD],
        'Monthly Rent': lease['Monthly Rent']
      });
    } catch (error) {
      REOS.Logger.warn('Unable to update rental occupancy', { leaseId: lease[ID_FIELD], error: error.message });
    }
  }

  function createRenewalTask_(lease) {
    try {
      if (!lease['Renewal Date']) return;
      REOS.Tasks.create({
        Task: 'Lease renewal review - ' + lease['Tenant Name'],
        Category: 'Rental',
        Priority: 'High',
        'Due Date': lease['Renewal Date'],
        Notes: 'Lease ID: ' + lease[ID_FIELD] + ' | Rental ID: ' + lease['Rental ID']
      });
    } catch (error) {
      REOS.Logger.warn('Unable to create lease renewal task', { leaseId: lease[ID_FIELD], error: error.message });
    }
  }

  function toDate_(value) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function daysUntil_(value) {
    const date = toDate_(value);
    if (!date) return '';
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.ceil((startDate.getTime() - startToday.getTime()) / 86400000);
  }

  return {
    ensureSheet: ensureSheet,
    create: create,
    update: update,
    get: get,
    listActive: listActive,
    expiringWithin: expiringWithin
  };
})();

function leasesCreate(lease) {
  return REOS.Leases.create(lease);
}

function leasesExpiring(days) {
  return REOS.Leases.expiringWithin(days);
}
