/**
 * REOS Enterprise v3.0 - Workflow Automation Foundation
 *
 * Provides scheduled jobs, trigger management, follow-up scanning,
 * overdue task scanning, acquisition lead review, and automation logging.
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
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.autoResizeColumns(1, headers.length);
    }
    return sheet;
  }

  function getJobs() {
    return JOBS.slice();
  }

  function installTriggers() {
    REOS.Security.requireAdmin();
    removeTriggers(false);
    ensureSheets();

    JOBS.forEach(function (job) {
      let builder = ScriptApp.newTrigger(job.handler).timeBased();
      if (job.cadence === 'hourly') {
        builder = builder.everyHours(1);
      } else {
        builder = builder.everyDays(1).atHour(job.hour || 8);
      }
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
      if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
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
        REOS.CRM.createTask({
          Title: 'Follow up acquisition lead: ' + lead['Property Address'],
          'Related Type': 'Lead',
          'Related ID': lead['Lead ID'],
          'Assigned To': lead['Assigned To'] || REOS.Security.getCurrentUserEmail(),
          Priority: lead.Priority || 'Medium',
          Status: 'Open',
          'Due Date': lead['Next Follow Up'],
          Notes: 'Created by REOS follow-up automation.'
        });
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
      if (task.Active === false) return;
      if (String(task.Status || '').toLowerCase() === 'completed') return;
      if (!task['Due Date']) return;

      const due = startOfDay_(new Date(task['Due Date']));
      if (isNaN(due.getTime()) || due >= today) return;
      overdue++;

      if (String(task.Priority || '') !== 'Critical') {
        REOS.Database.update(REOS.CONFIG.SHEETS.TASKS, 'Task ID', task['Task ID'], {
          Priority: 'Critical',
          Notes: appendNote_(task.Notes, 'Escalated by overdue task automation.'),
          'Updated At': new Date()
        });
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

  function seedDefaultRules() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const existing = REOS.Database.getAll(RULES_SHEET);
    if (existing.length) return { ok: true, seeded: 0, existing: existing.length };

    const defaults = [
      { Name: 'Daily Follow-up Scanner', Event: 'daily.run', Module: 'Acquisitions', Action: 'scanFollowUps', Active: true, 'Run Count': 0 },
      { Name: 'Daily Overdue Task Scanner', Event: 'daily.run', Module: 'Tasks', Action: 'scanOverdueTasks', Active: true, 'Run Count': 0 },
      { Name: 'Hourly Acquisition Review', Event: 'hourly.run', Module: 'Acquisitions', Action: 'reviewAcquisitionLeads', Active: true, 'Run Count': 0 }
    ];

    defaults.forEach(function (rule) {
      REOS.Database.insert(RULES_SHEET, rule, { idField: RULE_ID_FIELD, idPrefix: 'AR' });
    });

    REOS.Logger.audit('Default automation rules seeded', { count: defaults.length });
    return { ok: true, seeded: defaults.length };
  }

  function createRule(rule) {
    REOS.Security.requireAdmin();
    ensureSheets();
    rule = rule || {};
    rule.Active = rule.Active === false ? false : true;
    rule['Run Count'] = Number(rule['Run Count'] || 0);

    const validation = REOS.Validation.validateRecord(rule, { required: ['Name', 'Event', 'Module', 'Action'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    return REOS.Database.insert(RULES_SHEET, rule, { idField: RULE_ID_FIELD, idPrefix: 'AR' });
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
    try {
      switch (String(rule.Action || '')) {
        case 'scanFollowUps': return scanFollowUps();
        case 'scanOverdueTasks': return scanOverdueTasks();
        case 'reviewAcquisitionLeads': return reviewAcquisitionLeads();
        default: throw new Error('Unknown automation action: ' + rule.Action);
      }
    } finally {
      try {
        REOS.Database.update(RULES_SHEET, RULE_ID_FIELD, rule[RULE_ID_FIELD], {
          'Last Run At': new Date(),
          'Run Count': Number(rule['Run Count'] || 0) + 1
        });
      } catch (ignore) {}
    }
  }

  function dailyRun() {
    ensureSheets();
    return runAll();
  }

  function runJob_(key, fn) {
    const startedAt = new Date();
    try {
      const result = fn();
      return { key: key, ok: true, durationMs: new Date().getTime() - startedAt.getTime(), result: result };
    } catch (error) {
      REOS.handleError_('Automation job ' + key, error);
      logRun_(key, 'Error', error.message, { stack: error.stack || '' });
      return { key: key, ok: false, error: error.message };
    }
  }

  function findOpenTask_(relatedType, relatedId, titlePrefix) {
    const tasks = REOS.Database.getAll(REOS.CONFIG.SHEETS.TASKS);
    return tasks.find(function (task) {
      return task.Active !== false &&
        String(task.Status || '').toLowerCase() !== 'completed' &&
        String(task['Related Type'] || '') === String(relatedType || '') &&
        String(task['Related ID'] || '') === String(relatedId || '') &&
        String(task.Title || '').indexOf(titlePrefix) === 0;
    }) || null;
  }

  function logRun_(jobKey, status, message, payload) {
    ensureSheets();
    REOS.Logger.info('AUTOMATION: ' + jobKey, Object.assign({ jobKey: jobKey, status: status }, payload || {}));
    return REOS.Database.insert(RUNS_SHEET, {
      'Rule ID': jobKey,
      Event: jobKey,
      Module: 'Automation',
      'Record ID': 'SYSTEM',
      Status: status,
      Message: message,
      'Payload JSON': REOS.toJson_(payload || {}),
      'Started At': new Date(),
      'Finished At': new Date()
    }, { idField: RUN_ID_FIELD, idPrefix: 'RUN' });
  }

  function log_(action, jobKey, details) {
    REOS.Logger.info('AUTOMATION: ' + action, Object.assign({ jobKey: jobKey, source: AUTOMATION_SOURCE }, details || {}));
  }

  function startOfDay_(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function appendNote_(existing, note) {
    const current = String(existing || '').trim();
    return current ? current + '\n' + REOS.nowIso_() + ' - ' + note : REOS.nowIso_() + ' - ' + note;
  }

  return {
    ensureSheets: ensureSheets,
    getJobs: getJobs,
    installTriggers: installTriggers,
    removeTriggers: removeTriggers,
    runAll: runAll,
    scanFollowUps: scanFollowUps,
    scanOverdueTasks: scanOverdueTasks,
    reviewAcquisitionLeads: reviewAcquisitionLeads,
    seedDefaultRules: seedDefaultRules,
    createRule: createRule,
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
function automationSeedDefaults() { return REOS.Automation.seedDefaultRules(); }
function automationDispatch(eventName, moduleName, payload) { return REOS.Automation.dispatch(eventName, moduleName, payload || {}); }
function automationDailyRun() { return REOS.Automation.dailyRun(); }
