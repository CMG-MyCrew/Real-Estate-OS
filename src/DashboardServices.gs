/**
 * REOS Enterprise v4.0.3 - Dashboard Services
 * Phase 1.1 stabilization: read-only, lightweight, resilient dashboard endpoints.
 */
var REOS = REOS || {};

REOS.DashboardServices = (function () {
  function safeAll_(sheet) {
    try { return REOS.Database.getAll(sheet) || []; }
    catch (e) { return []; }
  }

  function group_(rows, field) {
    return rows.reduce(function (m, r) {
      var key = r[field] || 'Unknown';
      m[key] = (m[key] || 0) + 1;
      return m;
    }, {});
  }

  function latest_(rows, field, value) {
    var matches = rows.filter(function (r) { return r[field] === value; });
    return matches.length ? matches[matches.length - 1] : null;
  }

  function last_(rows) { return rows.length ? rows[rows.length - 1] : null; }
  function n_(value) { var n = Number(value || 0); return isNaN(n) ? 0 : n; }
  function iso_() { return new Date().toISOString(); }

  function kpis() {
    var qualityRuns = safeAll_('ACQUISITION_QUALITY_RUNS');
    var quality = last_(qualityRuns) || {};
    var deals = safeAll_('DEALS');
    var pipelines = safeAll_('ACQUISITION_PIPELINE');
    var tasks = safeAll_('ACQUISITION_TASK_QUEUE');
    var offers = safeAll_('OFFERS');
    var assets = safeAll_('PORTFOLIO_ASSETS');
    var distress = safeAll_('DISTRESS_LEADS');
    var analyses = safeAll_('DEAL_ANALYSIS');
    var now = new Date();

    var openTasks = tasks.filter(function (r) { return r.Status === 'Open'; });
    var overdue = openTasks.filter(function (r) {
      return r['Due At'] && new Date(r['Due At']) < now;
    });
    var equity = assets.reduce(function (sum, r) { return sum + n_(r.Equity); }, 0);
    var profit = analyses.reduce(function (sum, r) { return sum + n_(r['Flip Profit']); }, 0);

    return {
      ok: true,
      generatedAt: iso_(),
      values: {
        qualityScore: n_(quality.Score),
        activeDeals: deals.filter(function (r) { return r['Deal Status'] !== 'Closed'; }).length,
        pipelines: pipelines.length,
        openTasks: openTasks.length,
        overdueTasks: overdue.length,
        draftOffers: offers.filter(function (r) { return r.Status === 'Draft'; }).length,
        portfolioAssets: assets.length,
        totalEquity: equity,
        projectedProfit: profit,
        pendingDistressLeads: distress.filter(function (r) { return !r['Imported Deal ID']; }).length
      }
    };
  }

  function pipeline() {
    var rows = safeAll_('ACQUISITION_PIPELINE');
    var deals = safeAll_('DEALS');
    var analyses = safeAll_('DEAL_ANALYSIS');
    return {
      ok: true,
      generatedAt: iso_(),
      byStage: group_(rows, 'Current Stage'),
      records: rows.slice().reverse().slice(0, 150).map(function (p) {
        var d = latest_(deals, 'Deal ID', p['Deal ID']) || {};
        var a = latest_(analyses, 'Deal ID', p['Deal ID']) || {};
        return {
          dealId: p['Deal ID'], address: d.Address || '', city: d.City || '', state: d.State || '',
          stage: p['Current Stage'] || '', status: p.Status || '', assignedTo: p['Assigned To'] || '',
          profit: n_(a['Flip Profit']), roi: n_(a['ROI %']), risk: a['Risk Level'] || ''
        };
      })
    };
  }

  function tasks() {
    var rows = safeAll_('ACQUISITION_TASK_QUEUE');
    var now = new Date();
    return {
      ok: true,
      generatedAt: iso_(),
      byRole: group_(rows, 'Owner Role'),
      byStatus: group_(rows, 'Status'),
      overdue: rows.filter(function (r) {
        return r.Status === 'Open' && r['Due At'] && new Date(r['Due At']) < now;
      }).length,
      records: rows.slice().reverse().slice(0, 200).map(function (r) {
        return {
          taskId: r['Acquisition Task ID'], dealId: r['Deal ID'], stage: r.Stage || '',
          task: r['Task Name'] || '', role: r['Owner Role'] || '', priority: r.Priority || '',
          dueAt: r['Due At'] || '', status: r.Status || ''
        };
      })
    };
  }

  function offers() {
    var rows = safeAll_('OFFERS');
    return {
      ok: true,
      generatedAt: iso_(),
      byStatus: group_(rows, 'Status'),
      records: rows.slice().reverse().slice(0, 150).map(function (r) {
        return {
          offerId: r['Offer ID'], dealId: r['Deal ID'], type: r['Offer Type'] || '',
          amount: n_(r['Offer Amount']), status: r.Status || '', terms: r.Terms || '',
          updatedAt: r['Updated At'] || r['Created At'] || ''
        };
      })
    };
  }

  function portfolio() {
    var assets = safeAll_('PORTFOLIO_ASSETS');
    var performance = safeAll_('PORTFOLIO_PERFORMANCE');
    var totalCost = assets.reduce(function (s, r) { return s + n_(r['Acquisition Price']); }, 0);
    var totalValue = assets.reduce(function (s, r) { return s + n_(r['Current Value']); }, 0);
    var totalEquity = assets.reduce(function (s, r) { return s + n_(r.Equity); }, 0);
    var roiValues = performance.map(function (r) { return n_(r['ROI %']); }).filter(function (v) { return v !== 0; });
    var averageROI = roiValues.length ? roiValues.reduce(function (s, v) { return s + v; }, 0) / roiValues.length : 0;

    return {
      ok: true,
      generatedAt: iso_(),
      snapshot: {
        totalAssets: assets.length,
        activeAssets: assets.filter(function (r) { return r.Status === 'Active'; }).length,
        totalAcquisitionCost: totalCost,
        totalCurrentValue: totalValue,
        totalEquity: totalEquity,
        projectedProfit: totalValue - totalCost,
        averageROI: Math.round(averageROI * 100) / 100
      },
      byStrategy: group_(assets, 'Strategy'),
      byCity: group_(assets, 'City'),
      records: assets.slice().reverse().slice(0, 150)
    };
  }

  function alerts() {
    var quality = last_(safeAll_('ACQUISITION_QUALITY_RUNS')) || {};
    var tasksRows = safeAll_('ACQUISITION_TASK_QUEUE');
    var distress = safeAll_('DISTRESS_LEADS');
    var offersRows = safeAll_('OFFERS');
    var events = safeAll_('PLUGIN_EVENTS');
    var now = new Date();
    var overdue = tasksRows.filter(function (r) {
      return r.Status === 'Open' && r['Due At'] && new Date(r['Due At']) < now;
    }).length;
    var pendingEvents = events.filter(function (r) { return r.Status === 'Pending'; }).length;
    var alerts = [];

    if (quality.Status && quality.Status !== 'Pass') alerts.push({ level: 'critical', title: 'Quality Check Failed', message: 'Latest quality score: ' + n_(quality.Score) });
    if (overdue > 0) alerts.push({ level: 'warning', title: 'Overdue Tasks', message: overdue + ' tasks are overdue.' });
    var pendingLeads = distress.filter(function (r) { return !r['Imported Deal ID']; }).length;
    if (pendingLeads > 0) alerts.push({ level: 'info', title: 'Pending Distress Leads', message: pendingLeads + ' leads await import.' });
    var draftOffers = offersRows.filter(function (r) { return r.Status === 'Draft'; }).length;
    if (draftOffers > 0) alerts.push({ level: 'info', title: 'Draft Offers', message: draftOffers + ' offers remain in draft.' });
    if (pendingEvents > 0) alerts.push({ level: 'warning', title: 'Pending Events', message: pendingEvents + ' events await processing.' });
    if (!alerts.length) alerts.push({ level: 'success', title: 'Operations Ready', message: 'No immediate operational issues detected.' });

    return { ok: true, generatedAt: iso_(), alerts: alerts };
  }

  function bootstrap() {
    return {
      ok: true,
      generatedAt: iso_(),
      navigation: ['overview', 'pipeline', 'tasks', 'offers', 'portfolio'],
      quickActions: [
        { key: 'importDistress', label: 'Import Distress Leads' },
        { key: 'runWorkflow', label: 'Run New Deal Workflow' },
        { key: 'generateTasks', label: 'Generate Latest Deal Tasks' },
        { key: 'refreshCommand', label: 'Refresh Command Center' },
        { key: 'refreshPortfolio', label: 'Refresh Portfolio' },
        { key: 'processEvents', label: 'Process Plugin Events' }
      ]
    };
  }

  return { bootstrap: bootstrap, kpis: kpis, pipeline: pipeline, tasks: tasks, offers: offers, portfolio: portfolio, alerts: alerts };
})();

function reosDashboardBootstrap() { return REOS.DashboardServices.bootstrap(); }
function reosDashboardKpis() { return REOS.DashboardServices.kpis(); }
function reosDashboardPipeline() { return REOS.DashboardServices.pipeline(); }
function reosDashboardTasks() { return REOS.DashboardServices.tasks(); }
function reosDashboardOffers() { return REOS.DashboardServices.offers(); }
function reosDashboardPortfolio() { return REOS.DashboardServices.portfolio(); }
function reosDashboardAlerts() { return REOS.DashboardServices.alerts(); }
function reosDashboardServicesPing() { return { ok: true, message: 'Dashboard Services loaded.', generatedAt: new Date().toISOString() }; }
