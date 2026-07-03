/**
 * REOS Enterprise v3.0 - Maintenance Framework
 *
 * Tracks rental maintenance work orders, vendors, priorities, costs, and completion.
 */

var REOS = REOS || {};

REOS.Maintenance = (function () {
  const SHEET = 'MAINTENANCE';
  const ID_FIELD = 'Work Order ID';

  const HEADERS = [
    'Work Order ID', 'Rental ID', 'Property ID', 'Reported Date', 'Issue',
    'Priority', 'Assigned Vendor', 'Estimated Cost', 'Actual Cost', 'Status',
    'Completed Date', 'Tenant Reported', 'Notes', 'Active', 'Created At', 'Updated At'
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

  function create(workOrder) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();

    workOrder = workOrder || {};
    workOrder['Reported Date'] = workOrder['Reported Date'] || new Date();
    workOrder.Priority = workOrder.Priority || 'Medium';
    workOrder.Status = workOrder.Status || 'Open';
    workOrder.Active = workOrder.Active === false ? false : true;

    const validation = REOS.Validation.validateRecord(workOrder, {
      required: ['Rental ID', 'Issue'],
      dateFields: ['Reported Date', 'Completed Date']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(SHEET, workOrder, {
      idField: ID_FIELD,
      idPrefix: 'WO'
    });

    createTask_(created);
    REOS.Logger.audit('Maintenance work order created', { workOrderId: created[ID_FIELD], rentalId: created['Rental ID'] });
    return created;
  }

  function update(workOrderId, changes) {
    REOS.Security.requirePermission('transactions:write');
    ensureSheet();
    const updated = REOS.Database.update(SHEET, ID_FIELD, workOrderId, changes || {});
    REOS.Logger.audit('Maintenance work order updated', { workOrderId: workOrderId });
    return updated;
  }

  function complete(workOrderId, actualCost, notes) {
    return update(workOrderId, {
      Status: 'Completed',
      'Completed Date': new Date(),
      'Actual Cost': actualCost || '',
      Notes: notes || ''
    });
  }

  function listOpen() {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (wo) {
      return wo.Active !== false && String(wo.Status || '').toLowerCase() !== 'completed';
    });
  }

  function listForRental(rentalId) {
    REOS.Security.requirePermission('transactions:read');
    ensureSheet();
    return REOS.Database.query(SHEET, function (wo) {
      return String(wo['Rental ID'] || '') === String(rentalId || '');
    });
  }

  function createTask_(workOrder) {
    try {
      REOS.Tasks.create({
        Task: 'Maintenance: ' + workOrder.Issue,
        Category: 'Rental',
        Priority: workOrder.Priority || 'Medium',
        'Due Date': workOrder['Reported Date'] || new Date(),
        Notes: 'Work Order ID: ' + workOrder[ID_FIELD] + ' | Rental ID: ' + workOrder['Rental ID']
      });
    } catch (error) {
      REOS.Logger.warn('Unable to create maintenance task', { workOrderId: workOrder[ID_FIELD], error: error.message });
    }
  }

  return {
    ensureSheet: ensureSheet,
    create: create,
    update: update,
    complete: complete,
    listOpen: listOpen,
    listForRental: listForRental
  };
})();

function maintenanceCreate(workOrder) {
  return REOS.Maintenance.create(workOrder);
}

function maintenanceOpen() {
  return REOS.Maintenance.listOpen();
}
