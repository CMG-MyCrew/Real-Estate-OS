/**
 * REOS Enterprise v3.2.3 - Vendor Portal UI
 *
 * Extends the existing Vendor Portal framework with vendor portal account dashboards,
 * assigned work, payment visibility, documents, messages, tasks, status updates,
 * and completion submissions.
 */

var REOS = REOS || {};

REOS.VendorPortal = (function () {
  const VENDORS_SHEET = 'VENDORS';
  const ASSIGNMENTS_SHEET = 'VENDOR_ASSIGNMENTS';
  const UPDATES_SHEET = 'VENDOR_PORTAL_UPDATES';
  const SUBMISSIONS_SHEET = 'VENDOR_WORK_SUBMISSIONS';
  const VENDOR_ID_FIELD = 'Vendor ID';
  const ASSIGNMENT_ID_FIELD = 'Assignment ID';
  const UPDATE_ID_FIELD = 'Vendor Update ID';
  const SUBMISSION_ID_FIELD = 'Vendor Submission ID';

  const VENDOR_HEADERS = ['Vendor ID', 'Vendor Name', 'Company', 'Vendor Type', 'Email', 'Phone', 'Status', 'Insurance Expiration', 'License Number', 'Rating', 'Notes', 'Active', 'Created At', 'Updated At'];
  const ASSIGNMENT_HEADERS = ['Assignment ID', 'Vendor ID', 'Record ID', 'Record Type', 'Work Type', 'Description', 'Priority', 'Status', 'Due Date', 'Estimated Cost', 'Actual Cost', 'Invoice URL', 'Completion Notes', 'Created At', 'Updated At'];
  const UPDATE_HEADERS = ['Vendor Update ID', 'Portal Account ID', 'Work Order ID', 'Status', 'Message', 'Created At', 'Updated At'];
  const SUBMISSION_HEADERS = ['Vendor Submission ID', 'Portal Account ID', 'Work Order ID', 'Submission Type', 'Description', 'Document URL', 'Status', 'Submitted At', 'Created At', 'Updated At'];

  function ensureSheets() {
    ensureTable_(VENDORS_SHEET, VENDOR_HEADERS);
    ensureTable_(ASSIGNMENTS_SHEET, ASSIGNMENT_HEADERS);
    ensureTable_(UPDATES_SHEET, UPDATE_HEADERS);
    ensureTable_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
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

  function createVendor(vendor) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();
    vendor = vendor || {};
    vendor.Email = REOS.normalizeEmail_(vendor.Email);
    vendor.Phone = REOS.normalizePhone_(vendor.Phone);
    vendor.Status = vendor.Status || 'Active';
    vendor.Active = vendor.Active === false ? false : true;
    const validation = REOS.Validation.validateRecord(vendor, { required: ['Vendor Name', 'Vendor Type', 'Email'], emailField: 'Email', phoneField: 'Phone', dateFields: ['Insurance Expiration'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const created = REOS.Database.insert(VENDORS_SHEET, vendor, { idField: VENDOR_ID_FIELD, idPrefix: 'V' });
    REOS.Logger.audit('Vendor created', { vendorId: created[VENDOR_ID_FIELD], email: created.Email });
    return created;
  }

  function assignWork(assignment) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();
    assignment = assignment || {};
    assignment.Status = assignment.Status || 'Assigned';
    assignment.Priority = assignment.Priority || 'Medium';
    const validation = REOS.Validation.validateRecord(assignment, { required: ['Vendor ID', 'Record ID', 'Record Type', 'Work Type', 'Description'], dateFields: ['Due Date'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const created = REOS.Database.insert(ASSIGNMENTS_SHEET, assignment, { idField: ASSIGNMENT_ID_FIELD, idPrefix: 'VA' });
    REOS.Logger.audit('Vendor assignment created', { assignmentId: created[ASSIGNMENT_ID_FIELD], vendorId: created['Vendor ID'] });
    return created;
  }

  function getVendor(vendorId) { REOS.Security.requirePermission('documents:read'); ensureSheets(); return REOS.Database.findById(VENDORS_SHEET, VENDOR_ID_FIELD, vendorId); }
  function listVendors() { REOS.Security.requirePermission('documents:read'); ensureSheets(); return REOS.Database.query(VENDORS_SHEET, function (vendor) { return vendor.Active !== false; }); }
  function listAssignments(vendorId) { REOS.Security.requirePermission('documents:read'); ensureSheets(); return REOS.Database.query(ASSIGNMENTS_SHEET, function (assignment) { return !vendorId || String(assignment['Vendor ID'] || '') === String(vendorId || ''); }); }
  function listOpenAssignments(vendorId) { return listAssignments(vendorId).filter(function (assignment) { return ['completed', 'cancelled', 'closed'].indexOf(String(assignment.Status || '').toLowerCase()) === -1; }); }

  function updateAssignment(assignmentId, changes) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();
    const updated = REOS.Database.update(ASSIGNMENTS_SHEET, ASSIGNMENT_ID_FIELD, assignmentId, changes || {});
    REOS.Logger.audit('Vendor assignment updated', { assignmentId: assignmentId });
    return updated;
  }

  function vendorUpdateAssignment(vendorId, assignmentId, status, notes, invoiceUrl, actualCost) {
    const assignment = REOS.Database.findById(ASSIGNMENTS_SHEET, ASSIGNMENT_ID_FIELD, assignmentId);
    if (!assignment || String(assignment['Vendor ID'] || '') !== String(vendorId || '')) throw new Error('Assignment not found for this vendor.');
    return updateAssignment(assignmentId, { Status: status || assignment.Status, 'Completion Notes': notes || assignment['Completion Notes'] || '', 'Invoice URL': invoiceUrl || assignment['Invoice URL'] || '', 'Actual Cost': actualCost || assignment['Actual Cost'] || '' });
  }

  function getVendorWorkspace(vendorId, email) {
    ensureSheets();
    const vendor = REOS.Database.findById(VENDORS_SHEET, VENDOR_ID_FIELD, vendorId);
    if (!vendor || REOS.normalizeEmail_(vendor.Email) !== REOS.normalizeEmail_(email)) throw new Error('Invalid vendor credentials.');
    const assignments = listOpenAssignments(vendorId);
    return { vendor: sanitizeVendor_(vendor), openAssignments: assignments, allAssignments: listAssignments(vendorId).slice(-50).reverse(), documents: getVendorDocuments_(assignments), generatedAt: new Date() };
  }

  function getVendorPortalDashboard(accountId) {
    ensureSheets();
    const account = REOS.Database.findById('PORTAL_ACCOUNTS', 'Portal Account ID', accountId);
    if (!account) throw new Error('Portal account not found.');
    if (account['Portal Role'] !== 'Vendor') throw new Error('Portal account is not a vendor account.');
    const vendorId = account['Linked Entity ID'];
    const assignments = safeGetAll_(ASSIGNMENTS_SHEET).filter(function (a) { return !vendorId || a['Vendor ID'] === vendorId; });
    const workOrders = safeGetAll_('WORK_ORDERS').filter(function (w) { return !vendorId || w['Vendor ID'] === vendorId || w.Vendor === vendorId; });
    const payments = safeGetAll_('FIN_VENDOR_PAYMENTS').filter(function (p) { return !vendorId || p['Vendor ID'] === vendorId; });
    const documents = safeGetAll_('PORTAL_DOCUMENT_SHARES').filter(function (s) { return s['Portal Account ID'] === accountId && s.Status === 'Active'; });
    const messages = safeGetAll_('PORTAL_MESSAGES').filter(function (m) { return m['Portal Account ID'] === accountId; });
    const tasks = safeGetAll_('PORTAL_TASKS').filter(function (t) { return t['Portal Account ID'] === accountId; });
    const updates = safeGetAll_(UPDATES_SHEET).filter(function (u) { return u['Portal Account ID'] === accountId; });
    const submissions = safeGetAll_(SUBMISSIONS_SHEET).filter(function (s) { return s['Portal Account ID'] === accountId; });
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      account: account,
      kpis: {
        assignments: assignments.length,
        assignedWorkOrders: workOrders.length,
        openWork: assignments.concat(workOrders).filter(function (w) { return ['completed', 'cancelled', 'closed'].indexOf(String(w.Status || '').toLowerCase()) === -1; }).length,
        pendingPayments: payments.filter(function (p) { return String(p.Status || '') !== 'Paid'; }).length,
        paidAmount: sum_(payments.filter(function (p) { return p.Status === 'Paid'; }), 'Amount'),
        documents: documents.length,
        openMessages: messages.filter(function (m) { return m.Status !== 'Closed'; }).length,
        openTasks: tasks.filter(function (t) { return t.Status !== 'Completed'; }).length,
        submissions: submissions.length
      },
      assignments: latest_(assignments, 'Created At', 100),
      workOrders: latest_(workOrders, 'Created At', 100),
      payments: latest_(payments, 'Created At', 100),
      documents: documents,
      messages: latest_(messages, 'Created At', 50),
      tasks: latest_(tasks, 'Created At', 50),
      updates: latest_(updates, 'Created At', 50),
      submissions: latest_(submissions, 'Created At', 50)
    };
  }

  function createPortalUpdate(record) {
    ensureSheets();
    record = record || {};
    if (!record['Portal Account ID']) throw new Error('Portal Account ID is required.');
    return REOS.Database.insert(UPDATES_SHEET, { 'Portal Account ID': record['Portal Account ID'], 'Work Order ID': record['Work Order ID'] || '', Status: record.Status || 'Submitted', Message: record.Message || '', 'Created At': new Date(), 'Updated At': new Date() }, { idField: UPDATE_ID_FIELD, idPrefix: 'VUPD' });
  }

  function createCompletionSubmission(record) {
    ensureSheets();
    record = record || {};
    if (!record['Portal Account ID']) throw new Error('Portal Account ID is required.');
    if (!record['Work Order ID']) throw new Error('Work Order ID is required.');
    return REOS.Database.insert(SUBMISSIONS_SHEET, { 'Portal Account ID': record['Portal Account ID'], 'Work Order ID': record['Work Order ID'], 'Submission Type': record['Submission Type'] || 'Completion Package', Description: record.Description || '', 'Document URL': record['Document URL'] || '', Status: record.Status || 'Submitted', 'Submitted At': new Date(), 'Created At': new Date(), 'Updated At': new Date() }, { idField: SUBMISSION_ID_FIELD, idPrefix: 'VSUB' });
  }

  function completePortalTask(taskId) { ensureSheets(); return REOS.Database.update('PORTAL_TASKS', 'Portal Task ID', taskId, { Status: 'Completed', 'Updated At': new Date() }); }

  function getVendorDocuments_(assignments) { const docs = []; (assignments || []).forEach(function (assignment) { try { docs.push.apply(docs, REOS.Documents.listForRecord(assignment['Record ID'])); } catch (ignore) {} }); return docs.slice(0, 50); }
  function sanitizeVendor_(vendor) { return { vendorId: vendor[VENDOR_ID_FIELD], vendorName: vendor['Vendor Name'], company: vendor.Company, vendorType: vendor['Vendor Type'], email: vendor.Email, phone: vendor.Phone, status: vendor.Status, rating: vendor.Rating }; }
  function safeGetAll_(sheetName) { try { return REOS.Database.getAll(sheetName); } catch (error) { return []; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 50); }
  function sum_(rows, field) { return (rows || []).reduce(function (s, r) { return s + Number(r[field] || 0); }, 0); }

  return { ensureSheets: ensureSheets, createVendor: createVendor, assignWork: assignWork, getVendor: getVendor, listVendors: listVendors, listAssignments: listAssignments, listOpenAssignments: listOpenAssignments, updateAssignment: updateAssignment, vendorUpdateAssignment: vendorUpdateAssignment, getVendorWorkspace: getVendorWorkspace, getVendorPortalDashboard: getVendorPortalDashboard, createPortalUpdate: createPortalUpdate, createCompletionSubmission: createCompletionSubmission, completePortalTask: completePortalTask };
})();

function vendorPortalCreateVendor(vendor) { return REOS.VendorPortal.createVendor(vendor); }
function vendorPortalAssignWork(assignment) { return REOS.VendorPortal.assignWork(assignment); }
function vendorPortalListVendors() { return REOS.VendorPortal.listVendors(); }
function vendorPortalGetWorkspace(vendorId, email) { return REOS.VendorPortal.getVendorWorkspace(vendorId, email); }
function vendorPortalUpdateAssignment(vendorId, assignmentId, status, notes, invoiceUrl, actualCost) { return REOS.VendorPortal.vendorUpdateAssignment(vendorId, assignmentId, status, notes, invoiceUrl, actualCost); }
function reosVendorPortalEnsureSheets() { return REOS.VendorPortal.ensureSheets(); }
function reosVendorPortalDashboard(accountId) { return REOS.VendorPortal.getVendorPortalDashboard(accountId); }
function reosVendorPortalCreateUpdate(record) { return REOS.VendorPortal.createPortalUpdate(record || {}); }
function reosVendorPortalSubmitCompletion(record) { return REOS.VendorPortal.createCompletionSubmission(record || {}); }
function reosVendorPortalCompleteTask(taskId) { return REOS.VendorPortal.completePortalTask(taskId); }
function showVendorPortalUI() { REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('VendorPortal').setTitle('REOS Vendor Portal').setWidth(1200).setHeight(850), 'REOS Vendor Portal'); }
