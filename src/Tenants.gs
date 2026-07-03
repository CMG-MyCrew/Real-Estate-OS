/**
 * REOS Enterprise v3.0 - White-Label / Multi-Tenant SaaS Core
 *
 * Tenant registry, plan limits, tenant context, white-label brand settings,
 * and tenant-aware filtering foundations.
 */

var REOS = REOS || {};

REOS.Tenants = (function () {
  const TENANTS_SHEET = 'TENANTS';
  const BRANDING_SHEET = 'TENANT_BRANDING';
  const ID_FIELD = 'Tenant ID';

  const TENANT_HEADERS = [
    'Tenant ID', 'Tenant Name', 'Slug', 'Plan', 'Status', 'Owner Email',
    'Primary Domain', 'Trial Ends At', 'Billing Customer ID', 'Max Users',
    'Max Offices', 'Max Records', 'Notes', 'Active', 'Created At', 'Updated At'
  ];

  const BRAND_HEADERS = [
    'Brand ID', 'Tenant ID', 'App Name', 'Logo URL', 'Primary Color',
    'Accent Color', 'Support Email', 'Support Phone', 'Custom Domain',
    'Login Message', 'Footer Text', 'Active', 'Created At', 'Updated At'
  ];

  const PLAN_LIMITS = {
    Starter: { users: 5, offices: 1, records: 5000 },
    Pro: { users: 25, offices: 5, records: 50000 },
    Enterprise: { users: 250, offices: 100, records: 1000000 }
  };

  function ensureSheets() {
    ensureTable_(TENANTS_SHEET, TENANT_HEADERS);
    ensureTable_(BRANDING_SHEET, BRAND_HEADERS);
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

  function createTenant(record) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    record = record || {};
    record['Owner Email'] = REOS.normalizeEmail_(record['Owner Email']);
    record.Plan = record.Plan || 'Starter';
    record.Status = record.Status || 'Active';
    record.Slug = record.Slug || slugify_(record['Tenant Name']);
    record.Active = record.Active === false ? false : true;
    applyPlanLimits_(record);

    const validation = REOS.Validation.validateRecord(record, {
      required: ['Tenant Name', 'Owner Email'],
      emailField: 'Owner Email',
      dateFields: ['Trial Ends At']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(TENANTS_SHEET, record, { idField: ID_FIELD, idPrefix: 'TEN' });
    createDefaultBranding(created[ID_FIELD], created['Tenant Name']);
    REOS.Logger.audit('Tenant created', { tenantId: created[ID_FIELD], plan: created.Plan });
    return created;
  }

  function updateTenant(tenantId, changes) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    changes = changes || {};
    if (changes.Plan) applyPlanLimits_(changes);
    return REOS.Database.update(TENANTS_SHEET, ID_FIELD, tenantId, changes);
  }

  function getTenant(tenantId) {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.findById(TENANTS_SHEET, ID_FIELD, tenantId);
  }

  function findBySlug(slug) {
    ensureSheets();
    return REOS.Database.query(TENANTS_SHEET, function (row) {
      return String(row.Slug || '').toLowerCase() === String(slug || '').toLowerCase() && row.Active !== false;
    })[0] || null;
  }

  function listTenants() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.query(TENANTS_SHEET, function (row) { return row.Active !== false; });
  }

  function createDefaultBranding(tenantId, tenantName) {
    return upsertBranding(tenantId, {
      'App Name': tenantName || 'REOS',
      'Primary Color': '#0f2742',
      'Accent Color': '#145369',
      'Support Email': '',
      'Login Message': 'Welcome to your real estate operating system.',
      'Footer Text': 'Powered by REOS Enterprise',
      Active: true
    });
  }

  function upsertBranding(tenantId, branding) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    branding = branding || {};
    const existing = getBranding(tenantId);
    branding['Tenant ID'] = tenantId;
    branding.Active = branding.Active === false ? false : true;
    if (existing) return REOS.Database.update(BRANDING_SHEET, 'Brand ID', existing['Brand ID'], branding);
    return REOS.Database.insert(BRANDING_SHEET, branding, { idField: 'Brand ID', idPrefix: 'BRAND' });
  }

  function getBranding(tenantId) {
    ensureSheets();
    return REOS.Database.query(BRANDING_SHEET, function (row) {
      return String(row['Tenant ID'] || '') === String(tenantId || '') && row.Active !== false;
    })[0] || null;
  }

  function getCurrentTenantId() {
    return PropertiesService.getUserProperties().getProperty('REOS_CURRENT_TENANT_ID') ||
      PropertiesService.getScriptProperties().getProperty('REOS_DEFAULT_TENANT_ID') || '';
  }

  function setCurrentTenant(tenantId) {
    PropertiesService.getUserProperties().setProperty('REOS_CURRENT_TENANT_ID', tenantId || '');
    return getTenant(tenantId);
  }

  function requireTenant() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('No tenant context selected.');
    const tenant = getTenant(tenantId);
    if (!tenant || String(tenant.Status || '').toLowerCase() !== 'active') throw new Error('Tenant is not active.');
    return tenant;
  }

  function withinLimit(tenantId, limitName, currentCount) {
    const tenant = getTenant(tenantId);
    if (!tenant) return false;
    const limitMap = { users: 'Max Users', offices: 'Max Offices', records: 'Max Records' };
    const max = Number(tenant[limitMap[limitName]] || 0);
    return !max || Number(currentCount || 0) < max;
  }

  function applyPlanLimits_(record) {
    const limits = PLAN_LIMITS[record.Plan] || PLAN_LIMITS.Starter;
    record['Max Users'] = record['Max Users'] || limits.users;
    record['Max Offices'] = record['Max Offices'] || limits.offices;
    record['Max Records'] = record['Max Records'] || limits.records;
  }

  function slugify_(value) {
    return String(value || 'tenant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  return {
    ensureSheets: ensureSheets,
    createTenant: createTenant,
    updateTenant: updateTenant,
    getTenant: getTenant,
    findBySlug: findBySlug,
    listTenants: listTenants,
    upsertBranding: upsertBranding,
    getBranding: getBranding,
    getCurrentTenantId: getCurrentTenantId,
    setCurrentTenant: setCurrentTenant,
    requireTenant: requireTenant,
    withinLimit: withinLimit
  };
})();

function tenantsCreate(record) { return REOS.Tenants.createTenant(record); }
function tenantsUpdate(tenantId, changes) { return REOS.Tenants.updateTenant(tenantId, changes || {}); }
function tenantsList() { return REOS.Tenants.listTenants(); }
function tenantsSetCurrent(tenantId) { return REOS.Tenants.setCurrentTenant(tenantId); }
function tenantsGetBranding(tenantId) { return REOS.Tenants.getBranding(tenantId); }
function tenantsUpsertBranding(tenantId, branding) { return REOS.Tenants.upsertBranding(tenantId, branding || {}); }
