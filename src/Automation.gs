/**
 * REOS Enterprise v3.0 - Workflow Automation Foundation
 *
 * Provides scheduled jobs, trigger management, follow-up scanning,
 * overdue task scanning, acquisition lead review, automation run history,
 * rule editor actions, and admin UI support.
 */

var REOS = REOS || {};

REOS.Automation = (function () {
  const AUTOMATION_SOURCE = 'REOS_AUTOMATION';
  const RULES_SHEET = 'AUTOMATION_RULES';
  const RUNS_SHEET = 'AUTOMATION_RUNS';
  const RULE_ID_FIELD = 'Rule ID';
  const RUN_ID_FIELD = 'Run ID';

  const RULE_HEADERS = [
    'Rule ID', 'Name', 'Event', 'Module', 'Condition JSON', 'Action',
    'Action JSON', 'Active', 'Last Run At', 'Run Count', 'Created At', 'Updated At'
  ];

  const RUN_HEADERS = [
    'Run ID', 'Rule ID', 'Event', 'Module', 'Record ID', 'Status',
    'Message', 'Payload JSON', 'Started At', 'Finished At', 'Created At', 'Updated At'
  ];

  const JOBS = [
    { key: 'daily.followups', name: 'Daily Follow-up Scanner', handler: 'reosAutomationDailyFollowUps', cadence: 'daily', hour: 8 },
    { key: 'daily.overdueTasks', name: 'Daily Overdue Task Scanner', handler: 'reosAutomationOverdueTasks', cadence: 'daily', hour: 8 },
    { key: 'hourly.acquisitionReview', name: 'Hourly Acquisition Review', handler: 'reosAutomationAcquisitionReview', cadence: 'hourly' }
  ];

  const ACTIONS = [
    { key: 'scanFollowUps', name: 'Scan Follow-ups', module: 'Acquisitions', description: 'Creates follow-up tasks for due acquisition leads.' },
    { key: 'scanOverdueTasks', name: 'Escalate Overdue Tasks', module: 'Tasks', description: 'Marks overdue tasks as Critical.' },
    { key: 'reviewAcquisitionLeads', name: 'Review Acquisition Leads', module: 'Acquisitions', description: 'Promotes high-priority new leads to Skip Trace.' },
    { key: 'aiRecommendNextBestActions', name: 'AI Recommend Next Best Actions', module: 'AI', description: 'Generates AI next-best-action queue recommendations.' }
  ];

  const EVENTS = ['daily.run', 'hourly.run', 'lead.created', 'lead.updated', 'task.overdue', 'manual.run'];
  const MODULES = ['Acquisitions', 'Tasks', 'CRM', 'Vendors', 'Properties', 'AI', 'System'];

  function ensureSheets() {
    ensureTable_(RULES_SHEET, RULE_HEADERS);
    ensureTable_(RUNS_SHEET, RUN_HEADERS);
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

  function getJobs() { return JOBS.slice(); }
  function getRuleEditorOptions() { return { events: EVENTS, modules: MODULES, actions: ACTIONS, sampleConditionJson: REOS.toJson_({ status: 'New', priority: ['High', 'Critical'] }), sampleActionJson: REOS.toJson_({ limit: 50, createTasks: false }) }; }

  function getInstalledTriggers() {
    const handlers = JOBS.map(function (job) { return job.handler; });
    return ScriptApp.getProjectTriggers()
      .filter(function (trigger) { return handlers.indexOf(trigger.getHandlerFunction()) !== -1; })
      .map(function (trigger) {
        return { handler: trigger.getHandlerFunction(), eventType: String(trigger.getEventType()), source: String(trigger.getTriggerSource()), uniqueId: trigger.getUniqueId ? trigger.getUniqueId() : '' };
      });
  }

  function getRules(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    let rules = REOS.Database.getAll(RULES_SHEET);
    if (options.activeOnly === true) rules = rules.filter(function (rule) { return rule.Active !== false; });
    return latest_(rules, 'Created At', Number(options.limit || 100));
  }

  function getRule(ruleId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const rule = REOS.Database.findById(RULES_SHEET, RULE_ID_FIELD, ruleId);
    if (!rule) throw new Error('Automation rule not found: ' + ruleId);
    return rule;
  }

  function getRuns(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    let runs = REOS.Database.getAll(RUNS_SHEET);
    if (options.status) runs = runs.filter(function (run) { return String(run.Status || '') === String(options.status); });
    if (options.ruleId) runs = runs.filter(function (run) { return String(run['Rule ID'] || '') === String(options.ruleId); });
    return latest_(runs, 'Started At', Number(options.limit || 100));
  }

  function getAdminDashboard() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const jobs = getJobs();
    const triggers = getInstalledTriggers();
    const rules = getRules({ limit: 500 });
    const runs = getRuns({ limit: 100 });
    const failedRuns = runs.filter(function (run) { return String(run.Status || '').toLowerCase() === 'error'; });
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: { jobs: jobs.length, installedTriggers: triggers.length, rules: rules.length, activeRules: rules.filter(function (rule) { return rule.Active !== false; }).length, recentRuns: runs.length, failedRuns: failedRuns.length },
      jobs: jobs.map(function (job) { return Object.assign({}, job, { installed: triggers.some(function (trigger) { return trigger.handler === job.handler; }) }); }),
      triggers: triggers,
      rules: rules,
      recentRuns: runs,
      editorOptions: getRuleEditorOptions()
    };
  }

  function installTriggers() {
    REOS.Security.requireAdmin();
    removeTriggers(false);
    ensureSheets();
    JOBS.forEach(function (job) {
      let builder = ScriptApp.newTrigger(job.handler).timeBased();
      builder = job.cadence === 'hourly' ? builder.everyHours(1) : builder.everyDays(1).atHour(job.hour || 8);
      builder.create();
      log_('TRIGGER_INSTALLED', job.key, { handler: job.handler, cadence: job.cadence });
    });
    REOS.setProperty_('REOS_AUTOMATION_INSTALLED_AT', REOS.nowIso_());
    return { ok: true, installed: JOBS.length, jobs: JOBS };
  }

  function removeTriggers(requireAdmin) {
    if (requireAdmin !== false) REOS.Security.requireAdmin();
    const handlers = JOBS.map(function (job) { return job.handler; });
    let removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) { ScriptApp.deleteTrigger(trigger); removed++; }
    });
    log_('TRIGGERS_REMOVED', 'automation', { removed: removed });
    return { ok: true, removed: removed };
  }

  function runAll() {
    ensureSheets();
    const results = [];
    results.push(runJob_('daily.followups', scanFollowUps));
    results.push(runJob_('daily.overdueTasks', scanOverdueTasks));
    results.push(runJob_('hourly.acquisitionReview', reviewAcquisitionLeads));
    return { ok: results.every(function (item) { return item.ok; }), results: results };
  }

  function runJobByKey(key) {
    REOS.Security.requireAdmin();
    const jobKey = String(key || '').trim();
    if (jobKey === 'daily.followups') return runJob_('daily.followups', scanFollowUps);
    if (jobKey === 'daily.overdueTasks') return runJob_('daily.overdueTasks', scanOverdueTasks);
    if (jobKey === 'hourly.acquisitionReview') return runJob_('hourly.acquisitionReview', reviewAcquisitionLeads);
    throw new Error('Unknown automation job: ' + key);
  }

  function scanFollowUps() {
    const today = startOfDay_(new Date());
    const leads = REOS.Acquisitions && REOS.Acquisitions.listLeads ? REOS.Acquisitions.listLeads({ limit: 1000 }) : [];
    let created = 0;
    leads.forEach(function (lead) {
      if (!lead['Next Follow Up']) return;
      const followUpDate = startOfDay_(new Date(lead['Next Follow Up']));
      if (isNaN(followUpDate.getTime()) || followUpDate > today) return;
      if (['closed', 'lost'].indexOf(String(lead.Status || '').toLowerCase()) !== -1) return;
      const existing = findOpenTask_('Lead', lead['Lead ID'], 'Follow up acquisition lead');
      if (existing) return;
      if (REOS.CRM && REOS.CRM.createTask) {
        REOS.CRM.createTask({ Title: 'Follow up acquisition lead: ' + lead['Property Address'], 'Related Type': 'Lead', 'Related ID': lead['Lead ID'], 'Assigned To': lead['Assigned To'] || REOS.Security.getCurrentUserEmail(), Priority: lead.Priority || 'Medium', Status: 'Open', 'Due Date': lead['Next Follow Up'], Notes: 'Created by REOS follow-up automation.' });
        created++;
      }
    });
    logRun_('daily.followups', 'Success', 'Follow-up scan completed.', { tasksCreated: created });
    return { ok: true, tasksCreated: created };
  }

  function scanOverdueTasks() {
    const today = startOfDay_(new Date());
    const tasks = REOS.Database.getAll(REOS.CONFIG.SHEETS.TASKS);
    let overdue = 0;
    let escalated = 0;
    tasks.forEach(function (task) {
      if (task.Active === false || String(task.Status || '').toLowerCase() === 'completed' || !task['Due Date']) return;
      const due = startOfDay_(new Date(task['Due Date']));
      if (isNaN(due.getTime()) || due >= today) return;
      overdue++;
      if (String(task.Priority || '') !== 'Critical') {
        REOS.Database.update(REOS.CONFIG.SHEETS.TASKS, 'Task ID', task['Task ID'], { Priority: 'Critical', Notes: appendNote_(task.Notes, 'Escalated by overdue task automation.'), 'Updated At': new Date() });
        escalated++;
      }
    });
    logRun_('daily.overdueTasks', 'Success', 'Overdue task scan completed.', { overdue: overdue, escalated: escalated });
    return { ok: true, overdue: overdue, escalated: escalated };
  }

  function reviewAcquisitionLeads() {
    const leads = REOS.Acquisitions && REOS.Acquisitions.listLeads ? REOS.Acquisitions.listLeads({ limit: 1000 }) : [];
    let reviewed = 0;
    let promoted = 0;
    leads.forEach(function (lead) {
      reviewed++;
      const priority = String(lead.Priority || '');
      const status = String(lead.Status || '');
      if ((priority === 'Critical' || priority === 'High') && status === 'New') {
        REOS.Acquisitions.moveStage(lead['Lead ID'], 'Skip Trace', 'Auto-promoted by acquisition review automation.');
        promoted++;
      }
    });
    logRun_('hourly.acquisitionReview', 'Success', 'Acquisition review completed.', { reviewed: reviewed, promoted: promoted });
    return { ok: true, reviewed: reviewed, promoted: promoted };
  }

  function aiRecommendNextBestActions(payload) {
    if (!REOS.AI || typeof REOS.AI.recommendNextBestActionsBatch !== 'function') throw new Error('AI next-best-action service unavailable.');
    const options = payload || { limit: 50 };
    const recommendations = REOS.AI.recommendNextBestActionsBatch(options);
    logRun_('aiRecommendNextBestActions', 'Success', 'AI recommendations generated.', { count: recommendations.length });
    return { ok: true, recommendations: recommendations, count: recommendations.length };
  }

  function seedDefaultRules() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const existing = REOS.Database.getAll(RULES_SHEET);
    if (existing.length) return { ok: true, seeded: 0, existing: existing.length };
    const defaults = [
      { Name: 'Daily Follow-up Scanner', Event: 'daily.run', Module: 'Acquisitions', 'Condition JSON': '{}', Action: 'scanFollowUps', 'Action JSON': '{}', Active: true, 'Run Count': 0 },
      { Name: 'Daily Overdue Task Scanner', Event: 'daily.run', Module: 'Tasks', 'Condition JSON': '{}', Action: 'scanOverdueTasks', 'Action JSON': '{}', Active: true, 'Run Count': 0 },
      { Name: 'Hourly Acquisition Review', Event: 'hourly.run', Module: 'Acquisitions', 'Condition JSON': '{"priority":["High","Critical"]}', Action: 'reviewAcquisitionLeads', 'Action JSON': '{}', Active: true, 'Run Count': 0 }
    ];
    defaults.forEach(function (rule) { REOS.Database.insert(RULES_SHEET, normalizeRule_(rule), { idField: RULE_ID_FIELD, idPrefix: 'AR' }); });
    REOS.Logger.audit('Default automation rules seeded', { count: defaults.length });
    return { ok: true, seeded: defaults.length };
  }

  function createRule(rule) {
    REOS.Security.requireAdmin();
    ensureSheets();
    const normalized = normalizeRule_(rule || {});
    validateRule_(normalized);
    const created = REOS.Database.insert(RULES_SHEET, normalized, { idField: RULE_ID_FIELD, idPrefix: 'AR' });
    REOS.Logger.audit('Automation rule created', { ruleId: created[RULE_ID_FIELD], name: created.Name, action: created.Action });
    return created;
  }

  function updateRule(ruleId, changes) {
    REOS.Security.requireAdmin();
    ensureSheets();
    if (!ruleId) throw new Error('Rule ID is required.');
    const existing = getRule(ruleId);
    const merged = Object.assign({}, existing, changes || {});
    const normalized = normalizeRule_(merged);
    validateRule_(normalized);
    normalized['Updated At'] = new Date();
    delete normalized[RULE_ID_FIELD];
    const updated = REOS.Database.update(RULES_SHEET, RULE_ID_FIELD, ruleId, normalized);
    REOS.Logger.audit('Automation rule updated', { ruleId: ruleId, name: updated.Name, action: updated.Action });
    return updated;
  }

  function saveRule(rule) {
    REOS.Security.requireAdmin();
    rule = rule || {};
    return rule[RULE_ID_FIELD] ? updateRule(rule[RULE_ID_FIELD], rule) : createRule(rule);
  }

  function setRuleActive(ruleId, active) { return updateRule(ruleId, { Active: active === true }); }

  function validateRule(rule) {
    REOS.Security.requireAdmin();
    const normalized = normalizeRule_(rule || {});
    validateRule_(normalized);
    return { ok: true, rule: normalized, condition: parseJson_(normalized['Condition JSON'], 'Condition JSON'), action: parseJson_(normalized['Action JSON'], 'Action JSON') };
  }

  function runRule(ruleId, payload) {
    REOS.Security.requireAdmin();
    const rule = getRule(ruleId);
    const actionPayload = Object.assign({}, parseJson_(rule['Action JSON'], 'Action JSON'), payload || {});
    return executeRule_(rule, rule.Event, rule.Module, actionPayload);
  }

  function dispatch(eventName, moduleName, payload) {
    ensureSheets();
    payload = payload || {};
    const rules = REOS.Database.query(RULES_SHEET, function (rule) {
      return rule.Active !== false && String(rule.Event || '') === String(eventName || '') && (!rule.Module || String(rule.Module || '') === String(moduleName || ''));
    });
    return rules.map(function (rule) { return executeRule_(rule, eventName, moduleName, payload); });
  }

  function executeRule_(rule, eventName, moduleName, payload) {
    const startedAt = new Date();
    let result;
    try {
      const actionPayload = Object.assign({}, parseJson_(rule['Action JSON'], 'Action JSON'), payload || {});
      switch (String(rule.Action || '')) {
        case 'scanFollowUps': result = scanFollowUps(); break;
        case 'scanOverdueTasks': result = scanOverdueTasks(); break;
        case 'reviewAcquisitionLeads': result = reviewAcquisitionLeads(); break;
        case 'aiRecommendNextBestActions': result = aiRecommendNextBestActions(actionPayload); break;
        default: throw new Error('Unknown automation action: ' + rule.Action);
      }
      logRun_(rule[RULE_ID_FIELD] || rule.Action, 'Success', 'Rule executed: ' + (rule.Name || rule.Action), { event: eventName, module: moduleName, result: result, durationMs: new Date().getTime() - startedAt.getTime() });
      return { ok: true, ruleId: rule[RULE_ID_FIELD], action: rule.Action, result: result };
    } catch (error) {
      logRun_(rule[RULE_ID_FIELD] || rule.Action, 'Error', error.message, { event: eventName, module: moduleName, stack: error.stack || '' });
      throw error;
    } finally {
      try { REOS.Database.update(RULES_SHEET, RULE_ID_FIELD, rule[RULE_ID_FIELD], { 'Last Run At': new Date(), 'Run Count': Number(rule['Run Count'] || 0) + 1 }); } catch (ignore) {}
    }
  }

  function dailyRun() { ensureSheets(); return runAll(); }

  function runJob_(key, fn) {
    const startedAt = new Date();
    try { const result = fn(); return { key: key, ok: true, durationMs: new Date().getTime() - startedAt.getTime(), result: result }; }
    catch (error) { REOS.handleError_('Automation job ' + key, error); logRun_(key, 'Error', error.message, { stack: error.stack || '' }); return { key: key, ok: false, error: error.message }; }
  }

  function normalizeRule_(rule) {
    rule = rule || {};
    return {
      'Rule ID': rule['Rule ID'] || '',
      Name: String(rule.Name || '').trim(),
      Event: String(rule.Event || 'manual.run').trim(),
      Module: String(rule.Module || 'System').trim(),
      'Condition JSON': normalizeJsonString_(rule['Condition JSON'] || '{}', 'Condition JSON'),
      Action: String(rule.Action || '').trim(),
      'Action JSON': normalizeJsonString_(rule['Action JSON'] || '{}', 'Action JSON'),
      Active: rule.Active === false || String(rule.Active).toLowerCase() === 'false' ? false : true,
      'Last Run At': rule['Last Run At'] || '',
      'Run Count': Number(rule['Run Count'] || 0),
      'Created At': rule['Created At'] || new Date(),
      'Updated At': new Date()
    };
  }

  function validateRule_(rule) {
    const validation = REOS.Validation.validateRecord(rule, { required: ['Name', 'Event', 'Module', 'Action'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    if (!ACTIONS.some(function (action) { return action.key === rule.Action; })) throw new Error('Unsupported automation action: ' + rule.Action);
    parseJson_(rule['Condition JSON'], 'Condition JSON');
    parseJson_(rule['Action JSON'], 'Action JSON');
    return true;
  }

  function normalizeJsonString_(value, label) { return REOS.toJson_(parseJson_(value || '{}', label)); }
  function parseJson_(value, label) { try { return typeof value === 'object' && value !== null ? value : JSON.parse(String(value || '{}')); } catch (error) { throw new Error(label + ' must be valid JSON. ' + error.message); } }

  function findOpenTask_(relatedType, relatedId, titlePrefix) {
    const tasks = REOS.Database.getAll(REOS.CONFIG.SHEETS.TASKS);
    return tasks.find(function (task) { return task.Active !== false && String(task.Status || '').toLowerCase() !== 'completed' && String(task['Related Type'] || '') === String(relatedType || '') && String(task['Related ID'] || '') === String(relatedId || '') && String(task.Title || '').indexOf(titlePrefix) === 0; }) || null;
  }

  function logRun_(jobKey, status, message, payload) {
    ensureSheets();
    REOS.Logger.info('AUTOMATION: ' + jobKey, Object.assign({ jobKey: jobKey, status: status }, payload || {}));
    return REOS.Database.insert(RUNS_SHEET, { 'Rule ID': jobKey, Event: jobKey, Module: 'Automation', 'Record ID': 'SYSTEM', Status: status, Message: message, 'Payload JSON': REOS.toJson_(payload || {}), 'Started At': new Date(), 'Finished At': new Date() }, { idField: RUN_ID_FIELD, idPrefix: 'RUN' });
  }

  function log_(action, jobKey, details) { REOS.Logger.info('AUTOMATION: ' + action, Object.assign({ jobKey: jobKey, source: AUTOMATION_SOURCE }, details || {})); }
  function startOfDay_(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
  function appendNote_(existing, note) { const current = String(existing || '').trim(); return current ? current + '\n' + REOS.nowIso_() + ' - ' + note : REOS.nowIso_() + ' - ' + note; }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 100); }

  return {
    ensureSheets: ensureSheets,
    getJobs: getJobs,
    getInstalledTriggers: getInstalledTriggers,
    getRules: getRules,
    getRule: getRule,
    getRuns: getRuns,
    getAdminDashboard: getAdminDashboard,
    getRuleEditorOptions: getRuleEditorOptions,
    installTriggers: installTriggers,
    removeTriggers: removeTriggers,
    runAll: runAll,
    runJobByKey: runJobByKey,
    scanFollowUps: scanFollowUps,
    scanOverdueTasks: scanOverdueTasks,
    reviewAcquisitionLeads: reviewAcquisitionLeads,
    aiRecommendNextBestActions: aiRecommendNextBestActions,
    seedDefaultRules: seedDefaultRules,
    createRule: createRule,
    updateRule: updateRule,
    saveRule: saveRule,
    validateRule: validateRule,
    setRuleActive: setRuleActive,
    runRule: runRule,
    dispatch: dispatch,
    dailyRun: dailyRun
  };
})();

