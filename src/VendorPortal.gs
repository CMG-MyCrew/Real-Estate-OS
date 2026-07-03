/**
 * REOS Enterprise v3.0 - Vendor Portal Framework
 *
 * Vendor-facing workspace for contractors, inspectors, lenders, title companies,
 * photographers, cleaners, and other service providers.
 */

var REOS = REOS || {};

REOS.VendorPortal = (function () {
  const VENDORS_SHEET = 'VENDORS';
  const ASSIGNMENTS_SHEET = 'VENDOR_ASSIGNMENTS';
  const VENDOR_ID_FIELD = 'Vendor ID';
  const ASSIGNMENT_ID_FIELD = 'Assignment ID';

  const VENDOR_HEADERS = [
    'Vendor ID', 'Vendor Name', 'Company', 'Vendor Type', 'Email', 'Phone',
    'Status', 'Insurance Expiration', 'License Number', 'Rating', 'Notes',
    'Active', 'Created At', 'Updated At'
  ];

  const ASSIGNMENT_HEADERS = [
    'Assignment ID', 'Vendor ID', 'Record ID', 'Record Type', 'Work Type',
    'Description', 'Priority', 'Status', 'Due Date', 'Estimated Cost',
    'Actual Cost', 'Invoice URL', 'Completion Notes', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(VENDORS_SHEET, VENDOR_HEADERS);
    ensureTable_(ASSIGNMENTS_SHEET, ASSIGNMENT_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    return sheet;
  }

  function createVendor(vendor) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();

    vendor = vendor || {};
    vendor.Email = REOS.normalizeEmail_(vendor.Email);
    vendor.Phone = REOS.normalizePhone_(vendor.Phone);
    vendor.Status = vendor.Status || 'Active';
    vendor.Active = vendor.Active === false ? false : true;

    const validation = REOS.Validation.validateRecord(vendor, {
      required: ['Vendor Name', 'Vendor Type', 'Email'],
      emailField: 'Email',
      phoneField: 'Phone',
      dateFields: ['Insurance Expiration']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(VENDORS_SHEET, vendor, {
      idField: VENDOR_ID_FIELD,
      idPrefix: 'V'
    });
    REOS.Logger.audit('Vendor created', { vendorId: created[VENDOR_ID_FIELD], email: created.Email });
    return created;
  }

  function assignWork(assignment) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();

    assignment = assignment || {};
    assignment.Status = assignment.Status || 'Assigned';
    assignment.Priority = assignment.Priority || 'Medium';

    const validation = REOS.Validation.validateRecord(assignment, {
      required: ['Vendor ID', 'Record ID', 'Record Type', 'Work Type', 'Description'],
      dateFields: ['Due Date']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(ASSIGNMENTS_SHEET, assignment, {
      idField: ASSIGNMENT_ID_FIELD,
      idPrefix: 'VA'
    });

    try {
      const vendor = getVendor(created['Vendor ID']);
      if (vendor && vendor.Email) {
        REOS.Notifications.sendEmail({
          to: vendor.Email,
          subject: 'New REOS Vendor Assignment',
          body: 'You have a new assignment: ' + created.Description,
          module: 'VendorPortal'
        }, { recordId: created[ASSIGNMENT_ID_FIELD], Email: vendor.Email });
      }
    } catch (error) {
      REOS.Logger.warn('Vendor notification failed', { assignmentId: created[ASSIGNMENT_ID_FIELD], error: error.message });
    }

    REOS.Logger.audit('Vendor assignment created', { assignmentId: created[ASSIGNMENT_ID_FIELD], vendorId: created['Vendor ID'] });
    return created;
  }

  function getVendor(vendorId) {
    REOS.Security.requirePermission('documents:read');
    ensureSheets();
    return REOS.Database.findById(VENDORS_SHEET, VENDOR_ID_FIELD, vendorId);
  }

  function listVendors() {
    REOS.Security.requirePermission('documents:read');
    ensureSheets();
    return REOS.Database.query(VENDORS_SHEET, function (vendor) {
      return vendor.Active !== false;
    });
  }

  function listAssignments(vendorId) {
    REOS.Security.requirePermission('documents:read');
    ensureSheets();
    return REOS.Database.query(ASSIGNMENTS_SHEET, function (assignment) {
      return !vendorId || String(assignment['Vendor ID'] || '') === String(vendorId || '');
    });
  }

  function listOpenAssignments(vendorId) {
    return listAssignments(vendorId).filter(function (assignment) {
      return ['completed', 'cancelled', 'closed'].indexOf(String(assignment.Status || '').toLowerCase()) === -1;
    });
  }

  function updateAssignment(assignmentId, changes) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();
    const updated = REOS.Database.update(ASSIGNMENTS_SHEET, ASSIGNMENT_ID_FIELD, assignmentId, changes || {});
    REOS.Logger.audit('Vendor assignment updated', { assignmentId: assignmentId });
    return updated;
  }

  function vendorUpdateAssignment(vendorId, assignmentId, status, notes, invoiceUrl, actualCost) {
    const assignment = REOS.Database.findById(ASSIGNMENTS_SHEET, ASSIGNMENT_ID_FIELD, assignmentId);
    if (!assignment || String(assignment['Vendor ID'] || '') !== String(vendorId || '')) {
      throw new Error('Assignment not found for this vendor.');
    }
    return updateAssignment(assignmentId, {
      Status: status || assignment.Status,
      'Completion Notes': notes || assignment['Completion Notes'] || '',
      'Invoice URL': invoiceUrl || assignment['Invoice URL'] || '',
      'Actual Cost': actualCost || assignment['Actual Cost'] || ''
    });
  }

  function getVendorWorkspace(vendorId, email) {
    ensureSheets();
    const vendor = REOS.Database.findById(VENDORS_SHEET, VENDOR_ID_FIELD, vendorId);
    if (!vendor || REOS.normalizeEmail_(vendor.Email) !== REOS.normalizeEmail_(email)) {
      throw new Error('Invalid vendor credentials.');
    }
    const assignments = listOpenAssignments(vendorId);
    return {
      vendor: sanitizeVendor_(vendor),
      openAssignments: assignments,
      allAssignments: listAssignments(vendorId).slice(-50).reverse(),
      documents: getVendorDocuments_(assignments),
      generatedAt: new Date()
    };
  }

  function getVendorDocuments_(assignments) {
    const docs = [];
    (assignments || []).forEach(function (assignment) {
      try {
        docs.push.apply(docs, REOS.Documents.listForRecord(assignment['Record ID']));
      } catch (ignore) {}
    });
    return docs.slice(0, 50);
  }

  function sanitizeVendor_(vendor) {
    return {
      vendorId: vendor[VENDOR_ID_FIELD],
      vendorName: vendor['Vendor Name'],
      company: vendor.Company,
      vendorType: vendor['Vendor Type'],
      email: vendor.Email,
      phone: vendor.Phone,
      status: vendor.Status,
      rating: vendor.Rating
    };
  }

  return {
    ensureSheets: ensureSheets,
    createVendor: createVendor,
    assignWork: assignWork,
    getVendor: getVendor,
    listVendors: listVendors,
    listAssignments: listAssignments,
    listOpenAssignments: listOpenAssignments,
    updateAssignment: updateAssignment,
    vendorUpdateAssignment: vendorUpdateAssignment,
    getVendorWorkspace: getVendorWorkspace
  };
})();

function vendorPortalCreateVendor(vendor) { return REOS.VendorPortal.createVendor(vendor); }
function vendorPortalAssignWork(assignment) { return REOS.VendorPortal.assignWork(assignment); }
function vendorPortalListVendors() { return REOS.VendorPortal.listVendors(); }
function vendorPortalGetWorkspace(vendorId, email) { return REOS.VendorPortal.getVendorWorkspace(vendorId, email); }
function vendorPortalUpdateAssignment(vendorId, assignmentId, status, notes, invoiceUrl, actualCost) {
  return REOS.VendorPortal.vendorUpdateAssignment(vendorId, assignmentId, status, notes, invoiceUrl, actualCost);
}
