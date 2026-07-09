/**
 * REOS Enterprise v3.4.7
 * Sprint 5.4 Increment 3 — Acquisition Task Engine
 */

var REOS = REOS || {};

REOS.AcquisitionTaskEngine = (function () {
  var TEMPLATES = 'ACQUISITION_TASK_TEMPLATES';
  var QUEUE = 'ACQUISITION_TASK_QUEUE';
  var HISTORY = 'ACQUISITION_TASK_HISTORY';

  function ensureSheets() {
    REOS.Database.ensureTable(TEMPLATES, ['Template ID','Stage','Task Name','Owner Role','Priority','Due Hours','Required','Active','Created At']);
    REOS.Database.ensureTable(QUEUE, ['Acquisition Task ID','Deal ID','Stage','Task Name','Owner Role','Priority','Due At','Status','Required','Created At','Completed At','Notes']);
    REOS.Database.ensureTable(HISTORY, ['Task History ID','Acquisition Task ID','Deal ID','Action','Previous Status','New Status','Notes','Changed By','Changed At']);
  }

  function seedTemplates() {
    ensureSheets();
    var templates = [
      ['Lead','Review lead','Acquisition Manager','High',24,true],
      ['Lead','Verify owner','Acquisition Manager','High',24,true],
      ['Lead','Validate property address','Acquisition Manager','Medium',24,true],

      ['Property Review','Pull county data','Acquisition Manager','High',24,true],
      ['Property Review','Check taxes','Acquisition Manager','Medium',48,true],
      ['Property Review','Verify ownership','Acquisition Manager','High',24,true],

      ['Initial Analysis','Estimate repairs','Acquisition Manager','High',48,true],
      ['Initial Analysis','Calculate MAO','Acquisition Manager','High',24,true],
      ['Initial Analysis','Review exit strategy','Acquisition Manager','Medium',48,true],

      ['Comparable Analysis','Pull comps','Acquisition Manager','High',24,true],
      ['Comparable Analysis','Review ARV','Acquisition Manager','High',24,true],
      ['Comparable Analysis','Validate neighborhood','Acquisition Manager','Medium',48,false],

      ['Offer Generation','Generate offers','Acquisition Manager','High',24,true],
      ['Offer Generation','Review offer strategy','Acquisition Manager','High',24,true],

      ['Offer Submitted','Seller follow-up 24hr','Acquisition Manager','High',24,true],
      ['Offer Submitted','Seller follow-up 72hr','Acquisition Manager','Medium',72,true],
      ['Offer Submitted','Update CRM activity','Acquisition Manager','Medium',24,false],

      ['Under Contract','Upload contract','Transaction Coordinator','High',12,true],
      ['Under Contract','Open escrow','Transaction Coordinator','High',24,true],
      ['Under Contract','Schedule inspection','Transaction Coordinator','High',48,true],
      ['Under Contract','Confirm closing timeline','Transaction Coordinator','Medium',48,true],

      ['Due Diligence','Property inspection','Inspector','High',72,true],
      ['Due Diligence','Title search','Legal','High',120,true],
      ['Due Diligence','HOA verification','Transaction Coordinator','Medium',72,false],
      ['Due Diligence','Tax verification','Transaction Coordinator','Medium',72,true],
      ['Due Diligence','Insurance quote','Finance','Medium',48,true],
      ['Due Diligence','Contractor estimate','Contractor','High',72,true],
      ['Due Diligence','Utility verification','Transaction Coordinator','Low',72,false],
      ['Due Diligence','Permit history review','Acquisition Manager','Medium',72,false],

      ['Closing','Closing checklist','Transaction Coordinator','High',72,true],
      ['Closing','Wire verification','Finance','High',24,true],
      ['Closing','Final walkthrough','Acquisition Manager','High',24,true],

      ['Disposition','Create marketing package','Disposition Manager','High',72,true],
      ['Disposition','Notify investor buyers','Disposition Manager','Medium',48,false],
      ['Disposition','Prepare listing assets','Disposition Manager','Medium',72,false]
    ];

    var existing = REOS.Database.getAll(TEMPLATES).map(function (r) {
      return r.Stage + '::' + r['Task Name'];
    });

    var created = 0;

    templates.forEach(function (t) {
      var key = t[0] + '::' + t[1];
      if (existing.indexOf(key) !== -1) return;

      REOS.Database.insert(TEMPLATES, {
        Stage: t[0],
        'Task Name': t[1],
        'Owner Role': t[2],
        Priority: t[3],
        'Due Hours': t[4],
        Required: t[5],
        Active: true,
        'Created At': new Date()
      }, { idField: 'Template ID', idPrefix: 'ATPL' });

      created++;
    });

    return { ok: true, templatesCreated: created, totalTemplates: REOS.Database.getAll(TEMPLATES).length };
  }

  function generateForDealStage(dealId, stage) {
    ensureSheets();
    if (!REOS.Database.getAll(TEMPLATES).length) seedTemplates();

    var templates = REOS.Database.getAll(TEMPLATES).filter(function (t) {
      return t.Stage === stage && isTrue_(t.Active);
    });

    var existing = REOS.Database.getAll(QUEUE).map(function (t) {
      return t['Deal ID'] + '::' + t.Stage + '::' + t['Task Name'];
    });

    var created = [];

    templates.forEach(function (template) {
      var key = dealId + '::' + stage + '::' + template['Task Name'];
      if (existing.indexOf(key) !== -1) return;

      var row = REOS.Database.insert(QUEUE, {
        'Deal ID': dealId,
        Stage: stage,
        'Task Name': template['Task Name'],
        'Owner Role': template['Owner Role'],
        Priority: template.Priority,
        'Due At': addHours_(new Date(), Number(template['Due Hours'] || 24)),
        Status: 'Open',
        Required: template.Required,
        'Created At': new Date(),
        'Completed At': '',
        Notes: ''
      }, { idField: 'Acquisition Task ID', idPrefix: 'ATSK' });

      logHistory_(row['Acquisition Task ID'], dealId, 'Created', '', 'Open', 'Task generated from stage template.');
      created.push(row);
    });

    publish_('acquisition.tasks.generated', { dealId: dealId, stage: stage, count: created.length });

    return { ok: true, dealId: dealId, stage: stage, created: created.length, tasks: created };
  }

  function generateForLatestDeal() {
    var pipelineRows = REOS.Database.getAll('ACQUISITION_PIPELINE');
    if (!pipelineRows.length) throw new Error('No acquisition pipelines found.');
    var latest = pipelineRows[pipelineRows.length - 1];
    return generateForDealStage(latest['Deal ID'], latest['Current Stage']);
  }

  function completeTask(taskId, notes) {
    ensureSheets();
    var rows = REOS.Database.getAll(QUEUE).filter(function (r) {
      return r['Acquisition Task ID'] === taskId;
    });
    if (!rows.length) throw new Error('Task not found: ' + taskId);

    var task = rows[0];

    var updated = REOS.Database.update(QUEUE, 'Acquisition Task ID', taskId, {
      Status: 'Completed',
      'Completed At': new Date(),
      Notes: notes || task.Notes || ''
    });

    logHistory_(taskId, task['Deal ID'], 'Completed', task.Status, 'Completed', notes || '');
    publish_('acquisition.task.completed', { taskId: taskId, dealId: task['Deal ID'] });

    return updated;
  }

  function overdue() {
    ensureSheets();
    var now = new Date();
    var rows = REOS.Database.getAll(QUEUE).filter(function (r) {
      return r.Status === 'Open' && r['Due At'] && new Date(r['Due At']) < now;
    });

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      overdue: rows.length,
      tasks: rows
    };
  }

  function summary() {
    ensureSheets();
    var templates = REOS.Database.getAll(TEMPLATES);
    var tasks = REOS.Database.getAll(QUEUE);
    var history = REOS.Database.getAll(HISTORY);
    var now = new Date();

    var overdueCount = tasks.filter(function (r) {
      return r.Status === 'Open' && r['Due At'] && new Date(r['Due At']) < now;
    }).length;

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      templates: templates.length,
      tasks: tasks.length,
      open: tasks.filter(function (r) { return r.Status === 'Open'; }).length,
      completed: tasks.filter(function (r) { return r.Status === 'Completed'; }).length,
      overdue: overdueCount,
      history: history.length,
      byStage: groupCount_(tasks, 'Stage'),
      byRole: groupCount_(tasks, 'Owner Role')
    };
  }

  function logHistory_(taskId, dealId, action, previousStatus, newStatus, notes) {
    return REOS.Database.insert(HISTORY, {
      'Acquisition Task ID': taskId,
      'Deal ID': dealId,
      Action: action,
      'Previous Status': previousStatus || '',
      'New Status': newStatus || '',
      Notes: notes || '',
      'Changed By': currentUser_(),
      'Changed At': new Date()
    }, { idField: 'Task History ID', idPrefix: 'ATH' });
  }

  function addHours_(date, hours) {
    return new Date(date.getTime() + (hours * 60 * 60 * 1000));
  }

  function isTrue_(value) {
    return value === true || String(value).toLowerCase() === 'true';
  }

  function groupCount_(rows, field) {
    return rows.reduce(function (m, r) {
      var key = r[field] || 'Unknown';
      m[key] = (m[key] || 0) + 1;
      return m;
    }, {});
  }

  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) {
      REOS.PluginEventBus.publish(topic, payload, 'acquisitions');
    }
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail(); } catch (e) { return ''; }
  }

  return {
    ensureSheets: ensureSheets,
    seedTemplates: seedTemplates,
    generateForDealStage: generateForDealStage,
    generateForLatestDeal: generateForLatestDeal,
    completeTask: completeTask,
    overdue: overdue,
    summary: summary
  };
})();

function reosAcquisitionTaskEngineEnsureSheets() {
  REOS.AcquisitionTaskEngine.ensureSheets();
  SpreadsheetApp.getUi().alert('Acquisition Task Engine sheets ready.');
}

function reosAcquisitionTaskEngineSeedTemplates() {
  var result = REOS.AcquisitionTaskEngine.seedTemplates();
  SpreadsheetApp.getUi().alert('Acquisition Task Templates Seeded', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionTaskEngineGenerateForLatestDeal() {
  var result = REOS.AcquisitionTaskEngine.generateForLatestDeal();
  SpreadsheetApp.getUi().alert('Acquisition Tasks Generated', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionTaskEngineSummary() {
  var result = REOS.AcquisitionTaskEngine.summary();
  SpreadsheetApp.getUi().alert('Acquisition Task Engine Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionTaskEngineOverdue() {
  var result = REOS.AcquisitionTaskEngine.overdue();
  SpreadsheetApp.getUi().alert('Acquisition Overdue Tasks', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}
