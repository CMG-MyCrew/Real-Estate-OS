/**
 * REOS Enterprise v3.0 - Vendor Management Module Foundation
 *
 * Handles vendor registry, work orders, assignments, status updates,
 * search, and dashboard KPIs for property preservation and field services.
 */

var REOS = REOS || {};

REOS.Vendors = (function () {
  const VENDOR_SHEET = 'VENDORS';
  const WORK_ORDER_SHEET = 'WORK_ORDERS';
  const VENDOR_ID = 'Vendor ID';
  const WORK_ORDER_ID = 'Work Order ID';

  const VENDOR_HEADERS = [
    'Vendor ID', 'Company', 'Contact Name', 'Email', 'Phone', 'Service Category',
    'Coverage Area', 'Insurance Expiration', 'W9 On File', 'Status', 'Rating',
    'Notes', 'Active', 'Created At', 'Updated At'
  ];

  const WORK_ORDER_HEADERS = [
    'Work Order ID', 'Vendor ID', 'Vendor Name', 'Related Type', 'Related ID',
    'Property Address', 'City', 'State', 'Zip', 'Service Category', 'Title',
    'Description', 'Priority', 'Status', 'Scheduled Date', 'Due Date',
    'Completed Date', 'Estimated Cost', 'Actual Cost', 'Assigned To', 'Notes',
    'Active', 'Created At', 'Updated At'
  ];

  const SERVICE_CATEGORIES = [
    'Property Preservation',
    'Commercial Cleaning',
    'Trash Out',
    'Lawn Care',
    'Lock Change',
    'Board Up',
    'Winterization',
    'Inspection',
    'Repairs',
    'Photography',
    'Janitorial',
    'Debris Removal'
  ];

  const WORK_ORDER_STATUSES = ['New', 'Assigned', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold'];

  function initialize() {
    ensureSheets();
    registerRoutes_();
    REOS.Logger.info('Vendor module initialized', {});
    return { ok: true, module: 'vendors' };
  }

  function ensureSheets() {
    ensureTable_(VENDOR_SHEET, VENDOR_HEADERS);
    ensureTable_(WORK_ORDER_SHEET, WORK_ORDER_HEADERS);
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
      sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 1), headers.length).createFilter();
    }
    return sheet;
  }

  function registerRoutes_() {
    if (!REOS.Router) return;

    REOS.Router.registerModule({
      key: 'vendors',
      name: 'Vendors',
      description: 'Vendor registry, preservation contractors, and work orders.',
      permission: 'vendors:read',
      order: 40,
      routes: [
        { key: 'vendors.open', name: 'Open Vendors', permission: 'vendors:read', handler: function () { return dashboard(); } },
        { key: 'vendors.list', name: 'List Vendors', permission: 'vendors:read', handler: function (payload) { return listVendors(payload || {}); } },
        { key: 'vendors.create', name: 'Create Vendor', permission: 'vendors:write', handler: function (payload) { return createVendor(payload || {}); } },
        { key: 'workorders.list', name: 'List Work Orders', permission: 'workorders:read', handler: function (payload) { return listWorkOrders(payload || {}); } },
        { key: 'workorders.create', name: 'Create Work Order', permission: 'workorders:write', handler: function (payload) { return createWorkOrder(payload || {}); } }
      ]
    });
  }

  function normalizeVendor_(vendor) {
    vendor = vendor || {};
    vendor.Email = REOS.normalizeEmail_(vendor.Email);
    vendor.Phone = REOS.normalizePhone_(vendor.Phone);
    vendor.Status = vendor.Status || 'Active';
    vendor.Active = vendor.Active === false ? false : true;
    return vendor;
  }

  function createVendor(vendor) {
    REOS.Security.requirePermission('vendors:write');
    ensureSheets();
    vendor = normalizeVendor_(vendor);

    const validation = REOS.Validation.validateRecord(vendor, {
      required: ['Company', 'Contact Name', 'Service Category'],
      emailField: 'Email',
      phoneField: 'Phone',
      allowedValues: [{ field: 'Service Category', values: SERVICE_CATEGORIES, required: true }],
      numberFields: [{ field: 'Rating', min: 0, max: 5 }]
    });
    REOS.Validation.throwIfInvalid(validation);

    if (vendor.Email) {
      const duplicate = REOS.Validation.findDuplicate(VENDOR_SHEET, 'Email', vendor.Email);
      if (duplicate) throw new Error('Duplicate vendor email: ' + vendor.Email);
    }

    const created = REOS.Database.insert(VENDOR_SHEET, vendor, { idField: VENDOR_ID, idPrefix: 'V' });
    REOS.Logger.audit('Vendor created', { vendorId: created[VENDOR_ID], company: created.Company });
    logActivity_('Vendor', created[VENDOR_ID], 'Created', 'Vendor created', created.Company || '');
    return created;
  }

  function updateVendor(vendorId, changes) {
    REOS.Security.requirePermission('vendors:write');
    ensureSheets();
    const existing = getVendor(vendorId);
    if (!existing) throw new Error('Vendor not found: ' + vendorId);
    changes = normalizeVendor_(changes || {});

    if (changes.Email) {
      const duplicate = REOS.Validation.findDuplicate(VENDOR_SHEET, 'Email', changes.Email, VENDOR_ID, vendorId);
      if (duplicate) throw new Error('Duplicate vendor email: ' + changes.Email);
    }

    const updated = REOS.Database.update(VENDOR_SHEET, VENDOR_ID, vendorId, changes);
    REOS.Logger.audit('Vendor updated', { vendorId: vendorId });
    logActivity_('Vendor', vendorId, 'Updated', 'Vendor updated', REOS.toJson_(changes));
    return updated;
  }

  function getVendor(vendorId) {
    REOS.Security.requirePermission('vendors:read');
    ensureSheets();
    return REOS.Database.findById(VENDOR_SHEET, VENDOR_ID, vendorId);
  }

  function listVendors(options) {
    REOS.Security.requirePermission('vendors:read');
    ensureSheets();
    options = options || {};
    let vendors = REOS.Database.getAll(VENDOR_SHEET);
    if (options.activeOnly !== false) vendors = vendors.filter(function (vendor) { return vendor.Active !== false; });
    if (options.status) vendors = vendors.filter(function (vendor) { return String(vendor.Status || '') === String(options.status); });
    if (options.serviceCategory) vendors = vendors.filter(function (vendor) { return String(vendor['Service Category'] || '') === String(options.serviceCategory); });
    return vendors.slice(0, options.limit || 100);
  }

  function searchVendors(query) {
    REOS.Security.requirePermission('vendors:read');
    const q = String(query || '').trim().toLowerCase();
    if (!q) return listVendors({ limit: 50 });
    return listVendors({ limit: 500 }).filter(function (vendor) {
      return [vendor[VENDOR_ID], vendor.Company, vendor['Contact Name'], vendor.Email, vendor.Phone, vendor['Service Category'], vendor['Coverage Area'], vendor.Status, vendor.Notes]
        .join(' ').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 50);
  }

  function deactivateVendor(vendorId) {
    REOS.Security.requirePermission('vendors:write');
    const updated = REOS.Database.update(VENDOR_SHEET, VENDOR_ID, vendorId, { Status: 'Inactive', Active: false });
    logActivity_('Vendor', vendorId, 'Deactivated', 'Vendor deactivated', '');
    return updated;
  }

  function normalizeWorkOrder_(workOrder) {
    workOrder = workOrder || {};
    workOrder.Status = workOrder.Status || 'New';
    workOrder.Priority = workOrder.Priority || 'Medium';
    workOrder.Active = workOrder.Active === false ? false : true;
    workOrder['Assigned To'] = workOrder['Assigned To'] || REOS.Security.getCurrentUserEmail();
    return workOrder;
  }

  function createWorkOrder(workOrder) {
    REOS.Security.requirePermission('workorders:write');
    ensureSheets();
    workOrder = normalizeWorkOrder_(workOrder);

    if (workOrder[VENDOR_ID]) {
      const vendor = getVendor(workOrder[VENDOR_ID]);
      if (!vendor) throw new Error('Vendor not found: ' + workOrder[VENDOR_ID]);
      workOrder['Vendor Name'] = vendor.Company;
    }

    const validation = REOS.Validation.validateRecord(workOrder, {
      required: ['Title', 'Service Category', 'Property Address', 'Status'],
      allowedValues: [
        { field: 'Service Category', values: SERVICE_CATEGORIES, required: true },
        { field: 'Status', values: WORK_ORDER_STATUSES, required: true },
        { field: 'Priority', values: ['Critical', 'High', 'Medium', 'Low'], required: false }
      ],
      dateFields: ['Scheduled Date', 'Due Date', 'Completed Date'],
      numberFields: [{ field: 'Estimated Cost', min: 0 }, { field: 'Actual Cost', min: 0 }]
    });
    REOS.Validation.throwIfInvalid(validation);

    const created = REOS.Database.insert(WORK_ORDER_SHEET, workOrder, { idField: WORK_ORDER_ID, idPrefix: 'WO' });
    REOS.Logger.audit('Work order created', { workOrderId: created[WORK_ORDER_ID], vendorId: created[VENDOR_ID] });
    logActivity_('Work Order', created[WORK_ORDER_ID], 'Created', created.Title, created.Description || '');
    return created;
  }

  function updateWorkOrder(workOrderId, changes) {
    REOS.Security.requirePermission('workorders:write');
    ensureSheets();
    const existing = getWorkOrder(workOrderId);
    if (!existing) throw new Error('Work order not found: ' + workOrderId);
    const updated = REOS.Database.update(WORK_ORDER_SHEET, WORK_ORDER_ID, workOrderId, normalizeWorkOrder_(changes || {}));
    logActivity_('Work Order', workOrderId, 'Updated', 'Work order updated', REOS.toJson_(changes || {}));
    return updated;
  }

  function assignWorkOrder(workOrderId, vendorId) {
    REOS.Security.requirePermission('workorders:write');
    const vendor = getVendor(vendorId);
    if (!vendor) throw new Error('Vendor not found: ' + vendorId);
    const updated = REOS.Database.update(WORK_ORDER_SHEET, WORK_ORDER_ID, workOrderId, {
      'Vendor ID': vendorId,
      'Vendor Name': vendor.Company,
      Status: 'Assigned'
    });
    logActivity_('Work Order', workOrderId, 'Assigned', 'Assigned to ' + vendor.Company, '');
    return updated;
  }

  function updateWorkOrderStatus(workOrderId, status, notes) {
    REOS.Security.requirePermission('workorders:write');
    const validation = REOS.Validation.validateAllowedValue(status, 'Status', WORK_ORDER_STATUSES, true);
    REOS.Validation.throwIfInvalid(validation);
    const changes = { Status: status, Notes: notes || '' };
    if (status === 'Completed') changes['Completed Date'] = new Date();
    const updated = REOS.Database.update(WORK_ORDER_SHEET, WORK_ORDER_ID, workOrderId, changes);
    logActivity_('Work Order', workOrderId, 'Status Change', 'Moved to ' + status, notes || '');
    return updated;
  }

  function getWorkOrder(workOrderId) {
    REOS.Security.requirePermission('workorders:read');
    ensureSheets();
    return REOS.Database.findById(WORK_ORDER_SHEET, WORK_ORDER_ID, workOrderId);
  }

  function listWorkOrders(options) {
    REOS.Security.requirePermission('workorders:read');
    ensureSheets();
    options = options || {};
    let orders = REOS.Database.getAll(WORK_ORDER_SHEET);
    if (options.activeOnly !== false) orders = orders.filter(function (order) { return order.Active !== false; });
    if (options.status) orders = orders.filter(function (order) { return String(order.Status || '') === String(options.status); });
    if (options.vendorId) orders = orders.filter(function (order) { return String(order[VENDOR_ID] || '') === String(options.vendorId); });
    return orders.slice(0, options.limit || 100);
  }

  function searchWorkOrders(query) {
    REOS.Security.requirePermission('workorders:read');
    const q = String(query || '').trim().toLowerCase();
    if (!q) return listWorkOrders({ limit: 50 });
    return listWorkOrders({ limit: 500 }).filter(function (order) {
      return [order[WORK_ORDER_ID], order[VENDOR_ID], order['Vendor Name'], order['Property Address'], order.City, order.State, order['Service Category'], order.Title, order.Status, order.Priority, order.Notes]
        .join(' ').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 50);
  }

  function dashboard() {
    REOS.Security.requirePermission('vendors:read');
    const vendors = listVendors({ limit: 1000 });
    const orders = listWorkOrders({ limit: 1000 });
    const openOrders = orders.filter(function (order) { return ['Completed', 'Cancelled'].indexOf(String(order.Status || '')) === -1; });
    const overdueOrders = openOrders.filter(function (order) {
      if (!order['Due Date']) return false;
      const due = new Date(order['Due Date']);
      return !isNaN(due.getTime()) && due < new Date();
    });

    return {
      ok: true,
      vendors: vendors.length,
      activeVendors: vendors.filter(function (vendor) { return vendor.Active !== false && String(vendor.Status || '') === 'Active'; }).length,
      workOrders: orders.length,
      openWorkOrders: openOrders.length,
      overdueWorkOrders: overdueOrders.length,
      byServiceCategory: groupCount_(vendors, 'Service Category'),
      workOrdersByStatus: groupCount_(orders, 'Status'),
      serviceCategories: SERVICE_CATEGORIES,
      workOrderStatuses: WORK_ORDER_STATUSES
    };
  }

  function groupCount_(records, field) {
    return (records || []).reduce(function (map, record) {
      const key = String(record[field] || 'Unknown');
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
  }

  function logActivity_(relatedType, relatedId, activityType, subject, notes) {
    if (REOS.CRM && typeof REOS.CRM.logActivity === 'function') {
      return REOS.CRM.logActivity(relatedType, relatedId, activityType, subject, notes || '');
    }
    return null;
  }

  return {
    VENDOR_SHEET: VENDOR_SHEET,
    WORK_ORDER_SHEET: WORK_ORDER_SHEET,
    SERVICE_CATEGORIES: SERVICE_CATEGORIES,
    WORK_ORDER_STATUSES: WORK_ORDER_STATUSES,
    initialize: initialize,
    ensureSheets: ensureSheets,
    createVendor: createVendor,
    updateVendor: updateVendor,
    getVendor: getVendor,
    listVendors: listVendors,
    searchVendors: searchVendors,
    deactivateVendor: deactivateVendor,
    createWorkOrder: createWorkOrder,
    updateWorkOrder: updateWorkOrder,
    assignWorkOrder: assignWorkOrder,
    updateWorkOrderStatus: updateWorkOrderStatus,
    getWorkOrder: getWorkOrder,
    listWorkOrders: listWorkOrders,
    searchWorkOrders: searchWorkOrders,
    dashboard: dashboard
  };
})();

function reosInitializeVendors() { return REOS.Vendors.initialize(); }
function showVendors() {
  const html = HtmlService.createHtmlOutputFromFile('VendorsUI').setWidth(1200).setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Vendors');
}
function vendorsDashboard() { return REOS.Vendors.dashboard(); }
function vendorsCreateVendor(vendor) { return REOS.Vendors.createVendor(vendor || {}); }
function vendorsSearchVendors(query) { return REOS.Vendors.searchVendors(query || ''); }
function vendorsCreateWorkOrder(workOrder) { return REOS.Vendors.createWorkOrder(workOrder || {}); }
function vendorsSearchWorkOrders(query) { return REOS.Vendors.searchWorkOrders(query || ''); }
function vendorsAssignWorkOrder(workOrderId, vendorId) { return REOS.Vendors.assignWorkOrder(workOrderId, vendorId); }
function vendorsUpdateWorkOrderStatus(workOrderId, status, notes) { return REOS.Vendors.updateWorkOrderStatus(workOrderId, status, notes || ''); }
