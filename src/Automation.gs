/**
 * REOS Enterprise v3.0 - Workflow Automation Engine
 *
 * Provides rule registration, event dispatching, execution logging,
 * and scheduled workflow processing.
 */

var REOS = REOS || {};

REOS.Automation = (function () {
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
    }
    return sheet;
  }

  function seedDefaultRules() {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const existing = REOS.Database.getAll(RULES_SHEET);
    if (existing.length) return existing.length;

    const defaults = [
      {
        Name: 'New Lead Follow-up Task',
        Event: 'lead.created',
        Module: 'CRM',
        Action: 'createTask',
        'Condition JSON': JSON.stringify({ activeOnly: true }),
        'Action JSON': JSON.stringify({ task: 'Follow up with new lead', category: 'Follow-up', priority: 'High', dueInDays: 1 })
      },
      {
        Name: 'Transaction Closing Reminder',
        Event: 'transaction.created',
        Module: 'Transactions',
        Action: 'createTask',
        'Condition JSON': JSON.stringify({ activeOnly: true }),
        'Action JSON': JSON.stringify({ task: 'Review transaction closing timeline', category: 'Transaction', priority: 'High', dueInDays: 1 })
      },
      {
        Name: 'Lease Renewal Reminder',
        Event: 'lease.created',
        Module: 'Rentals',
        Action: 'createTask',
        'Condition JSON': JSON.stringify({ activeOnly: true }),
        'Action JSON': JSON.stringify({ task: 'Review lease renewal', category: 'Rental', priority: 'High', dueInDays: 30 })
      }
    ];

    defaults.forEach(function (rule) {
      rule.Active = true;
      rule['Run Count'] = 0;
      REOS.Database.insert(RULES_SHEET, rule, { idField: RULE_ID_FIELD, idPrefix: 'AR' });
    });

    REOS.Logger.audit('Default automation rules seeded', { count: defaults.length });
    return defaults.length;
  }

  function createRule(rule) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();

    rule = rule || {};
    rule.Active = rule.Active === false ? false : true;
    rule['Run Count'] = Number(rule['Run Count'] || 0);

    const validation = REOS.Validation.validateRecord(rule, {
      required: ['Name', 'Event', 'Module', 'Action']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(RULES_SHEET, rule, {
      idField: RULE_ID_FIELD,
      idPrefix: 'AR'
    });
    REOS.Logger.audit('Automation rule created', { ruleId: created[RULE_ID_FIELD], event: created.Event });
    return created;
  }

  function dispatch(eventName, moduleName, payload) {
    ensureSheets();
    payload = payload || {};

    const rules = REOS.Database.query(RULES_SHEET, function (rule) {
      return rule.Active !== false &&
        String(rule.Event || '') === String(eventName || '') &&
        (!rule.Module || String(rule.Module || '') === String(moduleName || ''));
    });

    return rules.map(function (rule) {
      return executeRule_(rule, eventName, moduleName, payload);
    });
  }

  function executeRule_(rule, eventName, moduleName, payload) {
    const startedAt = new Date();
    let status = 'Success';
    let message = 'Rule executed.';

    try {
      const conditions = parseJson_(rule['Condition JSON']);
      if (!passesConditions_(conditions, payload)) {
        status = 'Skipped';
        message = 'Conditions not met.';
      } else {
        runAction_(rule.Action, parseJson_(rule['Action JSON']), payload);
      }
    } catch (error) {
      status = 'Error';
      message = error.message;
      REOS.Logger.error('Automation rule failed', error, { ruleId: rule[RULE_ID_FIELD], event: eventName });
    }

    const run = REOS.Database.insert(RUNS_SHEET, {
      'Rule ID': rule[RULE_ID_FIELD],
      Event: eventName,
      Module: moduleName,
      'Record ID': payload.recordId || payload['Record ID'] || '',
      Status: status,
      Message: message,
      'Payload JSON': JSON.stringify(payload),
      'Started At': startedAt,
      'Finished At': new Date()
    }, {
      idField: RUN_ID_FIELD,
      idPrefix: 'RUN'
    });

    try {
      REOS.Database.update(RULES_SHEET, RULE_ID_FIELD, rule[RULE_ID_FIELD], {
        'Last Run At': new Date(),
        'Run Count': Number(rule['Run Count'] || 0) + 1
      });
    } catch (ignore) {}

    return run;
  }

  function runAction_(action, config, payload) {
    switch (String(action || '')) {
      case 'createTask':
        return createTaskAction_(config, payload);
      case 'sendEmail':
        return REOS.Notifications.sendEmail(config, payload);
      case 'createCalendarEvent':
        return REOS.Calendar.createEventFromAutomation(config, payload);
      default:
        throw new Error('Unknown automation action: ' + action);
    }
  }

  function createTaskAction_(config, payload) {
    config = config || {};
    const due = new Date();
    due.setDate(due.getDate() + Number(config.dueInDays || 0));
    return REOS.Tasks.create({
      'Client ID': payload.clientId || payload['Client ID'] || '',
      'Lead ID': payload.leadId || payload['Lead ID'] || '',
      Task: config.task || 'Automation task',
      Category: config.category || 'Automation',
      Priority: config.priority || 'Medium',
      'Due Date': due,
      Notes: 'Created by automation for event: ' + (payload.eventName || '')
    });
  }

  function passesConditions_(conditions, payload) {
    conditions = conditions || {};
    if (conditions.activeOnly && payload.Active === false) return false;
    if (conditions.statusEquals && String(payload.Status || '') !== String(conditions.statusEquals)) return false;
    if (conditions.minAmount && Number(payload.Amount || 0) < Number(conditions.minAmount)) return false;
    return true;
  }

  function parseJson_(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error('Invalid automation JSON: ' + error.message);
    }
  }

  function dailyRun() {
    ensureSheets();
    const results = [];
    results.push.apply(results, dispatch('daily.run', 'System', { recordId: 'SYSTEM', eventName: 'daily.run' }));
    try { REOS.Tasks.refreshDaysRemaining(); } catch (error) { REOS.Logger.warn('Daily task refresh failed', { error: error.message }); }
    return results;
  }

  return {
    ensureSheets: ensureSheets,
    seedDefaultRules: seedDefaultRules,
    createRule: createRule,
    dispatch: dispatch,
    dailyRun: dailyRun
  };
})();

function automationSeedDefaults() {
  return REOS.Automation.seedDefaultRules();
}

function automationDispatch(eventName, moduleName, payload) {
  return REOS.Automation.dispatch(eventName, moduleName, payload || {});
}

function automationDailyRun() {
  return REOS.Automation.dailyRun();
}
