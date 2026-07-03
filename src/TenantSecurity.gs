/**
 * REOS Enterprise v3.0 - Tenant Security & Isolation Framework
 *
 * Tenant-aware access mapping, scoped record helpers, and audit foundation for
 * white-label SaaS deployments.
 */

var REOS = REOS || {};

REOS.TenantSecurity = (function () {
  const ACCESS_SHEET = 'TENANT_ACCESS';
  const AUDIT_SHEET = 'TENANT_AUDIT';

  const ACCESS_HEADERS = [
    'Tenant Access ID', 'Tenant ID', 'User Email', 'Role', 'Status',
    'Last Access At', 'Notes', 'Active', 'Created At', 'Updated At'
  ];

  const AUDIT_HEADERS = [
    'Tenant Audit ID', 'Tenant ID', 'User Email', 'Action', 'Resource',
    'Record ID', 'Status', 'Message', 'Timestamp', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(ACCESS_SHEET, ACCESS_HEADERS);
    ensureTable_(AUDIT_SHEET, AUDIT_HEADERS);
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

  function grantAccess(tenantId, email, role) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const record = {
      'Tenant ID': tenantId,
      'User Email': REOS.normalizeEmail_(email),
      Role: role || 'User',
      Status: 'Active',
      Active: true
    };
    const created = REOS.Database.insert(ACCESS_SHEET, record, { idField: 'Tenant Access ID', idPrefix: 'TUA' });
    audit(tenantId, 'grantAccess', 'TenantAccess', created['Tenant Access ID'], 'Success', 'Access granted.');
    return created;
  }

  function revokeAccess(accessId) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const updated = REOS.Database.update(ACCESS_SHEET, 'Tenant Access ID', accessId, { Status: 'Revoked', Active: false });
    audit(updated['Tenant ID'], 'revokeAccess', 'TenantAccess', accessId, 'Success', 'Access revoked.');
    return updated;
  }

  function userTenants(email) {
    ensureSheets();
    email = REOS.normalizeEmail_(email || REOS.Security.getCurrentUserEmail());
    return REOS.Database.query(ACCESS_SHEET, function (row) {
      return REOS.normalizeEmail_(row['User Email']) === email &&
        String(row.Status || '').toLowerCase() === 'active' && row.Active !== false;
    });
  }

  function requireTenantAccess(tenantId, minRole) {
    ensureSheets();
    const email = REOS.Security.getCurrentUserEmail();
    const access = userTenants(email).filter(function (row) {
      return String(row['Tenant ID'] || '') === String(tenantId || '');
    })[0];
    if (!access) {
      audit(tenantId, 'requireTenantAccess', 'Tenant', tenantId, 'Denied', 'No tenant access.');
      throw new Error('No access to selected tenant.');
    }
    REOS.Database.update(ACCESS_SHEET, 'Tenant Access ID', access['Tenant Access ID'], { 'Last Access At': new Date() });
    return access;
  }

  function scopeRecord(record, tenantId) {
    record = record || {};
    record['Tenant ID'] = tenantId || REOS.Tenants.getCurrentTenantId();
    if (!record['Tenant ID']) throw new Error('Tenant ID is required.');
    return record;
  }

  function filterRows(rows, tenantId) {
    tenantId = tenantId || REOS.Tenants.getCurrentTenantId();
    return (rows || []).filter(function (row) {
      return !row['Tenant ID'] || String(row['Tenant ID'] || '') === String(tenantId || '');
    });
  }

  function audit(tenantId, action, resource, recordId, status, message) {
    try {
      ensureSheets();
      return REOS.Database.insert(AUDIT_SHEET, {
        'Tenant ID': tenantId || '',
        'User Email': REOS.Security.getCurrentUserEmail(),
        Action: action || '',
        Resource: resource || '',
        'Record ID': recordId || '',
        Status: status || '',
        Message: message || '',
        Timestamp: new Date()
      }, { idField: 'Tenant Audit ID', idPrefix: 'TAU' });
    } catch (error) {
      return null;
    }
  }

  return {
    ensureSheets: ensureSheets,
    grantAccess: grantAccess,
    revokeAccess: revokeAccess,
    userTenants: userTenants,
    requireTenantAccess: requireTenantAccess,
    scopeRecord: scopeRecord,
    filterRows: filterRows,
    audit: audit
  };
})();

function tenantSecurityGrantAccess(tenantId, email, role) { return REOS.TenantSecurity.grantAccess(tenantId, email, role); }
function tenantSecurityRevokeAccess(accessId) { return REOS.TenantSecurity.revokeAccess(accessId); }
function tenantSecurityUserTenants(email) { return REOS.TenantSecurity.userTenants(email); }
