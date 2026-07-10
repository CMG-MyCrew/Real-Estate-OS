/**
 * REOS Enterprise v3.0.0 GA - Phase 3 Enterprise Data Seeding
 *
 * Seeds production-ready enterprise lookup data, roles, automation templates,
 * AI agents, vendor categories, inspection templates, property statuses,
 * dashboard settings, environment settings, and records seeding reports.
 */

var REOS = REOS || {};

REOS.EnterpriseSeeder = (function () {
  const RUNS_SHEET = 'SEED_RUNS';
  const ITEMS_SHEET = 'SEED_ITEMS';
  const INSPECTION_TEMPLATES_SHEET = 'INSPECTION_TEMPLATES';
  const DASHBOARD_SETTINGS_SHEET = 'DASHBOARD_SETTINGS';
  const ENVIRONMENT_SETTINGS_SHEET = 'ENVIRONMENT_SETTINGS';
  const RUN_ID_FIELD = 'Seed Run ID';
  const ITEM_ID_FIELD = 'Seed Item ID';

  const RUN_HEADERS = ['Seed Run ID', 'Environment', 'Status', 'Items Created', 'Items Skipped', 'Items Failed', 'Report JSON', 'Started At', 'Finished At', 'Created At', 'Updated At'];
  const ITEM_HEADERS = ['Seed Item ID', 'Seed Run ID', 'Area', 'Name', 'Status', 'Message', 'Details JSON', 'Created At', 'Updated At'];
  const INSPECTION_HEADERS = ['Template ID', 'Name', 'Category', 'Checklist JSON', 'Required Photos', 'Required Signature', 'Active', 'Created At', 'Updated At'];
  const DASHBOARD_HEADERS = ['Setting ID', 'Dashboard', 'Setting', 'Value', 'Description', 'Active', 'Created At', 'Updated At'];
  const ENV_HEADERS = ['Environment Setting ID', 'Environment', 'Key', 'Value', 'Description', 'Active', 'Created At', 'Updated At'];

  const LOOKUP_SEEDS = [
    ['Acquisition Source', 'Driving for Dollars', 1, true], ['Acquisition Source', 'County Records', 2, true], ['Acquisition Source', 'Probate List', 3, true], ['Acquisition Source', 'Tax Delinquent List', 4, true], ['Acquisition Source', 'Code Violation List', 5, true], ['Acquisition Source', 'Referral', 6, true],
    ['Inspection Type', 'Occupancy Inspection', 1, true], ['Inspection Type', 'REO Initial Inspection', 2, true], ['Inspection Type', 'Preservation Inspection', 3, true], ['Inspection Type', 'Rental Inspection', 4, true], ['Inspection Type', 'Rehab Inspection', 5, true], ['Inspection Type', 'Final QC', 6, true],
    ['Vendor Tier', 'Preferred', 1, true], ['Vendor Tier', 'Approved', 2, true], ['Vendor Tier', 'Trial', 3, true], ['Vendor Tier', 'Do Not Use', 4, true],
    ['Dashboard View', 'Executive', 1, true], ['Dashboard View', 'Operations', 2, true], ['Dashboard View', 'Acquisitions', 3, true], ['Dashboard View', 'Field', 4, true]
  ];

  const INSPECTION_SEEDS = [
    { Name: 'REO Initial Inspection', Category: 'REO', RequiredPhotos: 8, RequiredSignature: false, Checklist: ['Exterior condition', 'Occupancy status', 'Utilities status', 'Lockbox present', 'Lawn condition', 'Debris visible', 'Damage visible', 'Access secured'] },
    { Name: 'Preservation Completion QC', Category: 'Property Preservation', RequiredPhotos: 12, RequiredSignature: true, Checklist: ['Before photos attached', 'After photos attached', 'Scope completed', 'Debris removed', 'Grass cut', 'Locks changed', 'Property secured', 'Invoice attached'] },
    { Name: 'Rental Move-In Inspection', Category: 'Rental', RequiredPhotos: 10, RequiredSignature: true, Checklist: ['Kitchen condition', 'Bath condition', 'Flooring condition', 'Paint condition', 'Appliances present', 'Smoke detectors', 'Keys delivered', 'Tenant signature'] },
    { Name: 'Maintenance Final Review', Category: 'Maintenance', RequiredPhotos: 6, RequiredSignature: false, Checklist: ['Issue resolved', 'Materials documented', 'Labor documented', 'Photos attached', 'Vendor notes complete', 'Manager approval required'] }
  ];

  const DASHBOARD_SEEDS = [
    ['Executive', 'Default Date Range', 'Last 30 Days', 'Default executive reporting window.'],
    ['Executive', 'Show Health Alerts', 'true', 'Display production health alerts.'],
    ['Acquisitions', 'Default Pipeline View', 'Active', 'Default acquisitions pipeline filter.'],
    ['Properties', 'Show Maintenance Backlog', 'true', 'Display open maintenance backlog.'],
    ['Vendors', 'Show SLA Warnings', 'true', 'Display vendor SLA warnings.'],
    ['AI', 'Show Agent Queue', 'true', 'Display AI agent task queue.']
  ];

  const ENV_SEEDS = [
    ['Production', 'FEATURE_AI_AGENTS', 'true', 'Enable AI agent command center.'],
    ['Production', 'FEATURE_EXTERNAL_DRY_RUN', 'true', 'Keep external integrations in dry-run mode until live credentials are approved.'],
    ['Production', 'FEATURE_DOCUMENTS', 'true', 'Enable Drive-backed document registry.'],
    ['Production', 'FEATURE_DASHBOARD_EXPORT', 'true', 'Enable dashboard export center.'],
    ['Production', 'LOG_LEVEL', 'INFO', 'Production log level.']
  ];

  function ensureSheets() {
    ensureTable_(RUNS_SHEET, RUN_HEADERS);
    ensureTable_(ITEMS_SHEET, ITEM_HEADERS);
    ensureTable_(INSPECTION_TEMPLATES_SHEET, INSPECTION_HEADERS);
    ensureTable_(DASHBOARD_SETTINGS_SHEET, DASHBOARD_HEADERS);
    ensureTable_(ENVIRONMENT_SETTINGS_SHEET, ENV_HEADERS);
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
  }

  function getDashboard() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const runs = latest_(REOS.Database.getAll(RUNS_SHEET), 'Started At', 25);
    const latest = runs[0] || null;
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        runs: runs.length,
        latestStatus: latest ? latest.Status : 'Not Run',
        created: latest ? latest['Items Created'] : 0,
        skipped: latest ? latest['Items Skipped'] : 0,
        failed: latest ? latest['Items Failed'] : 0
      },
      runs: runs,
      latestItems: latest ? getRunItems(latest[RUN_ID_FIELD]) : []
    };
  }

  function runEnterpriseSeed(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    const environment = options.environment || 'Production';
    const run = REOS.Database.insert(RUNS_SHEET, {
      Environment: environment,
      Status: 'Running',
      'Items Created': 0,
      'Items Skipped': 0,
      'Items Failed': 0,
      'Report JSON': '',
      'Started At': new Date(),
      'Finished At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: RUN_ID_FIELD, idPrefix: 'SEED' });
    const runId = run[RUN_ID_FIELD];
    const items = [];

    add_(items, seedLookups_());
    add_(items, seedAutomationTemplates_());
    add_(items, seedAiAgents_());
    add_(items, seedInspectionTemplates_());
    add_(items, seedDashboardSettings_());
    add_(items, seedEnvironmentSettings_(environment));

    items.forEach(function (item) { persistItem_(runId, item); });
    const created = items.filter(function (i) { return i.Status === 'Created'; }).length;
    const skipped = items.filter(function (i) { return i.Status === 'Skipped'; }).length;
    const failed = items.filter(function (i) { return i.Status === 'Failed'; }).length;
    const status = failed ? 'Needs Review' : 'Complete';
    const report = { runId: runId, environment: environment, status: status, created: created, skipped: skipped, failed: failed, items: items, generatedAt: REOS.nowIso_() };

    REOS.Database.update(RUNS_SHEET, RUN_ID_FIELD, runId, {
      Status: status,
      'Items Created': created,
      'Items Skipped': skipped,
      'Items Failed': failed,
      'Report JSON': REOS.toJson_(report),
      'Finished At': new Date(),
      'Updated At': new Date()
    });
    REOS.Logger.audit('Enterprise data seed completed', { runId: runId, status: status, created: created, skipped: skipped, failed: failed });
    return report;
  }

  function getRunItems(runId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(ITEMS_SHEET).filter(function (row) { return row[RUN_ID_FIELD] === runId; });
  }

  function seedLookups_() {
    const items = [];
    const sheet = REOS.CONFIG.SHEETS.LOOKUPS;
    const existing = REOS.Database.getAll(sheet).map(function (row) { return String(row.Category) + '|' + String(row.Value); });
    LOOKUP_SEEDS.forEach(function (row) {
      try {
        const key = row[0] + '|' + row[1];
        if (existing.indexOf(key) !== -1) return items.push(item_('Lookups', row[0] + ': ' + row[1], 'Skipped', 'Already exists.', {}));
        REOS.Database.insert(sheet, { Category: row[0], Value: row[1], 'Sort Order': row[2], Active: row[3] }, { idField: 'Lookup ID', idPrefix: 'LKP' });
        items.push(item_('Lookups', row[0] + ': ' + row[1], 'Created', 'Lookup seeded.', {}));
      } catch (error) { items.push(item_('Lookups', row[0] + ': ' + row[1], 'Failed', error.message, {})); }
    });
    return items;
  }

  function seedAutomationTemplates_() {
    try {
      if (REOS.AutomationTemplates && typeof REOS.AutomationTemplates.seedTemplates === 'function') {
        const result = REOS.AutomationTemplates.seedTemplates();
        return [item_('Automation Templates', 'Default templates', result.created ? 'Created' : 'Skipped', 'Automation templates ready.', result)];
      }
      return [item_('Automation Templates', 'Default templates', 'Skipped', 'AutomationTemplates service unavailable.', {})];
    } catch (error) { return [item_('Automation Templates', 'Default templates', 'Failed', error.message, {})]; }
  }

  function seedAiAgents_() {
    try {
      if (REOS.AIAgents && typeof REOS.AIAgents.seedAgents === 'function') {
        const result = REOS.AIAgents.seedAgents();
        return [item_('AI Agents', 'Default agents', result.created ? 'Created' : 'Skipped', 'AI agents ready.', result)];
      }
      return [item_('AI Agents', 'Default agents', 'Skipped', 'AIAgents service unavailable.', {})];
    } catch (error) { return [item_('AI Agents', 'Default agents', 'Failed', error.message, {})]; }
  }

  function seedInspectionTemplates_() {
    const items = [];
    const existing = REOS.Database.getAll(INSPECTION_TEMPLATES_SHEET).map(function (row) { return String(row.Name).toLowerCase(); });
    INSPECTION_SEEDS.forEach(function (tpl) {
      try {
        if (existing.indexOf(String(tpl.Name).toLowerCase()) !== -1) return items.push(item_('Inspection Templates', tpl.Name, 'Skipped', 'Already exists.', {}));
        REOS.Database.insert(INSPECTION_TEMPLATES_SHEET, {
          Name: tpl.Name,
          Category: tpl.Category,
          'Checklist JSON': REOS.toJson_(tpl.Checklist),
          'Required Photos': tpl.RequiredPhotos,
          'Required Signature': tpl.RequiredSignature,
          Active: true,
          'Created At': new Date(),
          'Updated At': new Date()
        }, { idField: 'Template ID', idPrefix: 'ITPL' });
        items.push(item_('Inspection Templates', tpl.Name, 'Created', 'Inspection template seeded.', {}));
      } catch (error) { items.push(item_('Inspection Templates', tpl.Name, 'Failed', error.message, {})); }
    });
    return items;
  }

  function seedDashboardSettings_() {
    const items = [];
    const existing = REOS.Database.getAll(DASHBOARD_SETTINGS_SHEET).map(function (row) { return String(row.Dashboard) + '|' + String(row.Setting); });
    DASHBOARD_SEEDS.forEach(function (row) {
      try {
        const key = row[0] + '|' + row[1];
        if (existing.indexOf(key) !== -1) return items.push(item_('Dashboard Settings', key, 'Skipped', 'Already exists.', {}));
        REOS.Database.insert(DASHBOARD_SETTINGS_SHEET, { Dashboard: row[0], Setting: row[1], Value: row[2], Description: row[3], Active: true, 'Created At': new Date(), 'Updated At': new Date() }, { idField: 'Setting ID', idPrefix: 'DSET' });
        items.push(item_('Dashboard Settings', key, 'Created', 'Dashboard setting seeded.', {}));
      } catch (error) { items.push(item_('Dashboard Settings', row[0] + '|' + row[1], 'Failed', error.message, {})); }
    });
    return items;
  }

  function seedEnvironmentSettings_(environment) {
    const items = [];
    const existing = REOS.Database.getAll(ENVIRONMENT_SETTINGS_SHEET).map(function (row) { return String(row.Environment) + '|' + String(row.Key); });
    ENV_SEEDS.forEach(function (row) {
      try {
        const env = row[0] || environment;
        const key = env + '|' + row[1];
        if (existing.indexOf(key) !== -1) return items.push(item_('Environment Settings', key, 'Skipped', 'Already exists.', {}));
        REOS.Database.insert(ENVIRONMENT_SETTINGS_SHEET, { Environment: env, Key: row[1], Value: row[2], Description: row[3], Active: true, 'Created At': new Date(), 'Updated At': new Date() }, { idField: 'Environment Setting ID', idPrefix: 'ENV' });
        items.push(item_('Environment Settings', key, 'Created', 'Environment setting seeded.', {}));
      } catch (error) { items.push(item_('Environment Settings', row[1], 'Failed', error.message, {})); }
    });
    return items;
  }

  function persistItem_(runId, item) {
    return REOS.Database.insert(ITEMS_SHEET, { [RUN_ID_FIELD]: runId, Area: item.Area, Name: item.Name, Status: item.Status, Message: item.Message, 'Details JSON': REOS.toJson_(item.Details || {}), 'Created At': new Date(), 'Updated At': new Date() }, { idField: ITEM_ID_FIELD, idPrefix: 'SITM' });
  }

  function item_(area, name, status, message, details) { return { Area: area, Name: name, Status: status, Message: message, Details: details || {} }; }
  function add_(target, items) { (items || []).forEach(function (item) { target.push(item); }); }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 25); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, runEnterpriseSeed: runEnterpriseSeed, getRunItems: getRunItems };
})();

function reosEnterpriseSeederEnsureSheets() { return REOS.EnterpriseSeeder.ensureSheets(); }
function reosEnterpriseSeederDashboard() { return REOS.EnterpriseSeeder.getDashboard(); }
function reosEnterpriseSeederRun(options) { return REOS.EnterpriseSeeder.runEnterpriseSeed(options || {}); }
function reosEnterpriseSeederItems(runId) { return REOS.EnterpriseSeeder.getRunItems(runId); }
function showEnterpriseSeeder() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('EnterpriseSeederUI').setTitle('REOS Enterprise Seeder').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Enterprise Seeder');
}
