/**
 * REOS Enterprise v3.4.8
 * Sprint 5.4 Increment 4 — Acquisition Command Center
 */

var REOS = REOS || {};

REOS.AcquisitionCommandCenter = (function () {
  var SNAPSHOTS = 'ACQUISITION_COMMAND_CENTER';

  function ensureSheets() {
    REOS.Database.ensureTable(SNAPSHOTS, [
      'Snapshot ID','Generated At','Active Deals','Pipeline Count','Open Tasks',
      'Overdue Tasks','Draft Offers','Submitted Offers','Projected Profit',
      'Pipeline By Stage JSON','Tasks By Role JSON','Top Deals JSON'
    ]);
  }

  function buildSnapshot() {
    ensureSheets();

    var deals = safeAll_('DEALS');
    var pipelines = safeAll_('ACQUISITION_PIPELINE');
    var tasks = safeAll_('ACQUISITION_TASK_QUEUE');
    var offers = safeAll_('OFFERS');
    var analyses = safeAll_('DEAL_ANALYSIS');
    var distress = safeAll_('DISTRESS_LEADS');

    var openTasks = tasks.filter(function (t) { return t.Status === 'Open'; });
    var overdueTasks = openTasks.filter(function (t) {
      return t['Due At'] && new Date(t['Due At']) < new Date();
    });

    var projectedProfit = analyses.reduce(function (sum, a) {
      return sum + num_(a['Flip Profit']);
    }, 0);

    var topDeals = analyses
      .map(function (a) {
        return {
          dealId: a['Deal ID'],
          mao: num_(a.MAO),
          flipProfit: num_(a['Flip Profit']),
          roi: num_(a['ROI %']),
          recommendation: a.Recommendation || '',
          riskLevel: a['Risk Level'] || ''
        };
      })
      .sort(function (a, b) { return b.flipProfit - a.flipProfit; })
      .slice(0, 10);

    var snapshot = {
      generatedAt: new Date().toISOString(),
      activeDeals: deals.length,
      pipelineCount: pipelines.length,
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      draftOffers: offers.filter(function (o) { return o.Status === 'Draft'; }).length,
      submittedOffers: offers.filter(function (o) { return o.Status === 'Submitted'; }).length,
      projectedProfit: round_(projectedProfit),
      pendingDistressLeads: distress.filter(function (d) { return !d['Imported Deal ID']; }).length,
      pipelineByStage: groupCount_(pipelines, 'Current Stage'),
      tasksByRole: groupCount_(tasks, 'Owner Role'),
      topDeals: topDeals
    };

    var row = REOS.Database.insert(SNAPSHOTS, {
      'Generated At': new Date(),
      'Active Deals': snapshot.activeDeals,
      'Pipeline Count': snapshot.pipelineCount,
      'Open Tasks': snapshot.openTasks,
      'Overdue Tasks': snapshot.overdueTasks,
      'Draft Offers': snapshot.draftOffers,
      'Submitted Offers': snapshot.submittedOffers,
      'Projected Profit': snapshot.projectedProfit,
      'Pipeline By Stage JSON': REOS.toJson_(snapshot.pipelineByStage),
      'Tasks By Role JSON': REOS.toJson_(snapshot.tasksByRole),
      'Top Deals JSON': REOS.toJson_(snapshot.topDeals)
    }, { idField: 'Snapshot ID', idPrefix: 'ACMD' });

    publish_('acquisition.command_center.snapshot.created', snapshot);

    return { ok: true, snapshot: snapshot, row: row };
  }

  function summary() {
    ensureSheets();
    var rows = safeAll_(SNAPSHOTS);
    var latest = rows.length ? rows[rows.length - 1] : null;

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      snapshots: rows.length,
      latest: latest
    };
  }

  function dailyBrief() {
    var snap = buildSnapshot().snapshot;

    return {
      ok: true,
      title: 'REOS Acquisition Daily Brief',
      generatedAt: new Date().toISOString(),
      message:
        'Active Deals: ' + snap.activeDeals +
        '\nPipelines: ' + snap.pipelineCount +
        '\nOpen Tasks: ' + snap.openTasks +
        '\nOverdue Tasks: ' + snap.overdueTasks +
        '\nDraft Offers: ' + snap.draftOffers +
        '\nProjected Profit: $' + snap.projectedProfit,
      topDeals: snap.topDeals
    };
  }

  function safeAll_(sheetName) {
    try { return REOS.Database.getAll(sheetName); } catch (e) { return []; }
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

  function num_(v) {
    var n = Number(v || 0);
    return isNaN(n) ? 0 : n;
  }

  function round_(v) {
    return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
  }

  return {
    ensureSheets: ensureSheets,
    buildSnapshot: buildSnapshot,
    dailyBrief: dailyBrief,
    summary: summary
  };
})();

function reosAcquisitionCommandCenterEnsureSheets() {
  REOS.AcquisitionCommandCenter.ensureSheets();
  SpreadsheetApp.getUi().alert('Acquisition Command Center sheets ready.');
}

function reosAcquisitionCommandCenterSnapshot() {
  var result = REOS.AcquisitionCommandCenter.buildSnapshot();
  SpreadsheetApp.getUi().alert('Acquisition Command Center Snapshot', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionCommandCenterBrief() {
  var result = REOS.AcquisitionCommandCenter.dailyBrief();
  SpreadsheetApp.getUi().alert('Acquisition Daily Brief', result.message, SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosAcquisitionCommandCenterSummary() {
  var result = REOS.AcquisitionCommandCenter.summary();
  SpreadsheetApp.getUi().alert('Acquisition Command Center Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}
