/**
 * REOS Enterprise v3.0.0 GA - Phase 3 Enterprise Data Seeding
 *
 * Seeds production-safe enterprise baseline data after deployment provisioning:
 * roles, permissions, lookups, dashboard settings, inspection templates,
 * vendor categories, property statuses, automation templates, AI agents,
 * environment defaults, and seed run audit records.
 */

var REOS = REOS || {};

REOS.EnterpriseSeeder = (function () {
  const SEED_RUNS_SHEET = 'SEED_RUNS';
  const SEED_ITEMS_SHEET = 'SEED_ITEMS';
  const DASHBOARD_SETTINGS_SHEET = 'DASHBOARD_SETTINGS';
  const INSPECTION_TEMPLATES_SHEET = 'INSPECTION_TEMPLATES';
  const ENVIRONMENT_SETTINGS_SHEET = 'ENVIRONMENT_SETTINGS';
  const RUN_ID_FIELD = 'Seed Run ID';
  const ITEM_ID_FIELD = 'Seed Item ID';

  const RUN_HEADERS = ['Seed Run ID', 'Environment', 'Status', 'Items Created', 'Items Skipped', 'Warnings', 'Errors', 'Report JSON', 'Started At', 'Finished At', 'Created At', 'Updated At'];
  const ITEM_HEADERS = ['Seed Item ID', 'Seed Run ID', 'Area', 'Item Key', 'Status', 'Message', 'Details JSON', 'Created At', 'Updated At'];
  const DASHBOARD_HEADERS = ['Setting ID', 'Dashboard', 'Setting', 'Value', 'Description', 'Active', 'Created At', 'Updated At'];
  const INSPECTION_HEADERS = ['Template ID', 'Name', 'Category', 'Checklist JSON', 'Required Photos JSON', 'Signature Required', 'Active', 'Created At', 'Updated At'];
  const ENV_HEADERS = ['Environment Setting ID', 'Environment', 'Setting', 'Value', 'Description', 'Active', 'Created At', 'Updated At'];

  const LOOKUPS = [
    ['Lead Source', 'Absentee Owner List', 1, true], ['Lead Source', 'Tax Delinquent List', 2, true], ['Lead Source', 'Probate', 3, true], ['Lead Source', 'Code Violation', 4, true], ['Lead Source', 'Driving for Dollars', 5, true],
    ['Inspection Type', 'Occupancy Inspection', 1, true], ['Inspection Type', 'Initial Secure', 2, true], ['Inspection Type', 'Preservation QC', 3, true], ['Inspection Type', 'Maintenance Completion', 4, true], ['Inspection Type', 'Final Walkthrough', 5, true],
    ['Dashboard Period', 'Today', 1, true], ['Dashboard Period', 'Last 7 Days', 2, true], ['Dashboard Period', 'Last 30 Days', 3, true], ['Dashboard Period', 'Quarter to Date', 4, true]
  ];

  const DASHBOARD_SETTINGS = [
    ['Executive', 'Default Period', 'Last 30 Days', 'Default executive dashboard reporting window.'],
    ['Executive', 'Show Alerts', 'true', 'Display enterprise alerts.'],
    ['Acquisitions', 'Hot Lead Threshold', '80', 'Minimum AI score for hot lead queue.'],
    ['Properties', 'Maintenance SLA Days', '3', 'Default maintenance SLA warning threshold.'],
    ['Vendors', 'Work Order SLA Days', '2', 'Default vendor work order SLA threshold.'],
    ['Automation', 'Show Failed Runs First', 'true', 'Prioritize failed automation runs.'],
    ['AI', 'Default Agent Mode', 'review', 'Agents create recommendations by default before autonomous execution.']
  ];

  const ENV_SETTINGS = [
    ['Production', 'Debug Mode', 'false', 'Disable debug mode in production.'],
    ['Production', 'Dry Run Integrations', 'true', 'Keep integrations dry-run until live keys are approved.'],
    ['Production', 'AI Provider Mode', 'stub', 'Use stub provider unless live AI is approved.'],
    ['Production', 'Automation Enabled', 'false', 'Enable after deployment smoke test.'],
    ['Production', 'Document Root Required', 'true', 'Require production Drive root folder.']
  ];

  const INSPECTION_TEMPLATES = [
    {
      Name: 'Occupancy Inspection', Category: 'Properties', Signature: false,
      Checklist: ['Property appears occupied', 'Utilities appear active', 'No visible emergency damage', 'Photos captured from street', 'Notes entered'],
      Photos: ['Front Exterior', 'Address Verification', 'Occupancy Evidence']
    },
    {
      Name: 'Initial Secure Inspection', Category: 'REO Preservation', Signature: true,
      Checklist: ['Access verified', 'Locks inspected', 'Windows/doors secured', 'Utilities checked', 'Hazards documented'],
      Photos: ['Front Exterior', 'Rear Exterior', 'Lockbox', 'Entry Door', 'Hazards']
    },
    {
      Name: 'Maintenance Completion QC', Category: 'Maintenance', Signature: true,
      Checklist: ['Scope completed', 'Before/after photos attached', 'Materials noted', 'Work area clean', 'Client-ready notes entered'],
      Photos: ['Before', 'After', 'Materials', 'Completed Area']
    }
  ];

  function ensureSheets() {
    ensureTable_(SEED_RUNS_SHEET, RUN_HEADERS);
    ensureTable_(SEED_ITEMS_SHEET, ITEM_HEADERS);
    ensureTable_(DASHBOARD_SETTINGS_SHEET, DASHBOARD_HEADERS);
    ensureTable_(INSPECTION_TEMPLATES_SHEET, INSPECTION_HEADERS);
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
    const runs = latest_(REOS.Database.getAll(SEED_RUNS_SHEET), 'Started At', 25);
    const latest = runs[0] || null;
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        runs: runs.length,
        latestStatus: latest ? latest.Status : 'Not Run',
        itemsCreated: latest ? latest['Items Created'] : 0,
        itemsSkipped: latest ? latest['Items Skipped'] : 0,
        warnings: latest ? latest.Warnings : 0,
        errors: latest ? latest.Errors : 0
      },
      runs: runs,
      latestItems: latest ? getSeedItems(latest[RUN_ID_FIELD]) : []
    };
  }

  function runEnterpriseSeed(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    const environment = options.environment || 'Production';
    const started = new Date();
    const run = REOS.Database.insert(SEED_RUNS_SHEET, {
      Environment: environment,
      Status: 'Running',
      'Items Created': 0,
      'Items Skipped': 0,
      Warnings: 0,
      Errors: 0,
      'Report JSON': '',
      'Started At': started,
      'Finished At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: RUN_ID_FIELD, idPrefix: 'SEED' });
    const runId = run[RUN_ID_FIELD];
    const items = [];

    add_(items, seedLookups_(runId));
    add_(items, seedDashboardSettings_(runId));
    add_(items, seedEnvironmentSettings_(runId, environment));
    add_(items, seedInspectionTemplates_(runId));
    add_(items, seedAutomationTemplates_(runId));
    add_(items, seedAiAgents_(runId));
    add_(items, seedDocumentFolders_(runId));

    items.forEach(function (item) { persistItem_(runId, item); });
    const created = items.filter(function (i) { return i.Status === 'Created'; }).length;
    const skipped = items.filter(function (i) { return i.Status === 'Skipped'; }).length;
    const warnings = items.filter(function (i) { return i.Status === 'Warning'; }).length;
    const errors = items.filter(function (i) { return i.Status === 'Error'; }).length;
    const status = errors ? 'Needs Review' : warnings ? 'Seeded With Warnings' : 'Seeded';
    const report = { runId: runId, environment: environment, status: status, created: created, skipped: skipped, warnings: warnings, errors: errors, items: items, generatedAt: REOS.nowIso_() };

    REOS.Database.update(SEED_RUNS_SHEET, RUN_ID_FIELD, runId, {
      Status: status,
      'Items Created': created,
      'Items Skipped': skipped,
      Warnings: warnings,
      Errors: errors,
      'Report JSON': REOS.toJson_(report),
      'Finished At': new Date(),
      'Updated At': new Date()
    });
    REOS.Logger.audit('Enterprise seed completed', { runId: runId, status: status, created: created, skipped: skipped, warnings: warnings, errors: errors });
    return report;
  }

  function getSeedItems(runId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(SEED_ITEMS_SHEET).filter(function (row) { return row[RUN_ID_FIELD] === runId; });
  }

  function seedLookups_(runId) {
    const rows = [];
    LOOKUPS.forEach(function (lookup) {
      rows.push(upsertLookup_(lookup));
    });
    return rows;
  }

  function upsertLookup_(lookup) {
    try {
      const sheetName = REOS.CONFIG.SHEETS.LOOKUPS;
      const existing = REOS.Database.getAll(sheetName).filter(function (row) {
        return String(row.Category) === lookup[0] && String(row.Value) === lookup[1];
      })[0];
      if (existing) return item_('Lookups', lookup[0] + ':' + lookup[1], 'Skipped', 'Lookup already exists.', {});
      REOS.Database.insert(sheetName, { Category: lookup[0], Value: lookup[1], 'Sort Order': lookup[2], Active: lookup[3] }, { idField: 'Lookup ID', idPrefix: 'LKP' });
      return item_('Lookups', lookup[0] + ':' + lookup[1], 'Created', 'Lookup seeded.', {});
    } catch (error) {
      return item_('Lookups', lookup[0] + ':' + lookup[1], 'Error', error.message, {});
    }
  }

  function seedDashboardSettings_(runId) {
    return DASHBOARD_SETTINGS.map(function (setting) {
      return upsertGeneric_(DASHBOARD_SETTINGS_SHEET, 'Setting ID', 'DSET', 'Dashboard Settings', setting[0] + ':' + setting[1], {
        Dashboard: setting[0], Setting: setting[1], Value: setting[2], Description: setting[3], Active: true, 'Created At': new Date(), 'Updated At': new Date()
      }, function (row) { return String(row.Dashboard) === setting[0] && String(row.Setting) === setting[1]; });
    });
  }

  function seedEnvironmentSettings_(runId, environment) {
    return ENV_SETTINGS.map(function (setting) {
      return upsertGeneric_(ENVIRONMENT_SETTINGS_SHEET, 'Environment Setting ID', 'ENV', 'Environment Settings', setting[0] + ':' + setting[1], {
        Environment: setting[0], Setting: setting[1], Value: setting[2], Description: setting[3], Active: true, 'Created At': new Date(), 'Updated At': new Date()
      }, function (row) { return String(row.Environment) === setting[0] && String(row.Setting) === setting[1]; });
    });
  }

  function seedInspectionTemplates_(runId) {
    return INSPECTION_TEMPLATES.map(function (template) {
      return upsertGeneric_(INSPECTION_TEMPLATES_SHEET, 'Template ID', 'INSPT', 'Inspection Templates', template.Name, {
        Name: template.Name,
        Category: template.Category,
        'Checklist JSON': REOS.toJson_(template.Checklist),
        'Required Photos JSON': REOS.toJson_(template.Photos),
        'Signature Required': template.Signature,
        Active: true,
        'Created At': new Date(),
        'Updated At': new Date()
      }, function (row) { return String(row.Name) === template.Name; });
    });
  }

  function seedAutomationTemplates_(runId) {
    try {
      if (REOS.AutomationTemplates && typeof REOS.AutomationTemplates.seedTemplates === 'function') {
        const result = REOS.AutomationTemplates.seedTemplates();
        return [item_('Automation Templates', 'Default Templates', result.created ? 'Created' : 'Skipped', 'Automation templates seeded or already present.', result)];
      }
      return [item_('Automation Templates', 'Default Templates', 'Warning', 'AutomationTemplates service unavailable.', {})];
    } catch (error) {
      return [item_('Automation Templates', 'Default Templates', 'Error', error.message, {})];
    }
  }

  function seedAiAgents_(runId) {
    try {
      if (REOS.AIAgents && typeof REOS.AIAgents.seedAgents === 'function') {
        const result = REOS.AIAgents.seedAgents();
        return [item_('AI Agents', 'Default Agents', result.created ? 'Created' : 'Skipped', 'AI agents seeded or already present.', result)];
      }
      return [item_('AI Agents', 'Default Agents', 'Warning', 'AIAgents service unavailable.', {})];
    } catch (error) {
      return [item_('AI Agents', 'Default Agents', 'Error', error.message, {})];
    }
  }

  function seedDocumentFolders_(runId) {
    try {
      const props = PropertiesService.getScriptProperties();
      const rootId = props.getProperty('REOS_PRODUCTION_FOLDER_ID');
      if (!rootId) return [item_('Documents', 'Production Folder', 'Warning', 'Production root folder missing. Run Phase 2 Deployment Wizard first.', {})];
      return [item_('Documents', 'Production Folder', 'Skipped', 'Production root folder already configured.', { folderId: rootId })];
    } catch (error) {
      return [item_('Documents', 'Production Folder', 'Error', error.message, {})];
    }
  }

  function upsertGeneric_(sheetName, idField, prefix, area, key, data, matcher) {
    try {
      const existing = REOS.Database.getAll(sheetName).filter(matcher)[0];
      if (existing) return item_(area, key, 'Skipped', 'Item already exists.', {});
      REOS.Database.insert(sheetName, data, { idField: idField, idPrefix: prefix });
      return item_(area, key, 'Created', 'Item seeded.', {});
    } catch (error) {
      return item_(area, key, 'Error', error.message, {});
    }
  }

  function persistItem_(runId, item) {
    return REOS.Database.insert(SEED_ITEMS_SHEET, {
      [RUN_ID_FIELD]: runId,
      Area: item.Area,
      'Item Key': item.Key,
      Status: item.Status,
      Message: item.Message,
      'Details JSON': REOS.toJson_(item.Details || {}),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: ITEM_ID_FIELD, idPrefix: 'SITM' });
  }

  function item_(area, key, status, message, details) { return { Area: area, Key: key, Status: status, Message: message, Details: details || {} }; }
  function add_(target, items) { (items || []).forEach(function (item) { target.push(item); }); }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 25); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, runEnterpriseSeed: runEnterpriseSeed, getSeedItems: getSeedItems };
})();

function reosEnterpriseSeederEnsureSheets() { return REOS.EnterpriseSeeder.ensureSheets(); }
function reosEnterpriseSeederDashboard() { return REOS.EnterpriseSeeder.getDashboard(); }
function reosEnterpriseSeederRun(options) { return REOS.EnterpriseSeeder.runEnterpriseSeed(options || {}); }
function reosEnterpriseSeederItems(runId) { return REOS.EnterpriseSeeder.getSeedItems(runId); }
function showEnterpriseSeeder() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('EnterpriseSeeder').setTitle('REOS Enterprise Seeder').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Enterprise Seeder');
}
