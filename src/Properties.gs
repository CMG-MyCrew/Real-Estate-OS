/**
 * REOS Enterprise v3.0 - Property Management Module Foundation
 *
 * Handles property/assets, units, inspections, maintenance requests,
 * occupancy tracking, search, and dashboard KPIs.
 */

var REOS = REOS || {};

REOS.Properties = (function () {
  const PROPERTY_SHEET = 'PROPERTIES';
  const UNIT_SHEET = 'UNITS';
  const INSPECTION_SHEET = 'INSPECTIONS';
  const MAINTENANCE_SHEET = 'MAINTENANCE_REQUESTS';

  const PROPERTY_ID = 'Property ID';
  const UNIT_ID = 'Unit ID';
  const INSPECTION_ID = 'Inspection ID';
  const MAINTENANCE_ID = 'Maintenance ID';

  const PROPERTY_HEADERS = [
    'Property ID', 'Property Name', 'Property Type', 'Address', 'City', 'State', 'Zip',
    'Acquisition Lead ID', 'Owner Entity', 'Status', 'Occupancy Status', 'Bedrooms', 'Bathrooms',
    'Square Feet', 'Estimated Value', 'Mortgage Balance', 'Monthly Rent', 'Notes', 'Active',
    'Created At', 'Updated At'
  ];

  const UNIT_HEADERS = [
    'Unit ID', 'Property ID', 'Unit Name', 'Unit Type', 'Status', 'Tenant Name', 'Tenant Email',
    'Tenant Phone', 'Lease Start', 'Lease End', 'Monthly Rent', 'Deposit', 'Notes', 'Active',
    'Created At', 'Updated At'
  ];

  const INSPECTION_HEADERS = [
    'Inspection ID', 'Property ID', 'Unit ID', 'Inspection Type', 'Status', 'Scheduled Date',
    'Completed Date', 'Inspector', 'Score', 'Findings', 'Photos Link', 'Next Inspection Date',
    'Notes', 'Active', 'Created At', 'Updated At'
  ];

  const MAINTENANCE_HEADERS = [
    'Maintenance ID', 'Property ID', 'Unit ID', 'Work Order ID', 'Title', 'Description',
    'Category', 'Priority', 'Status', 'Reported By', 'Assigned To', 'Vendor ID', 'Due Date',
    'Completed Date', 'Estimated Cost', 'Actual Cost', 'Notes', 'Active', 'Created At', 'Updated At'
  ];

  const PROPERTY_TYPES = ['Single Family', 'Duplex', 'Triplex', 'Fourplex', 'Condo', 'Townhome', 'Multifamily', 'Commercial', 'Land', 'Other'];
  const PROPERTY_STATUSES = ['Prospect', 'Owned', 'Under Rehab', 'Available', 'Occupied', 'Listed', 'Sold', 'Archived'];
  const OCCUPANCY_STATUSES = ['Vacant', 'Occupied', 'Partially Occupied', 'Unknown'];
  const MAINTENANCE_STATUSES = ['New', 'Assigned', 'Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold'];
  const INSPECTION_STATUSES = ['Scheduled', 'Completed', 'Cancelled', 'Needs Follow-up'];

  function initialize() {
    ensureSheets();
    registerRoutes_();
    REOS.Logger.info('Property management module initialized', {});
    return { ok: true, module: 'properties' };
  }

  function ensureSheets() {
    ensureTable_(PROPERTY_SHEET, PROPERTY_HEADERS);
    ensureTable_(UNIT_SHEET, UNIT_HEADERS);
    ensureTable_(INSPECTION_SHEET, INSPECTION_HEADERS);
    ensureTable_(MAINTENANCE_SHEET, MAINTENANCE_HEADERS);
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
    return sheet;
  }

  function registerRoutes_() {
    if (!REOS.Router) return;
    REOS.Router.registerModule({
      key: 'properties',
      name: 'Properties',
      description: 'Assets, units, inspections, maintenance, and occupancy.',
      permission: 'properties:read',
      order: 50,
      routes: [
        { key: 'properties.open', name: 'Open Properties', permission: 'properties:read', handler: function () { return dashboard(); } },
        { key: 'properties.list', name: 'List Properties', permission: 'properties:read', handler: function (payload) { return listProperties(payload || {}); } },
        { key: 'properties.create', name: 'Create Property', permission: 'properties:write', handler: function (payload) { return createProperty(payload || {}); } },
        { key: 'maintenance.list', name: 'List Maintenance', permission: 'maintenance:read', handler: function (payload) { return listMaintenance(payload || {}); } },
        { key: 'maintenance.create', name: 'Create Maintenance', permission: 'maintenance:write', handler: function (payload) { return createMaintenanceRequest(payload || {}); } }
      ]
    });
  }

  function createProperty(property) {
    REOS.Security.requirePermission('properties:write');
    ensureSheets();
    property = normalizeProperty_(property || {});
    REOS.Validation.throwIfInvalid(REOS.Validation.validateRecord(property, {
      required: ['Address', 'City', 'State', 'Property Type', 'Status'],
      allowedValues: [
        { field: 'Property Type', values: PROPERTY_TYPES, required: true },
        { field: 'Status', values: PROPERTY_STATUSES, required: true },
        { field: 'Occupancy Status', values: OCCUPANCY_STATUSES, required: false }
      ],
      numberFields: [
        { field: 'Bedrooms', min: 0 }, { field: 'Bathrooms', min: 0 }, { field: 'Square Feet', min: 0 },
        { field: 'Estimated Value', min: 0 }, { field: 'Mortgage Balance', min: 0 }, { field: 'Monthly Rent', min: 0 }
      ]
    }));

    const duplicate = findPropertyByAddress_(property.Address, property.City, property.State, property.Zip);
    if (duplicate) throw new Error('Duplicate property address: ' + property.Address);

    const created = REOS.Database.insert(PROPERTY_SHEET, property, { idField: PROPERTY_ID, idPrefix: 'P' });
    logActivity_('Property', created[PROPERTY_ID], 'Created', 'Property created', created.Address || '');
    REOS.Logger.audit('Property created', { propertyId: created[PROPERTY_ID], address: created.Address });
    return created;
  }

  function updateProperty(propertyId, changes) {
    REOS.Security.requirePermission('properties:write');
    ensureSheets();
    const existing = getProperty(propertyId);
    if (!existing) throw new Error('Property not found: ' + propertyId);
    const updated = REOS.Database.update(PROPERTY_SHEET, PROPERTY_ID, propertyId, normalizeProperty_(changes || {}));
    logActivity_('Property', propertyId, 'Updated', 'Property updated', REOS.toJson_(changes || {}));
    return updated;
  }

  function getProperty(propertyId) {
    REOS.Security.requirePermission('properties:read');
    ensureSheets();
    return REOS.Database.findById(PROPERTY_SHEET, PROPERTY_ID, propertyId);
  }

  function listProperties(options) {
    REOS.Security.requirePermission('properties:read');
    ensureSheets();
    options = options || {};
    let records = REOS.Database.getAll(PROPERTY_SHEET);
    if (options.activeOnly !== false) records = records.filter(function (record) { return record.Active !== false; });
    if (options.status) records = records.filter(function (record) { return String(record.Status || '') === String(options.status); });
    if (options.occupancyStatus) records = records.filter(function (record) { return String(record['Occupancy Status'] || '') === String(options.occupancyStatus); });
    return records.slice(0, options.limit || 100);
  }

  function searchProperties(query) {
    REOS.Security.requirePermission('properties:read');
    const q = String(query || '').trim().toLowerCase();
    if (!q) return listProperties({ limit: 50 });
    return listProperties({ limit: 500 }).filter(function (record) {
      return [record[PROPERTY_ID], record['Property Name'], record['Property Type'], record.Address, record.City, record.State, record.Zip, record.Status, record['Occupancy Status'], record.Notes]
        .join(' ').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 50);
  }

  function createUnit(unit) {
    REOS.Security.requirePermission('properties:write');
    ensureSheets();
    unit = normalizeUnit_(unit || {});
    if (!getProperty(unit[PROPERTY_ID])) throw new Error('Property not found: ' + unit[PROPERTY_ID]);
    REOS.Validation.throwIfInvalid(REOS.Validation.validateRecord(unit, {
      required: ['Property ID', 'Unit Name', 'Status'],
      emailField: 'Tenant Email',
      phoneField: 'Tenant Phone',
      dateFields: ['Lease Start', 'Lease End'],
      numberFields: [{ field: 'Monthly Rent', min: 0 }, { field: 'Deposit', min: 0 }]
    }));
    const created = REOS.Database.insert(UNIT_SHEET, unit, { idField: UNIT_ID, idPrefix: 'U' });
    logActivity_('Property', created[PROPERTY_ID], 'Unit Created', 'Unit created: ' + created['Unit Name'], '');
    return created;
  }

  function listUnits(propertyId) {
    REOS.Security.requirePermission('properties:read');
    ensureSheets();
    return REOS.Database.getAll(UNIT_SHEET).filter(function (unit) {
      return unit.Active !== false && (!propertyId || String(unit[PROPERTY_ID] || '') === String(propertyId));
    });
  }

  function createInspection(inspection) {
    REOS.Security.requirePermission('inspections:write');
    ensureSheets();
    inspection = normalizeInspection_(inspection || {});
    if (!getProperty(inspection[PROPERTY_ID])) throw new Error('Property not found: ' + inspection[PROPERTY_ID]);
    REOS.Validation.throwIfInvalid(REOS.Validation.validateRecord(inspection, {
      required: ['Property ID', 'Inspection Type', 'Status', 'Scheduled Date'],
      allowedValues: [{ field: 'Status', values: INSPECTION_STATUSES, required: true }],
      dateFields: ['Scheduled Date', 'Completed Date', 'Next Inspection Date'],
      numberFields: [{ field: 'Score', min: 0, max: 100 }]
    }));
    const created = REOS.Database.insert(INSPECTION_SHEET, inspection, { idField: INSPECTION_ID, idPrefix: 'INSP' });
    logActivity_('Property', created[PROPERTY_ID], 'Inspection Created', created['Inspection Type'], created.Notes || '');
    return created;
  }

  function listInspections(options) {
    REOS.Security.requirePermission('inspections:read');
    ensureSheets();
    options = options || {};
    let records = REOS.Database.getAll(INSPECTION_SHEET);
    if (options.propertyId) records = records.filter(function (record) { return String(record[PROPERTY_ID] || '') === String(options.propertyId); });
    if (options.status) records = records.filter(function (record) { return String(record.Status || '') === String(options.status); });
    return records.slice(0, options.limit || 100);
  }

  function createMaintenanceRequest(request) {
    REOS.Security.requirePermission('maintenance:write');
    ensureSheets();
    request = normalizeMaintenance_(request || {});
    if (!getProperty(request[PROPERTY_ID])) throw new Error('Property not found: ' + request[PROPERTY_ID]);
    REOS.Validation.throwIfInvalid(REOS.Validation.validateRecord(request, {
      required: ['Property ID', 'Title', 'Category', 'Priority', 'Status'],
      allowedValues: [
        { field: 'Priority', values: ['Critical', 'High', 'Medium', 'Low'], required: true },
        { field: 'Status', values: MAINTENANCE_STATUSES, required: true }
      ],
      dateFields: ['Due Date', 'Completed Date'],
      numberFields: [{ field: 'Estimated Cost', min: 0 }, { field: 'Actual Cost', min: 0 }]
    }));

    const created = REOS.Database.insert(MAINTENANCE_SHEET, request, { idField: MAINTENANCE_ID, idPrefix: 'MR' });
    logActivity_('Property', created[PROPERTY_ID], 'Maintenance Created', created.Title, created.Description || '');
    maybeCreateVendorWorkOrder_(created);
    return created;
  }

  function updateMaintenanceStatus(maintenanceId, status, notes) {
    REOS.Security.requirePermission('maintenance:write');
    REOS.Validation.throwIfInvalid(REOS.Validation.validateAllowedValue(status, 'Status', MAINTENANCE_STATUSES, true));
    const changes = { Status: status, Notes: notes || '' };
    if (status === 'Completed') changes['Completed Date'] = new Date();
    const updated = REOS.Database.update(MAINTENANCE_SHEET, MAINTENANCE_ID, maintenanceId, changes);
    logActivity_('Maintenance', maintenanceId, 'Status Change', 'Moved to ' + status, notes || '');
    return updated;
  }

  function listMaintenance(options) {
    REOS.Security.requirePermission('maintenance:read');
    ensureSheets();
    options = options || {};
    let records = REOS.Database.getAll(MAINTENANCE_SHEET);
    if (options.activeOnly !== false) records = records.filter(function (record) { return record.Active !== false; });
    if (options.propertyId) records = records.filter(function (record) { return String(record[PROPERTY_ID] || '') === String(options.propertyId); });
    if (options.status) records = records.filter(function (record) { return String(record.Status || '') === String(options.status); });
    return records.slice(0, options.limit || 100);
  }

  function searchMaintenance(query) {
    REOS.Security.requirePermission('maintenance:read');
    const q = String(query || '').trim().toLowerCase();
    if (!q) return listMaintenance({ limit: 50 });
    return listMaintenance({ limit: 500 }).filter(function (record) {
      return [record[MAINTENANCE_ID], record[PROPERTY_ID], record.Title, record.Description, record.Category, record.Priority, record.Status, record['Vendor ID'], record.Notes]
        .join(' ').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 50);
  }

  function dashboard() {
    REOS.Security.requirePermission('properties:read');
    const properties = listProperties({ limit: 1000 });
    const units = listUnits();
    const maintenance = listMaintenance({ limit: 1000 });
    const inspections = REOS.Security.hasPermission('inspections:read') ? listInspections({ limit: 1000 }) : [];
    const openMaintenance = maintenance.filter(function (item) { return ['Completed', 'Cancelled'].indexOf(String(item.Status || '')) === -1; });
    const overdueMaintenance = openMaintenance.filter(function (item) {
      if (!item['Due Date']) return false;
      const due = new Date(item['Due Date']);
      return !isNaN(due.getTime()) && due < new Date();
    });

    return {
      ok: true,
      properties: properties.length,
      occupied: properties.filter(function (p) { return p['Occupancy Status'] === 'Occupied'; }).length,
      vacant: properties.filter(function (p) { return p['Occupancy Status'] === 'Vacant'; }).length,
      units: units.length,
      openMaintenance: openMaintenance.length,
      overdueMaintenance: overdueMaintenance.length,
      inspections: inspections.length,
      byStatus: groupCount_(properties, 'Status'),
      byOccupancy: groupCount_(properties, 'Occupancy Status'),
      maintenanceByStatus: groupCount_(maintenance, 'Status'),
      propertyTypes: PROPERTY_TYPES,
      propertyStatuses: PROPERTY_STATUSES,
      occupancyStatuses: OCCUPANCY_STATUSES
    };
  }

  function normalizeProperty_(property) {
    property.Status = property.Status || 'Prospect';
    property['Occupancy Status'] = property['Occupancy Status'] || 'Unknown';
    property.Active = property.Active === false ? false : true;
    return property;
  }

  function normalizeUnit_(unit) {
    unit.Status = unit.Status || 'Vacant';
    unit['Tenant Email'] = REOS.normalizeEmail_(unit['Tenant Email']);
    unit['Tenant Phone'] = REOS.normalizePhone_(unit['Tenant Phone']);
    unit.Active = unit.Active === false ? false : true;
    return unit;
  }

  function normalizeInspection_(inspection) {
    inspection.Status = inspection.Status || 'Scheduled';
    inspection.Active = inspection.Active === false ? false : true;
    return inspection;
  }

  function normalizeMaintenance_(request) {
    request.Status = request.Status || 'New';
    request.Priority = request.Priority || 'Medium';
    request['Reported By'] = request['Reported By'] || REOS.Security.getCurrentUserEmail();
    request.Active = request.Active === false ? false : true;
    return request;
  }

  function findPropertyByAddress_(address, city, state, zip) {
    const key = [address, city, state, zip].join('|').toLowerCase();
    return REOS.Database.getAll(PROPERTY_SHEET).find(function (record) {
      return [record.Address, record.City, record.State, record.Zip].join('|').toLowerCase() === key;
    }) || null;
  }

  function maybeCreateVendorWorkOrder_(request) {
    if (!request['Vendor ID'] || !REOS.Vendors || typeof REOS.Vendors.createWorkOrder !== 'function') return null;
    const property = getProperty(request[PROPERTY_ID]);
    return REOS.Vendors.createWorkOrder({
      'Vendor ID': request['Vendor ID'],
      'Related Type': 'Maintenance',
      'Related ID': request[MAINTENANCE_ID],
      'Property Address': property.Address,
      City: property.City,
      State: property.State,
      Zip: property.Zip,
      'Service Category': request.Category,
      Title: request.Title,
      Description: request.Description,
      Priority: request.Priority,
      Status: 'New',
      'Due Date': request['Due Date'],
      'Estimated Cost': request['Estimated Cost'],
      Notes: 'Created from maintenance request ' + request[MAINTENANCE_ID]
    });
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
    PROPERTY_SHEET: PROPERTY_SHEET,
    UNIT_SHEET: UNIT_SHEET,
    INSPECTION_SHEET: INSPECTION_SHEET,
    MAINTENANCE_SHEET: MAINTENANCE_SHEET,
    PROPERTY_TYPES: PROPERTY_TYPES,
    PROPERTY_STATUSES: PROPERTY_STATUSES,
    OCCUPANCY_STATUSES: OCCUPANCY_STATUSES,
    MAINTENANCE_STATUSES: MAINTENANCE_STATUSES,
    initialize: initialize,
    ensureSheets: ensureSheets,
    createProperty: createProperty,
    updateProperty: updateProperty,
    getProperty: getProperty,
    listProperties: listProperties,
    searchProperties: searchProperties,
    createUnit: createUnit,
    listUnits: listUnits,
    createInspection: createInspection,
    listInspections: listInspections,
    createMaintenanceRequest: createMaintenanceRequest,
    updateMaintenanceStatus: updateMaintenanceStatus,
    listMaintenance: listMaintenance,
    searchMaintenance: searchMaintenance,
    dashboard: dashboard
  };
})();

function reosInitializeProperties() { return REOS.Properties.initialize(); }
function showProperties() {
  const html = HtmlService.createHtmlOutputFromFile('PropertiesUI').setWidth(1200).setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Properties');
}
function propertiesDashboard() { return REOS.Properties.dashboard(); }
function propertiesCreateProperty(property) { return REOS.Properties.createProperty(property || {}); }
function propertiesSearchProperties(query) { return REOS.Properties.searchProperties(query || ''); }
function propertiesCreateUnit(unit) { return REOS.Properties.createUnit(unit || {}); }
function propertiesCreateInspection(inspection) { return REOS.Properties.createInspection(inspection || {}); }
function propertiesCreateMaintenance(request) { return REOS.Properties.createMaintenanceRequest(request || {}); }
function propertiesSearchMaintenance(query) { return REOS.Properties.searchMaintenance(query || ''); }
function propertiesUpdateMaintenanceStatus(maintenanceId, status, notes) { return REOS.Properties.updateMaintenanceStatus(maintenanceId, status, notes || ''); }
