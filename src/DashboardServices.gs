/**
 * REOS Enterprise v4.0.2 - Dashboard Services
 * Phase 1.1: independent dashboard data services for resilient UI loading.
 */
var REOS = REOS || {};

REOS.DashboardServices = (function () {
  function safeAll_(sheet) { try { return REOS.Database.getAll(sheet); } catch (e) { return []; } }
  function safe_(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
  function group_(rows, field) { return rows.reduce(function (m, r) { var k = r[field] || 'Unknown'; m[k] = (m[k] || 0) + 1; return m; }, {}); }
  function latest_(rows, field, value) { var a = rows.filter(function (r) { return r[field] === value; }); return a.length ? a[a.length - 1] : null; }
  function n_(v) { var n = Number(v || 0); return isNaN(n) ? 0 : n; }

  function kpis() {
    var quality = safe_(function () { return REOS.AcquisitionQuality.runSmokeTest(); }, { score: 0, ok: false });
    var command = safe_(function () { return REOS.AcquisitionCommandCenter.buildSnapshot().snapshot; }, {});
    var portfolio = safe_(function () { return REOS.PortfolioIntelligence.buildSnapshot().snapshot; }, {});
    var tasks = safe_(function () { return REOS.AcquisitionTaskEngine.summary(); }, {});
    return { ok: true, generatedAt: new Date().toISOString(), values: {
      qualityScore: n_(quality.score), activeDeals: n_(command.activeDeals), pipelines: n_(command.pipelineCount),
      openTasks: n_(tasks.open || command.openTasks), overdueTasks: n_(tasks.overdue || command.overdueTasks),
      draftOffers: n_(command.draftOffers), portfolioAssets: n_(portfolio.totalAssets), totalEquity: n_(portfolio.totalEquity),
      projectedProfit: n_(command.projectedProfit || portfolio.projectedProfit), pendingDistressLeads: n_(command.pendingDistressLeads)
    }};
  }

  function pipeline() {
    var rows = safeAll_('ACQUISITION_PIPELINE');
    var deals = safeAll_('DEALS');
    var analyses = safeAll_('DEAL_ANALYSIS');
    return { ok: true, generatedAt: new Date().toISOString(), byStage: group_(rows, 'Current Stage'), records: rows.slice().reverse().slice(0,150).map(function (p) {
      var d = latest_(deals, 'Deal ID', p['Deal ID']) || {};
      var a = latest_(analyses, 'Deal ID', p['Deal ID']) || {};
      return { dealId: p['Deal ID'], address: d.Address || '', city: d.City || '', state: d.State || '', stage: p['Current Stage'] || '', status: p.Status || '', assignedTo: p['Assigned To'] || '', profit: n_(a['Flip Profit']), roi: n_(a['ROI %']), risk: a['Risk Level'] || '' };
    })};
  }

  function tasks() {
    var rows = safeAll_('ACQUISITION_TASK_QUEUE');
    var now = new Date();
    return { ok: true, generatedAt: new Date().toISOString(), byRole: group_(rows, 'Owner Role'), byStatus: group_(rows, 'Status'), overdue: rows.filter(function (r) { return r.Status === 'Open' && r['Due At'] && new Date(r['Due At']) < now; }).length, records: rows.slice().reverse().slice(0,200).map(function (r) {
      return { taskId: r['Acquisition Task ID'], dealId: r['Deal ID'], stage: r.Stage || '', task: r['Task Name'] || '', role: r['Owner Role'] || '', priority: r.Priority || '', dueAt: r['Due At'] || '', status: r.Status || '' };
    })};
  }

  function offers() {
    var rows = safeAll_('OFFERS');
    return { ok: true, generatedAt: new Date().toISOString(), byStatus: group_(rows, 'Status'), records: rows.slice().reverse().slice(0,150).map(function (r) {
      return { offerId: r['Offer ID'], dealId: r['Deal ID'], type: r['Offer Type'] || '', amount: n_(r['Offer Amount']), status: r.Status || '', terms: r.Terms || '', updatedAt: r['Updated At'] || r['Created At'] || '' };
    })};
  }

  function portfolio() {
    var snap = safe_(function () { return REOS.PortfolioIntelligence.buildSnapshot().snapshot; }, {});
    var assets = safeAll_('PORTFOLIO_ASSETS');
    return { ok: true, generatedAt: new Date().toISOString(), snapshot: snap, byStrategy: group_(assets, 'Strategy'), byCity: group_(assets, 'City'), records: assets.slice().reverse().slice(0,150) };
  }

  function alerts() {
    var q = safe_(function () { return REOS.AcquisitionQuality.runSmokeTest(); }, { ok: false, score: 0 });
    var t = safe_(function () { return REOS.AcquisitionTaskEngine.summary(); }, {});
    var e = safe_(function () { return REOS.PluginEventBus.summary(); }, {});
    var distress = safeAll_('DISTRESS_LEADS').filter(function (r) { return !r['Imported Deal ID']; }).length;
    var offers = safeAll_('OFFERS').filter(function (r) { return r.Status === 'Draft'; }).length;
    var a = [];
    if (!q.ok) a.push({ level: 'critical', title: 'Quality Check Failed', message: 'Quality score: ' + n_(q.score) });
    if (n_(t.overdue) > 0) a.push({ level: 'warning', title: 'Overdue Tasks', message: t.overdue + ' tasks are overdue.' });
    if (distress > 0) a.push({ level: 'info', title: 'Pending Distress Leads', message: distress + ' leads await import.' });
    if (offers > 0) a.push({ level: 'info', title: 'Draft Offers', message: offers + ' offers remain in draft.' });
    if (n_(e.pending) > 0) a.push({ level: 'warning', title: 'Pending Events', message: e.pending + ' events await processing.' });
    if (!a.length) a.push({ level: 'success', title: 'Operations Ready', message: 'No immediate operational issues detected.' });
    return { ok: true, generatedAt: new Date().toISOString(), alerts: a };
  }

  function bootstrap() {
    return { ok: true, generatedAt: new Date().toISOString(), navigation: ['overview','pipeline','tasks','offers','portfolio'], quickActions: [
      { key: 'importDistress', label: 'Import Distress Leads' }, { key: 'runWorkflow', label: 'Run New Deal Workflow' },
      { key: 'generateTasks', label: 'Generate Latest Deal Tasks' }, { key: 'refreshCommand', label: 'Refresh Command Center' },
      { key: 'refreshPortfolio', label: 'Refresh Portfolio' }, { key: 'processEvents', label: 'Process Plugin Events' }
    ]};
  }

  return { bootstrap: bootstrap, kpis: kpis, pipeline: pipeline, tasks: tasks, offers: offers, portfolio: portfolio, alerts: alerts };
})();

function reosDashboardBootstrap(){ return REOS.DashboardServices.bootstrap(); }
function reosDashboardKpis(){ return REOS.DashboardServices.kpis(); }
function reosDashboardPipeline(){ return REOS.DashboardServices.pipeline(); }
function reosDashboardTasks(){ return REOS.DashboardServices.tasks(); }
function reosDashboardOffers(){ return REOS.DashboardServices.offers(); }
function reosDashboardPortfolio(){ return REOS.DashboardServices.portfolio(); }
function reosDashboardAlerts(){ return REOS.DashboardServices.alerts(); }

function reosDashboardServicesPing() {
  return {
    ok: true,
    message: 'Dashboard Services loaded.',
    generatedAt: new Date().toISOString()
  };
}

function reosDashboardBootstrapDebug() {
  try {
    return {
      ok: true,
      serviceAvailable: !!REOS.DashboardServices,
      bootstrapAvailable:
        !!REOS.DashboardServices &&
        typeof REOS.DashboardServices.bootstrap === 'function',
      result: REOS.DashboardServices.bootstrap()
    };
  } catch (error) {
    return {
      ok: false,
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || ''
    };
  }
}

function reosDashboardServicesPing() {
  return {
    ok: true,
    message: 'Dashboard Services loaded.',
    generatedAt: new Date().toISOString()
  };
}

function reosDashboardBootstrapDebug() {
  try {
    return {
      ok: true,
      serviceAvailable: !!REOS.DashboardServices,
      bootstrapAvailable:
        !!REOS.DashboardServices &&
        typeof REOS.DashboardServices.bootstrap === 'function',
      result: REOS.DashboardServices.bootstrap()
    };
  } catch (error) {
    return {
      ok: false,
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || ''
    };
  }
}

function reosDashboardServicesPing() {
  return {
    ok: true,
    message: 'Dashboard Services loaded.',
    generatedAt: new Date().toISOString()
  };
}

function reosDashboardBootstrapDebug() {
  try {
    return {
      ok: true,
      serviceAvailable: !!REOS.DashboardServices,
      bootstrapAvailable:
        !!REOS.DashboardServices &&
        typeof REOS.DashboardServices.bootstrap === 'function',
      result: REOS.DashboardServices.bootstrap()
    };
  } catch (error) {
    return {
      ok: false,
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || ''
    };
  }
}

function reosDashboardServicesPing() {
  return {
    ok: true,
    message: 'Dashboard Services loaded.',
    generatedAt: new Date().toISOString()
  };
}

function reosDashboardBootstrapDebug() {
  try {
    return {
      ok: true,
      serviceAvailable: !!REOS.DashboardServices,
      bootstrapAvailable:
        !!REOS.DashboardServices &&
        typeof REOS.DashboardServices.bootstrap === 'function',
      result: REOS.DashboardServices.bootstrap()
    };
  } catch (error) {
    return {
      ok: false,
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || ''
    };
  }
}
