/** REOS Enterprise v3.0 - Feature Flag Administration */
var REOS = REOS || {};

REOS.FeatureFlags = (function () {
  const SHEET = 'FEATURE_FLAGS';
  const HEADERS = ['Flag ID','Name','Description','Enabled','Tenant ID','Environment','Rollout %','Owner','Expires At','Created At','Updated At'];

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

  function createFlag(flag) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    flag = flag || {};
    flag.Enabled = flag.Enabled === true;
    flag.Environment = flag.Environment || 'Production';
    flag['Rollout %'] = Number(flag['Rollout %'] || 0);
    flag.Owner = flag.Owner || REOS.Security.getCurrentUserEmail();
    const validation = REOS.Validation.validateRecord(flag, { required: ['Name'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    return REOS.Database.insert(SHEET, flag, { idField: 'Flag ID', idPrefix: 'FLAG' });
  }

  function setFlag(flagId, enabled) {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    return REOS.Database.update(SHEET, 'Flag ID', flagId, { Enabled: enabled === true });
  }

  function isEnabled(name, tenantId, environment) {
    ensureSheet();
    const flags = REOS.Database.query(SHEET, function (flag) {
      return String(flag.Name || '') === String(name || '') &&
        (!flag['Tenant ID'] || String(flag['Tenant ID']) === String(tenantId || REOS.Tenants.getCurrentTenantId() || '')) &&
        String(flag.Environment || 'Production') === String(environment || 'Production');
    });
    if (!flags.length) return false;
    const flag = flags[0];
    if (flag.Enabled !== true) return false;
    const rollout = Number(flag['Rollout %'] || 100);
    if (rollout >= 100) return true;
    const seed = String(tenantId || REOS.Tenants.getCurrentTenantId() || name).split('').reduce(function (a, c) { return a + c.charCodeAt(0); }, 0);
    return (seed % 100) < rollout;
  }

  function listFlags() {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();
    return REOS.Database.getAll(SHEET);
  }

  function seedDefaults() {
    REOS.Security.requirePermission('finance:write');
    ensureSheet();
    if (REOS.Database.getAll(SHEET).length) return 0;
    ['AI Assistant','Mobile App','API Platform','Client Portal','Vendor Portal','BI Forecasts'].forEach(function (name) {
      createFlag({ Name: name, Description: 'Default platform flag', Enabled: true, Environment: 'Production', 'Rollout %': 100 });
    });
    return 6;
  }

  return { ensureSheet: ensureSheet, createFlag: createFlag, setFlag: setFlag, isEnabled: isEnabled, listFlags: listFlags, seedDefaults: seedDefaults };
})();

function featureFlagsCreate(flag) { return REOS.FeatureFlags.createFlag(flag || {}); }
function featureFlagsSet(flagId, enabled) { return REOS.FeatureFlags.setFlag(flagId, enabled); }
function featureFlagsList() { return REOS.FeatureFlags.listFlags(); }
function featureFlagsSeedDefaults() { return REOS.FeatureFlags.seedDefaults(); }
