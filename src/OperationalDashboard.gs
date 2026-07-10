/**
 * REOS Enterprise v4.0.1 - Operational Dashboard Phase 1 UI
 * Live KPI cards, charts, searchable tables, filters, and navigation actions.
 */

var REOS = REOS || {};

REOS.OperationalDashboard = (function () {
  var SNAPSHOTS = 'OPERATIONAL_DASHBOARD_SNAPSHOTS';
  var HEADERS = ['Snapshot ID','Generated At','Quality Score','Active Deals','Pipeline Count','Open Tasks','Overdue Tasks','Draft Offers','Portfolio Assets','Portfolio Equity','Projected Profit','Pending Distress Leads','Alerts JSON','Details JSON'];

  function ensureSheets() { REOS.Database.ensureTable(SNAPSHOTS, HEADERS); }

  function getDashboard() {
    ensureSheets();
    var quality = safeCall_(function () { return REOS.AcquisitionQuality.runSmokeTest(); }, { ok: false, score: 0, status: 'Unavailable' });
    var command = safeCall_(function () { return REOS.AcquisitionCommandCenter.buildSnapshot().snapshot; }, {});
    var portfolio = safeCall_(function () { return REOS.PortfolioIntelligence.buildSnapshot().snapshot; }, {});
    var tasks = safeCall_(function () { return REOS.AcquisitionTaskEngine.summary(); }, {});
    var pipeline = safeCall_(function () { return REOS.AcquisitionPipeline.summary(); }, {});
    var workflow = safeCall_(function () { return REOS.AcquisitionWorkflow.summary(); }, {});
    var events = safeCall_(function () { return REOS.PluginEventBus.summary(); }, {});

    var deals = safeAll_('DEALS');
    var analyses = safeAll_('DEAL_ANALYSIS');
    var offers = safeAll_('OFFERS');
    var taskRows = safeAll_('ACQUISITION_TASK_QUEUE');
    var pipelineRows = safeAll_('ACQUISITION_PIPELINE');

    var data = {
      ok: !!quality.ok,
      generatedAt: new Date().toISOString(),
      quality: quality,
      acquisitions: command,
      portfolio: portfolio,
      tasks: tasks,
      pipeline: pipeline,
      workflow: workflow,
      events: events,
      alerts: buildAlerts_(quality, command, portfolio, tasks, pipeline, events),
      charts: {
        pipelineByStage: pipeline.byStage || command.pipelineByStage || {},
        tasksByRole: tasks.byRole || {},
        offersByStatus: groupCount_(offers, 'Status'),
        dealsByCity: groupCount_(deals, 'City')
      },
      records: {
        deals: buildDealRows_(deals, analyses, pipelineRows),
        tasks: buildTaskRows_(taskRows),
        offers: buildOfferRows_(offers)
      },
      quickActions: [
        { key: 'importDistress', label: 'Import Distress Leads', icon: '⇩', functionName: 'reosDistressImporterRun' },
        { key: 'runWorkflow', label: 'Run New Deal Workflow', icon: '▶', functionName: 'reosAcquisitionWorkflowRunAllNewDeals' },
        { key: 'generateTasks', label: 'Generate Latest Deal Tasks', icon: '✓', functionName: 'reosAcquisitionTaskEngineGenerateForLatestDeal' },
        { key: 'refreshCommand', label: 'Refresh Command Center', icon: '↻', functionName: 'reosAcquisitionCommandCenterSnapshot' },
        { key: 'refreshPortfolio', label: 'Refresh Portfolio', icon: '▦', functionName: 'reosPortfolioIntelligenceSnapshot' },
        { key: 'processEvents', label: 'Process Plugin Events', icon: '⚡', functionName: 'reosPluginEventProcessPending' }
      ],
      navigation: [
        { key: 'overview', label: 'Overview' },
        { key: 'pipeline', label: 'Pipeline' },
        { key: 'tasks', label: 'Tasks' },
        { key: 'offers', label: 'Offers' },
        { key: 'portfolio', label: 'Portfolio' }
      ]
    };

    persistSnapshot_(data);
    return data;
  }

  function startOfDay() {
    ensureSheets();
    var steps = [];
    steps.push(runStep_('Quality Check', function () { return REOS.AcquisitionQuality.runSmokeTest(); }));
    steps.push(runStep_('Process Events', function () { return REOS.PluginEventBus.processPending(50); }));
    steps.push(runStep_('Run New Deal Workflows', function () { return REOS.AcquisitionWorkflow.runAllNewDeals(); }));
    steps.push(runStep_('Refresh Command Center', function () { return REOS.AcquisitionCommandCenter.buildSnapshot(); }));
    steps.push(runStep_('Refresh Portfolio', function () { return REOS.PortfolioIntelligence.buildSnapshot(); }));
    steps.push(runStep_('Task Summary', function () { return REOS.AcquisitionTaskEngine.summary(); }));
    var failed = steps.filter(function (step) { return !step.ok; });
    return { ok: failed.length === 0, generatedAt: new Date().toISOString(), steps: steps, failedSteps: failed.length, dashboard: getDashboard() };
  }

  function runQuickAction(key) {
    var action = getDashboard().quickActions.filter(function (item) { return item.key === key; })[0];
    if (!action) throw new Error('Unknown operational action: ' + key);
    if (typeof globalThis[action.functionName] !== 'function') throw new Error('Action function unavailable: ' + action.functionName);
    return globalThis[action.functionName]();
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(SNAPSHOTS);
    return { ok: true, generatedAt: new Date().toISOString(), snapshots: rows.length, latest: rows.length ? rows[rows.length - 1] : null };
  }

  function buildDealRows_(deals, analyses, pipelines) {
    return deals.slice().reverse().slice(0, 100).map(function (deal) {
      var dealId = deal['Deal ID'];
      var analysis = latestMatch_(analyses, 'Deal ID', dealId);
      var pipeline = latestMatch_(pipelines, 'Deal ID', dealId);
      return {
        dealId: dealId,
        address: deal.Address || '', city: deal.City || '', state: deal.State || '',
        source: deal.Source || '', status: deal['Deal Status'] || '',
        stage: pipeline ? pipeline['Current Stage'] : 'Not Started',
        arv: Number((analysis || {}).ARV || 0),
        mao: Number((analysis || {}).MAO || 0),
        profit: Number((analysis || {})['Flip Profit'] || 0),
        roi: Number((analysis || {})['ROI %'] || 0),
        risk: (analysis || {})['Risk Level'] || ''
      };
    });
  }

  function buildTaskRows_(rows) {
    return rows.slice().reverse().slice(0, 150).map(function (r) {
      return { taskId: r['Acquisition Task ID'], dealId: r['Deal ID'], stage: r.Stage || '', task: r['Task Name'] || '', role: r['Owner Role'] || '', priority: r.Priority || '', dueAt: r['Due At'] || '', status: r.Status || '' };
    });
  }

  function buildOfferRows_(rows) {
    return rows.slice().reverse().slice(0, 100).map(function (r) {
      return { offerId: r['Offer ID'], dealId: r['Deal ID'], type: r['Offer Type'] || '', amount: Number(r['Offer Amount'] || 0), status: r.Status || '', updatedAt: r['Updated At'] || r['Created At'] || '' };
    });
  }

  function buildAlerts_(quality, command, portfolio, tasks, pipeline, events) {
    var alerts = [];
    if (!quality.ok) alerts.push({ level: 'critical', title: 'Quality Check Failed', message: 'Acquisition quality score is ' + Number(quality.score || 0) + '.' });
    if (Number(tasks.overdue || 0) > 0) alerts.push({ level: 'warning', title: 'Overdue Tasks', message: tasks.overdue + ' acquisition tasks are overdue.' });
    if (Number(command.pendingDistressLeads || 0) > 0) alerts.push({ level: 'info', title: 'Pending Distress Leads', message: command.pendingDistressLeads + ' leads are waiting to be imported.' });
    if (Number(command.draftOffers || 0) > 0) alerts.push({ level: 'info', title: 'Draft Offers', message: command.draftOffers + ' offers are still in draft.' });
    if (Number(events.pending || 0) > 0) alerts.push({ level: 'warning', title: 'Pending Events', message: events.pending + ' plugin events need processing.' });
    if (Number(pipeline.active || 0) === 0 && Number(command.activeDeals || 0) > 0) alerts.push({ level: 'warning', title: 'Pipeline Coverage', message: 'Deals exist without active pipeline coverage.' });
    if (!alerts.length) alerts.push({ level: 'success', title: 'Operations Ready', message: 'No immediate operational issues detected.' });
    return alerts;
  }

  function persistSnapshot_(data) {
    var command = data.acquisitions || {}, portfolio = data.portfolio || {};
    return REOS.Database.insert(SNAPSHOTS, {
      'Generated At': new Date(), 'Quality Score': Number((data.quality || {}).score || 0), 'Active Deals': Number(command.activeDeals || 0),
      'Pipeline Count': Number(command.pipelineCount || 0), 'Open Tasks': Number(command.openTasks || (data.tasks || {}).open || 0),
      'Overdue Tasks': Number(command.overdueTasks || (data.tasks || {}).overdue || 0), 'Draft Offers': Number(command.draftOffers || 0),
      'Portfolio Assets': Number(portfolio.totalAssets || 0), 'Portfolio Equity': Number(portfolio.totalEquity || 0),
      'Projected Profit': Number(command.projectedProfit || portfolio.projectedProfit || 0), 'Pending Distress Leads': Number(command.pendingDistressLeads || 0),
      'Alerts JSON': REOS.toJson_(data.alerts || []), 'Details JSON': REOS.toJson_(data)
    }, { idField: 'Snapshot ID', idPrefix: 'ODASH' });
  }

  function safeAll_(name) { try { return REOS.Database.getAll(name); } catch (e) { return []; } }
  function latestMatch_(rows, field, value) { var matches = rows.filter(function (r) { return r[field] === value; }); return matches.length ? matches[matches.length - 1] : null; }
  function groupCount_(rows, field) { return rows.reduce(function (m, r) { var k = r[field] || 'Unknown'; m[k] = (m[k] || 0) + 1; return m; }, {}); }
  function runStep_(name, fn) { try { return { name: name, ok: true, result: fn() }; } catch (error) { return { name: name, ok: false, error: error.message }; } }
  function safeCall_(fn, fallback) { try { return fn(); } catch (error) { return fallback; } }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, startOfDay: startOfDay, runQuickAction: runQuickAction, summary: summary };
})();

function reosOperationalDashboardGet() { return REOS.OperationalDashboard.getDashboard(); }
function reosOperationalDashboardStartOfDay() { return REOS.OperationalDashboard.startOfDay(); }
function reosOperationalDashboardRunAction(key) { return REOS.OperationalDashboard.runQuickAction(key); }
function reosOperationalDashboardSummary() { return REOS.OperationalDashboard.summary(); }
function showOperationalDashboard() {
  var html = HtmlService.createHtmlOutputFromFile('OperationalDashboardUI').setTitle('REOS Operational Dashboard').setWidth(1450).setHeight(920);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Operational Dashboard');
}
