/**
 * REOS Enterprise v3.0.0 GA - Phase 3 Enterprise Data Seeding
 *
 * Seeds production-ready enterprise data after deployment provisioning:
 * roles, permissions, lookup packs, automation templates, AI agents,
 * inspection templates, dashboard settings, vendor categories, and environment metadata.
 */

var REOS = REOS || {};

REOS.DataSeeder = (function () {
  const RUNS_SHEET = 'DATA_SEED_RUNS';
  const ITEMS_SHEET = 'DATA_SEED_ITEMS';
  const INSPECTION_TEMPLATES_SHEET = 'INSPECTION_TEMPLATES';
  const DASHBOARD_SETTINGS_SHEET = 'DASHBOARD_SETTINGS';
  const ENVIRONMENT_CONFIG_SHEET = 'ENVIRONMENT_CONFIG';
  const RUN_ID_FIELD = 'Seed Run ID';
  const ITEM_ID_FIELD = 'Seed Item ID';

  const RUN_HEADERS = ['Seed Run ID', 'Environment', 'Status', 'Items Seeded', 'Items Skipped', 'Items Failed', 'Report JSON', 'Started At', 'Finished At', 'Created At', 'Updated At'];
  const ITEM_HEADERS = ['Seed Item ID', 'Seed Run ID', 'Category', 'Name', 'Status', 'Message', 'Details JSON', 'Created At', 'Updated At'];
  const INSPECTION_HEADERS = ['Template ID', 'Name', 'Category', 'Property Type', 'Checklist JSON', 'Required Photos JSON', 'Signature Required', 'Active', 'Created At', 'Updated At'];
  const DASHBOARD_HEADERS = ['Setting ID', 'Dashboard', 'Setting', 'Value', 'Description', 'Active', 'Created At', 'Updated At'];
  const ENV_HEADERS = ['Config ID', 'Environment', 'Key', 'Value', 'Description', 'Active', 'Created At', 'Updated At'];

  const LOOKUP_PACK = [
    ['Inspection Type', 'Occupancy Inspection', 1, true], ['Inspection Type', 'REO Initial Inspection', 2, true], ['Inspection Type', 'Preservation Inspection', 3, true], ['Inspection Type', 'Rehab Inspection', 4, true], ['Inspection Type', 'Final QC', 5, true],
    ['AI Agent Type', 'Analysis', 1, true], ['AI Agent Type', 'Workflow', 2, true], ['AI Agent Type', 'Operations', 3, true], ['AI Agent Type', 'Governance', 4, true],
    ['Document Category', 'Before Photos', 1, true], ['Document Category', 'After Photos', 2, true], ['Document Category', 'Invoices', 3, true], ['Document Category', 'Contracts', 4, true], ['Document Category', 'Permits', 5, true],
    ['Deployment Environment', 'Production', 1, true], ['Deployment Environment', 'Staging', 2, true], ['Deployment Environment', 'Testing', 3, true], ['Deployment Environment', 'Development', 4, true]
  ];

  const INSPECTION_TEMPLATES = [
    {
      Name: 'REO Initial Inspection', Category: 'REO', PropertyType: 'Single Family', SignatureRequired: true,
      Checklist: ['Verify occupancy', 'Photograph exterior', 'Photograph all rooms', 'Check utilities', 'Identify hazards', 'Confirm lockbox', 'Assess lawn/debris'],
      RequiredPhotos: ['Front exterior', 'Address verification', 'Kitchen', 'Bathrooms', 'Bedrooms', 'Utility meters', 'Any damage']
    },
    {
      Name: 'Preservation Completion QC', Category: 'Property Preservation', PropertyType: 'Single Family', SignatureRequired: false,
      Checklist: ['Verify scope completed', 'Confirm debris removed', 'Confirm yard serviced', 'Check lock change', 'Confirm winterization if applicable'],
      RequiredPhotos: ['Before work', 'After work', 'Lockbox', 'Trash out area', 'Yard after service']
    },
    {
      Name: 'Maintenance Repair Verification', Category: 'Maintenance', PropertyType: 'Any', SignatureRequired: true,
      Checklist: ['Verify repair completed', 'Verify materials used', 'Check safety conditions', 'Capture invoice reference'],
      RequiredPhotos: ['Before repair', 'After repair', 'Materials', 'Invoice or receipt']
    }
  ];

  const DASHBOARD_SETTINGS = [
    ['Executive Dashboard', 'Default Date Field', 'Created At', 'Default date filter field', true],
    ['Executive Dashboard', 'Show Alerts', 'true', 'Display enterprise alerts', true],
    ['Dashboard Hub', 'Show Recent Activity', 'true', 'Display system log activity', true],
    ['Property Dashboard', 'Maintenance SLA Days', '3', 'Default maintenance SLA threshold', true],
    ['Vendor Dashboard', 'Work Order SLA Days', '2', 'Default vendor work-order SLA threshold', true],
    ['AI Dashboard', 'Default Provider', 'stub', 'Default AI provider until live credentials are configured', true]
  ];

  const ENV_CONFIG = [
    ['Production', 'REOS_ENVIRONMENT', 'Production', 'Current production environment name', true],
    ['Production', 'REOS_DEPLOYMENT_MODE', 'production', 'Deployment mode', true],
    ['Production', 'AI_PROVIDER_MODE', 'stub', 'Use stub AI provider until live provider approval', true],
    ['Production', 'EXTERNAL_API_MODE', 'dry-run', 'Keep external providers in dry-run by default', true],
    ['Production', 'AUTOMATION_MODE', 'review-first', 'Automation starts in review-first mode', true]
  ];

  function ensureSheets() {
    ensureTable_(RUNS_SHEET, RUN_HEADERS);
    ensureTable_(ITEMS_SHEET, ITEM_HEADERS);
    ensureTable_(INSPECTION_TEMPLATES_SHEET, INSPECTION_HEADERS);
    ensureTable_(DASHBOARD_SETTINGS_SHEET, DASHBOARD_HEADERS);
    ensureTable_(ENVIRONMENT_CONFIG_SHEET, ENV_HEADERS);
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
    const runs = latest_(REOS.Database.getAll(RUNS_SHEET), 'Started At', 20);
    const latest = runs[0] || null;
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        runs: runs.length,
        latestStatus: latest ? latest.Status : 'Not Run',
        itemsSeeded: latest ? latest['Items Seeded'] : 0,
        itemsSkipped: latest ? latest['Items Skipped'] : 0,
        itemsFailed: latest ? latest['Items Failed'] : 0
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
    const started = new Date();
    const run = REOS.Database.insert(RUNS_SHEET, {
      Environment: environment,
      Status: 'Running',
      'Items Seeded': 0,
      'Items Skipped': 0,
      'Items Failed': 0,
      'Report JSON': '',
      'Started At': started,
      'Finished At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: RUN_ID_FIELD, idPrefix: 'SEED' });
    const runId = run[RUN_ID_FIELD];
    const items = [];

    add_(items, seedLookups_(runId));
    add_(items, seedAutomationTemplates_(runId));
    add_(items, seedAiAgents_(runId));
    add_(items, seedInspectionTemplates_(runId));
    add_(items, seedDashboardSettings_(runId));
    add_(items, seedEnvironmentConfig_(runId, environment));

    items.forEach(function (item) { persistItem_(runId, item); });
    const failed = items.filter(function (i) { return i.Status === 'Failed'; });
    const skipped = items.filter(function (i) { return i.Status === 'Skipped'; });
    const seeded = items.filter(function (i) { return i.Status === 'Seeded'; });
    const status = failed.length ? 'Needs Review' : 'Complete';
    const report = { runId: runId, environment: environment, status: status, seeded: seeded.length, skipped: skipped.length, failed: failed.length, items: items, generatedAt: REOS.nowIso_() };

    REOS.Database.update(RUNS_SHEET, RUN_ID_FIELD, runId, {
      Status: status,
      'Items Seeded': seeded.length,
      'Items Skipped': skipped.length,
      'Items Failed': failed.length,
      'Report JSON': REOS.toJson_(report),
      'Finished At': new Date(),
      'Updated At': new Date()
    });
    REOS.Logger.audit('Enterprise data seed completed', report);
    return report;
  }

  function getRunItems(runId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(ITEMS_SHEET).filter(function (row) { return row[RUN_ID_FIELD] === runId; });
  }

  function seedLookups_(runId) {
    const items = [];
    const sheet = REOS.getSheet_(REOS.CONFIG.SHEETS.LOOKUPS);
    const rows = sheet.getDataRange().getValues();
    const existing = rows.slice(1).map(function (r) { return String(r[0]) + '|' + String(r[1]); });
    LOOKUP_PACK.forEach(function (lookup) {
      const key = lookup[0] + '|' + lookup[1];
      if (existing.indexOf(key) !== -1) return items.push(item_('Lookups', lookup[1], 'Skipped', 'Lookup already exists.', { category: lookup[0] }));
      sheet.appendRow(lookup);
      items.push(item_('Lookups', lookup[1], 'Seeded', 'Lookup added.', { category: lookup[0] }));
    });
    return items;
  }

  function seedAutomationTemplates_(runId) {
    try {
      if (REOS.AutomationTemplates && typeof REOS.AutomationTemplates.seedTemplates === 'function') {
        const result = REOS.AutomationTemplates.seedTemplates();
        return [item_('Automation Templates', 'Default Automation Templates', result.created ? 'Seeded' : 'Skipped', 'Automation templates ready.', result)];
      }
      return [item_('Automation Templates', 'Default Automation Templates', 'Skipped', 'AutomationTemplates service unavailable.', {})];
    } catch (error) {
      return [item_('Automation Templates', 'Default Automation Templates', 'Failed', error.message, {})];
    }
  }

  function seedAiAgents_(runId) {
    try {
      if (REOS.AIAgents && typeof REOS.AIAgents.seedAgents === 'function') {
        const result = REOS.AIAgents.seedAgents();
        return [item_('AI Agents', 'Default AI Agents', result.created ? 'Seeded' : 'Skipped', 'AI agents ready.', { created: result.created })];
      }
      return [item_('AI Agents', 'Default AI Agents', 'Skipped', 'AIAgents service unavailable.', {})];
    } catch (error) {
      return [item_('AI Agents', 'Default AI Agents', 'Failed', error.message, {})];
    }
  }

  function seedInspectionTemplates_(runId) {
    const existing = REOS.Database.getAll(INSPECTION_TEMPLATES_SHEET).map(function (row) { return String(row.Name || '').toLowerCase(); });
    return INSPECTION_TEMPLATES.map(function (template) {
      if (existing.indexOf(String(template.Name).toLowerCase()) !== -1) return item_('Inspection Templates', template.Name, 'Skipped', 'Template already exists.', {});
      REOS.Database.insert(INSPECTION_TEMPLATES_SHEET, {
        Name: template.Name,
        Category: template.Category,
        'Property Type': template.PropertyType,
        'Checklist JSON': REOS.toJson_(template.Checklist),
        'Required Photos JSON': REOS.toJson_(template.RequiredPhotos),
        'Signature Required': template.SignatureRequired,
        Active: true,
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: 'Template ID', idPrefix: 'ITPL' });
      return item_('Inspection Templates', template.Name, 'Seeded', 'Inspection template added.', {});
    });
  }

  function seedDashboardSettings_(runId) {
    const existing = REOS.Database.getAll(DASHBOARD_SETTINGS_SHEET).map(function (row) { return row.Dashboard + '|' + row.Setting; });
    return DASHBOARD_SETTINGS.map(function (setting) {
      const key = setting[0] + '|' + setting[1];
      if (existing.indexOf(key) !== -1) return item_('Dashboard Settings', key, 'Skipped', 'Dashboard setting already exists.', {});
      REOS.Database.insert(DASHBOARD_SETTINGS_SHEET, {
        Dashboard: setting[0], Setting: setting[1], Value: setting[2], Description: setting[3], Active: setting[4], 'Created At': new Date(), 'Updated At': new Date()
      }, { idField: 'Setting ID', idPrefix: 'DSET' });
      return item_('Dashboard Settings', key, 'Seeded', 'Dashboard setting added.', {});
    });
  }

  function seedEnvironmentConfig_(runId, environment) {
    const existing = REOS.Database.getAll(ENVIRONMENT_CONFIG_SHEET).map(function (row) { return row.Environment + '|' + row.Key; });
    return ENV_CONFIG.map(function (cfg) {
      const key = environment + '|' + cfg[1];
      if (existing.indexOf(key) !== -1) return item_('Environment Config', key, 'Skipped', 'Environment config already exists.', {});
      REOS.Database.insert(ENVIRONMENT_CONFIG_SHEET, {
        Environment: environment, Key: cfg[1], Value: cfg[2], Description: cfg[3], Active: cfg[4], 'Created At': new Date(), 'Updated At': new Date()
      }, { idField: 'Config ID', idPrefix: 'ECFG' });
      PropertiesService.getScriptProperties().setProperty(cfg[1], cfg[2]);
      return item_('Environment Config', key, 'Seeded', 'Environment config added and script property set.', {});
    });
  }

  function persistItem_(runId, item) {
    return REOS.Database.insert(ITEMS_SHEET, {
      [RUN_ID_FIELD]: runId,
      Category: item.Category,
      Name: item.Name,
      Status: item.Status,
      Message: item.Message,
      'Details JSON': REOS.toJson_(item.Details || {}),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: ITEM_ID_FIELD, idPrefix: 'SITM' });
  }

  function item_(category, name, status, message, details) { return { Category: category, Name: name, Status: status, Message: message, Details: details || {} }; }
  function add_(target, items) { (items || []).forEach(function (item) { target.push(item); }); }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 20); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, runEnterpriseSeed: runEnterpriseSeed, getRunItems: getRunItems };
})();

function reosDataSeederEnsureSheets() { return REOS.DataSeeder.ensureSheets(); }
function reosDataSeederDashboard() { return REOS.DataSeeder.getDashboard(); }
function reosDataSeederRun(options) { return REOS.DataSeeder.runEnterpriseSeed(options || {}); }
function reosDataSeederItems(runId) { return REOS.DataSeeder.getRunItems(runId); }
function showDataSeeder() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('DataSeeder').setTitle('REOS Data Seeder').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Data Seeder');
}
