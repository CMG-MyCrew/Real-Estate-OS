/**
 * REOS Enterprise v3.0 - Automation Rule Templates Library
 *
 * Sprint 8.10 foundation for reusable automation templates.
 * Creates production-safe rule blueprints and can generate active/inactive
 * automation rules from templates through REOS.Automation.
 */

var REOS = REOS || {};

REOS.AutomationTemplates = (function () {
  const TEMPLATES_SHEET = 'AUTOMATION_TEMPLATES';
  const TEMPLATE_ID_FIELD = 'Template ID';
  const TEMPLATE_HEADERS = [
    'Template ID', 'Name', 'Category', 'Event', 'Module', 'Condition JSON',
    'Action', 'Action JSON', 'Default Active', 'Description', 'Created At', 'Updated At'
  ];

  const TEMPLATE_SEED = [
    {
      Name: 'Daily Acquisition Follow-up Scanner',
      Category: 'Acquisitions',
      Event: 'daily.run',
      Module: 'Acquisitions',
      Condition: { hasNextFollowUp: true, excludeStatuses: ['Closed', 'Lost'] },
      Action: 'scanFollowUps',
      ActionPayload: { createTasks: true, dedupeOpenTasks: true },
      DefaultActive: true,
      Description: 'Creates follow-up tasks for acquisition leads with due or overdue next follow-up dates.'
    },
    {
      Name: 'Daily Overdue Task Escalation',
      Category: 'Tasks',
      Event: 'daily.run',
      Module: 'Tasks',
      Condition: { statusNot: 'Completed', dueBefore: 'today' },
      Action: 'scanOverdueTasks',
      ActionPayload: { escalatePriorityTo: 'Critical' },
      DefaultActive: true,
      Description: 'Escalates overdue open tasks to Critical priority.'
    },
    {
      Name: 'Hourly Hot Acquisition Review',
      Category: 'Acquisitions',
      Event: 'hourly.run',
      Module: 'Acquisitions',
      Condition: { priority: ['High', 'Critical'], status: 'New' },
      Action: 'reviewAcquisitionLeads',
      ActionPayload: { moveToStage: 'Skip Trace' },
      DefaultActive: true,
      Description: 'Reviews high-priority new acquisition leads and promotes them to Skip Trace.'
    },
    {
      Name: 'AI Next Best Action Queue',
      Category: 'AI',
      Event: 'manual.run',
      Module: 'AI',
      Condition: { priority: ['High', 'Critical'], aiEnabled: true },
      Action: 'aiRecommendNextBestActions',
      ActionPayload: { limit: 50, createTasks: false },
      DefaultActive: false,
      Description: 'Generates AI next-best-action recommendations for acquisition opportunities.'
    },
    {
      Name: 'Vendor Work Order Review',
      Category: 'Vendors',
      Event: 'daily.run',
      Module: 'Vendors',
      Condition: { status: ['New', 'Assigned', 'Scheduled', 'In Progress'], dueBefore: 'today' },
      Action: 'scanOverdueTasks',
      ActionPayload: { relatedType: 'Work Order', escalatePriorityTo: 'Critical' },
      DefaultActive: false,
      Description: 'Template placeholder for reviewing overdue vendor work-order related tasks.'
    },
    {
      Name: 'Maintenance Backlog Review',
      Category: 'Properties',
      Event: 'daily.run',
      Module: 'Properties',
      Condition: { maintenanceStatusNot: ['Completed', 'Cancelled'], dueBefore: 'today' },
      Action: 'scanOverdueTasks',
      ActionPayload: { relatedType: 'Maintenance', escalatePriorityTo: 'Critical' },
      DefaultActive: false,
      Description: 'Template placeholder for maintenance backlog escalation through task automation.'
    }
  ];

  function ensureSheets() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(TEMPLATES_SHEET);
    if (!sheet) sheet = ss.insertSheet(TEMPLATES_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, TEMPLATE_HEADERS.length).setValues([TEMPLATE_HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, TEMPLATE_HEADERS.length).setFontWeight('bold').setWrap(true);
      sheet.autoResizeColumns(1, TEMPLATE_HEADERS.length);
    }
    return sheet;
  }

  function seedTemplates() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const existing = REOS.Database.getAll(TEMPLATES_SHEET);
    const names = existing.map(function (row) { return String(row.Name || '').toLowerCase(); });
    let created = 0;
    TEMPLATE_SEED.forEach(function (template) {
      if (names.indexOf(String(template.Name).toLowerCase()) !== -1) return;
      REOS.Database.insert(TEMPLATES_SHEET, normalizeTemplate_(template), { idField: TEMPLATE_ID_FIELD, idPrefix: 'ART' });
      created++;
    });
    if (created) REOS.Logger.audit('Automation templates seeded', { created: created });
    return { ok: true, created: created, total: existing.length + created };
  }

  function listTemplates(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    let rows = REOS.Database.getAll(TEMPLATES_SHEET);
    if (options.category) rows = rows.filter(function (row) { return String(row.Category || '') === String(options.category); });
    return rows;
  }

  function getTemplate(templateId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const template = REOS.Database.findById(TEMPLATES_SHEET, TEMPLATE_ID_FIELD, templateId);
    if (!template) throw new Error('Automation template not found: ' + templateId);
    return template;
  }

  function createRuleFromTemplate(templateId, overrides) {
    REOS.Security.requireAdmin();
    if (!REOS.Automation || typeof REOS.Automation.createRule !== 'function') throw new Error('Automation service unavailable.');
    const template = getTemplate(templateId);
    overrides = overrides || {};
    const rule = {
      Name: overrides.Name || template.Name,
      Event: overrides.Event || template.Event,
      Module: overrides.Module || template.Module,
      'Condition JSON': overrides['Condition JSON'] || template['Condition JSON'] || '{}',
      Action: overrides.Action || template.Action,
      'Action JSON': overrides['Action JSON'] || template['Action JSON'] || '{}',
      Active: overrides.Active !== undefined ? overrides.Active : template['Default Active'] === true
    };
    const created = REOS.Automation.createRule(rule);
    REOS.Logger.audit('Automation rule created from template', { templateId: templateId, ruleId: created['Rule ID'] });
    return { ok: true, template: template, rule: created };
  }

  function getDashboard() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const templates = listTemplates();
    const byCategory = templates.reduce(function (map, template) {
      const key = template.Category || 'Uncategorized';
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        templates: templates.length,
        defaultActive: templates.filter(function (t) { return t['Default Active'] === true; }).length,
        categories: Object.keys(byCategory).length
      },
      byCategory: byCategory,
      templates: templates
    };
  }

  function normalizeTemplate_(template) {
    return {
      Name: template.Name,
      Category: template.Category || 'General',
      Event: template.Event || 'manual.run',
      Module: template.Module || 'System',
      'Condition JSON': REOS.toJson_(template.Condition || {}),
      Action: template.Action,
      'Action JSON': REOS.toJson_(template.ActionPayload || {}),
      'Default Active': template.DefaultActive === true,
      Description: template.Description || '',
      'Created At': new Date(),
      'Updated At': new Date()
    };
  }

  return {
    ensureSheets: ensureSheets,
    seedTemplates: seedTemplates,
    listTemplates: listTemplates,
    getTemplate: getTemplate,
    createRuleFromTemplate: createRuleFromTemplate,
    getDashboard: getDashboard
  };
})();

function reosAutomationTemplatesEnsureSheets() { return REOS.AutomationTemplates.ensureSheets(); }
function reosAutomationTemplatesSeed() { return REOS.AutomationTemplates.seedTemplates(); }
function reosAutomationTemplatesList(options) { return REOS.AutomationTemplates.listTemplates(options || {}); }
function reosAutomationTemplatesGet(templateId) { return REOS.AutomationTemplates.getTemplate(templateId); }
function reosAutomationTemplatesCreateRule(templateId, overrides) { return REOS.AutomationTemplates.createRuleFromTemplate(templateId, overrides || {}); }
function reosAutomationTemplatesDashboard() { return REOS.AutomationTemplates.getDashboard(); }
function showAutomationTemplates() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('AutomationTemplatesUI').setTitle('REOS Automation Templates').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Automation Templates');
}
