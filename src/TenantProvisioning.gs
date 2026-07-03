/** REOS Enterprise v3.0 - Tenant Provisioning Administration */
var REOS = REOS || {};

REOS.TenantProvisioning = (function () {
  const SHEET = 'TENANT_PROVISIONING_RUNS';
  const HEADERS = ['Provisioning Run ID','Tenant ID','Step','Status','Message','Started At','Finished At','Created At','Updated At'];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET);
    if (!sheet) sheet = ss.insertSheet(SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function provisionFullTenant(tenantId) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    const steps = [
      ['Validate tenant', function () { return REOS.Tenants.getTenant(tenantId); }],
      ['Grant owner access', function () { const t = REOS.Tenants.getTenant(tenantId); return REOS.TenantSecurity.grantAccess(tenantId, t['Owner Email'], 'Owner'); }],
      ['Create billing profile', function () { return REOS.SaaSAdmin.provisionTenant(tenantId); }],
      ['Seed feature flags', function () { return REOS.FeatureFlags.seedDefaults(); }],
      ['Seed system config', function () { return REOS.SystemConfig.seedDefaults(); }],
      ['Create environment snapshot', function () { return REOS.EnvironmentManager.createSnapshot('Production'); }],
      ['Run diagnostics', function () { return REOS.SystemDiagnostics.runDiagnostics(); }]
    ];
    return steps.map(function (step) { return runStep_(tenantId, step[0], step[1]); });
  }

  function runStep_(tenantId, name, fn) {
    const started = new Date();
    let row = REOS.Database.insert(SHEET, { 'Tenant ID': tenantId, Step: name, Status: 'Started', 'Started At': started }, { idField: 'Provisioning Run ID', idPrefix: 'TPR' });
    try {
      const result = fn();
      return REOS.Database.update(SHEET, 'Provisioning Run ID', row['Provisioning Run ID'], { Status: 'Completed', Message: JSON.stringify(result || {}).slice(0, 1000), 'Finished At': new Date() });
    } catch (error) {
      return REOS.Database.update(SHEET, 'Provisioning Run ID', row['Provisioning Run ID'], { Status: 'Error', Message: error.message, 'Finished At': new Date() });
    }
  }

  function recent(limit) {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    return REOS.Database.getAll(SHEET).slice(-Number(limit || 50)).reverse();
  }

  return { ensureSheet: ensureSheet, provisionFullTenant: provisionFullTenant, recent: recent };
})();

function tenantProvisioningRun(tenantId) { return REOS.TenantProvisioning.provisionFullTenant(tenantId); }
function tenantProvisioningRecent(limit) { return REOS.TenantProvisioning.recent(limit); }