function reosAutomationInstallTriggers() { return REOS.Automation.installTriggers(); }
function reosAutomationRemoveTriggers() { return REOS.Automation.removeTriggers(); }
function reosAutomationRunAll() { return REOS.Automation.runAll(); }
function reosAutomationDailyFollowUps() { return REOS.Automation.scanFollowUps(); }
function reosAutomationOverdueTasks() { return REOS.Automation.scanOverdueTasks(); }
function reosAutomationAcquisitionReview() { return REOS.Automation.reviewAcquisitionLeads(); }
function reosAutomationGetJobs() { return REOS.Automation.getJobs(); }
function reosAutomationGetAdminDashboard() { return REOS.Automation.getAdminDashboard(); }
function reosAutomationGetRuleEditorOptions() { return REOS.Automation.getRuleEditorOptions(); }
function reosAutomationGetRule(ruleId) { return REOS.Automation.getRule(ruleId); }
function reosAutomationRunJob(jobKey) { return REOS.Automation.runJobByKey(jobKey); }
function reosAutomationRunRule(ruleId, payload) { return REOS.Automation.runRule(ruleId, payload || {}); }
function reosAutomationSeedDefaults() { return REOS.Automation.seedDefaultRules(); }
function reosAutomationCreateRule(rule) { return REOS.Automation.createRule(rule || {}); }
function reosAutomationUpdateRule(ruleId, changes) { return REOS.Automation.updateRule(ruleId, changes || {}); }
function reosAutomationSaveRule(rule) { return REOS.Automation.saveRule(rule || {}); }
function reosAutomationValidateRule(rule) { return REOS.Automation.validateRule(rule || {}); }
function reosAutomationSetRuleActive(ruleId, active) { return REOS.Automation.setRuleActive(ruleId, active === true); }
function automationSeedDefaults() { return REOS.Automation.seedDefaultRules(); }
function automationDispatch(eventName, moduleName, payload) { return REOS.Automation.dispatch(eventName, moduleName, payload || {}); }
function automationDailyRun() { return REOS.Automation.dailyRun(); }
function showAutomation() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('AutomationUI').setTitle('REOS Automation').setWidth(1200).setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Automation');
}
