/**
 * REOS Enterprise v3.4.5
 * Sprint 5.2 — Acquisition Opportunity Dashboard
 * Increment 4: KPI dashboard, filters, validation, and release readiness.
 */

var REOS = REOS || {};

REOS.AcquisitionOpportunityDashboard = (function () {
  var VIEW = 'ACQUISITION_OPPORTUNITY_VIEW';
  var DASHBOARD = 'ACQUISITION_OPPORTUNITY_DASHBOARD';
  var FILTERED = 'ACQUISITION_OPPORTUNITY_FILTERED';
  var VALIDATION = 'ACQUISITION_OPPORTUNITY_VALIDATION';

  var FILTER_HEADERS = [
    'Rank','Deal ID','Address','City','State','Score','Grade','Recommendation',
    'Risk Level','Purchase Price','ARV','MAO','ROI %','DSCR','Current Stage',
    'Offer Status','Strong Review','High Risk','Offer Ready','Updated At'
  ];

  function ensureSheets() {
    assertDependencies_();
    REOS.AcquisitionOpportunityView.ensureSheets();
    REOS.Database.ensureTable(DASHBOARD, ['Metric','Value','Generated At']);
    REOS.Database.ensureTable(FILTERED, FILTER_HEADERS);
    REOS.Database.ensureTable(VALIDATION, [
      'Check ID','Category','Check Name','Status','Message','Details JSON','Checked At'
    ]);
  }

  function buildDashboard() {
    ensureSheets();
    var buildResult = REOS.AcquisitionOpportunityView.build();
    var summary = REOS.AcquisitionOpportunityView.summary();
    var sheet = REOS.Database.getSheet(DASHBOARD);

    sheet.clear();
    sheet.getRange('A1:H1').merge();
    sheet.getRange('A1').setValue('REOS Acquisition Opportunity Dashboard');
    sheet.getRange('A2:H2').merge();
    sheet.getRange('A2').setValue('Sprint 5.2 — Ranked acquisition intelligence and offer readiness');

    var generatedAt = new Date();
    var kpis = [
      ['Total Opportunities', summary.totalOpportunities],
      ['Scored Opportunities', summary.scoredOpportunities],
      ['Average Score', summary.averageScore],
      ['Average ROI %', summary.averageROI],
      ['Average DSCR', summary.averageDSCR],
      ['Strong Review', summary.strongReview],
      ['High Risk', summary.highRisk],
      ['Offer Ready', summary.offerReady],
      ['Draft Offers', summary.draftOffers]
    ];

    sheet.getRange(4, 1, 1, 3).setValues([['Metric','Value','Generated At']]);
    sheet.getRange(5, 1, kpis.length, 3).setValues(kpis.map(function (row) {
      return [row[0], row[1], generatedAt];
    }));

    var gradeRows = Object.keys(summary.gradeCounts || {}).map(function (grade) {
      return [grade, summary.gradeCounts[grade]];
    });
    sheet.getRange(4, 5, 1, 2).setValues([['Grade','Count']]);
    if (gradeRows.length) sheet.getRange(5, 5, gradeRows.length, 2).setValues(gradeRows);

    var top = summary.topOpportunities || [];
    sheet.getRange(16, 1, 1, 9).setValues([[
      'Rank','Deal ID','Address','Score','Grade','ROI %','Risk Level','Stage','Offer Ready'
    ]]);
    if (top.length) {
      sheet.getRange(17, 1, top.length, 9).setValues(top.map(function (row) {
        return [
          row.rank,row.dealId,row.address,row.score,row.grade,row.roi,
          row.riskLevel,row.stage,row.offerReady
        ];
      }));
    }

    formatDashboard_(sheet, gradeRows.length, top.length);
    rebuildCharts_(sheet, gradeRows.length);

    var result = {
      ok: true,
      generatedAt: generatedAt.toISOString(),
      rowsWritten: buildResult.rowsWritten || 0,
      summary: summary,
      dashboardSheet: DASHBOARD
    };

    publish_('acquisition.opportunity.dashboard.built', result);
    return result;
  }

  function applyFilters(filters) {
    ensureSheets();
    filters = filters || {};

    var rows = REOS.Database.getAll(VIEW).filter(function (row) {
      if (filters.grade && String(row.Grade || '') !== String(filters.grade)) return false;
      if (filters.riskLevel && String(row['Risk Level'] || '') !== String(filters.riskLevel)) return false;
      if (filters.stage && String(row['Current Stage'] || '') !== String(filters.stage)) return false;
      if (filters.offerStatus && String(row['Offer Status'] || '') !== String(filters.offerStatus)) return false;
      if (filters.offerReady === true && !truthy_(row['Offer Ready'])) return false;
      if (filters.strongReview === true && !truthy_(row['Strong Review'])) return false;
      if (number_(filters.minScore) > 0 && number_(row.Score) < number_(filters.minScore)) return false;
      if (number_(filters.minRoi) > 0 && number_(row['ROI %']) < number_(filters.minRoi)) return false;
      return true;
    });

    rows.sort(function (a, b) {
      return number_(b.Score) - number_(a.Score);
    });

    replaceRows_(FILTERED, FILTER_HEADERS, rows);
    return {
      ok: true,
      filters: filters,
      matched: rows.length,
      sheet: FILTERED,
      rows: rows.slice(0, 25)
    };
  }

  function validateRelease() {
    ensureSheets();
    var checks = [];

    addCheck_(checks, 'Dependencies', 'Database available', Boolean(REOS.Database),
      'REOS.Database is available.', 'REOS.Database is missing.');
    addCheck_(checks, 'Dependencies', 'Opportunity view available', Boolean(REOS.AcquisitionOpportunityView),
      'Opportunity view module is available.', 'REOS.AcquisitionOpportunityView is missing.');

    var viewRows = safeGetAll_(VIEW);
    var deals = safeGetAll_('DEALS');
    var analyses = safeGetAll_('DEAL_ANALYSIS');
    var scores = safeGetAll_('ACQUISITION_DEAL_SCORES');
    var pipelines = safeGetAll_('ACQUISITION_PIPELINE');
    var offers = safeGetAll_('OFFERS');

    addCheck_(checks, 'Data', 'Deals exist', deals.length > 0,
      deals.length + ' deal(s) found.', 'No deals found.');
    addCheck_(checks, 'Data', 'Opportunity view populated', viewRows.length > 0,
      viewRows.length + ' opportunity row(s) found.', 'Opportunity view is empty.');
    addCheck_(checks, 'Data', 'Scored deals available', scores.length > 0,
      scores.length + ' score row(s) found.', 'No deal scores found.');
    addCheck_(checks, 'Data', 'Analyses available', analyses.length > 0,
      analyses.length + ' analysis row(s) found.', 'No deal analyses found.');
    addCheck_(checks, 'Data', 'Pipeline records available', pipelines.length > 0,
      pipelines.length + ' pipeline row(s) found.', 'No acquisition pipeline records found.');
    addCheck_(checks, 'Data', 'Offer records available', offers.length > 0,
      offers.length + ' offer row(s) found.', 'No offers found.');

    var invalidRank = viewRows.some(function (row) { return number_(row.Rank) <= 0; });
    var missingDealId = viewRows.some(function (row) { return !String(row['Deal ID'] || '').trim(); });
    var invalidScore = viewRows.some(function (row) {
      var score = number_(row.Score);
      return score < 0 || score > 100;
    });

    addCheck_(checks, 'Integrity', 'Ranks valid', !invalidRank,
      'All opportunity ranks are valid.', 'One or more opportunity ranks are invalid.');
    addCheck_(checks, 'Integrity', 'Deal IDs present', !missingDealId,
      'All opportunity rows contain Deal IDs.', 'One or more opportunity rows are missing Deal IDs.');
    addCheck_(checks, 'Integrity', 'Scores in range', !invalidScore,
      'All scores are between 0 and 100.', 'One or more scores are outside the 0–100 range.');

    var passed = checks.filter(function (check) { return check.status === 'PASS'; }).length;
    var failed = checks.length - passed;
    var status = failed === 0 ? 'READY' : 'NOT READY';

    var records = checks.map(function (check, index) {
      return {
        'Check ID': 'S52-' + String(index + 1),
        Category: check.category,
        'Check Name': check.name,
        Status: check.status,
        Message: check.message,
        'Details JSON': json_(check.details || {}),
        'Checked At': new Date()
      };
    });
    replaceRows_(VALIDATION, [
      'Check ID','Category','Check Name','Status','Message','Details JSON','Checked At'
    ], records);

    var result = {
      ok: failed === 0,
      releaseStatus: status,
      totalChecks: checks.length,
      passed: passed,
      failed: failed,
      checks: checks,
      generatedAt: new Date().toISOString()
    };
    publish_('acquisition.opportunity.release.validated', result);
    return result;
  }

  function formatDashboard_(sheet, gradeCount, topCount) {
    sheet.setFrozenRows(4);
    sheet.getRange('A1:H1').setFontWeight('bold').setFontSize(16).setHorizontalAlignment('center');
    sheet.getRange('A2:H2').setFontStyle('italic').setHorizontalAlignment('center');
    sheet.getRange(4, 1, 1, 3).setFontWeight('bold');
    sheet.getRange(4, 5, 1, 2).setFontWeight('bold');
    sheet.getRange(16, 1, 1, 9).setFontWeight('bold');
    if (topCount) sheet.getRange(17, 6, topCount, 1).setNumberFormat('0.00');
    sheet.autoResizeColumns(1, 9);
  }

  function rebuildCharts_(sheet, gradeCount) {
    sheet.getCharts().forEach(function (chart) { sheet.removeChart(chart); });
    if (!gradeCount) return;

    var chart = sheet.newChart()
      .asColumnChart()
      .addRange(sheet.getRange(4, 5, gradeCount + 1, 2))
      .setPosition(4, 8, 0, 0)
      .setOption('title', 'Opportunity Grades')
      .setOption('legend', { position: 'none' })
      .build();
    sheet.insertChart(chart);
  }

  function replaceRows_(sheetName, headers, rows) {
    var sheet = REOS.Database.getSheet(sheetName);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), headers.length)).clearContent();
    }
    if (!rows.length) return;

    var values = rows.map(function (row) {
      return headers.map(function (header) {
        return Object.prototype.hasOwnProperty.call(row, header) ? row[header] : '';
      });
    });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }

  function addCheck_(checks, category, name, passed, passMessage, failMessage, details) {
    checks.push({
      category: category,
      name: name,
      status: passed ? 'PASS' : 'FAIL',
      message: passed ? passMessage : failMessage,
      details: details || {}
    });
  }

  function safeGetAll_(sheetName) {
    try { return REOS.Database.getAll(sheetName); } catch (error) { return []; }
  }

  function truthy_(value) {
    return value === true || value === 1 || String(value).toLowerCase() === 'true';
  }

  function number_(value) {
    var parsed = Number(value || 0);
    return isFinite(parsed) ? parsed : 0;
  }

  function json_(value) {
    return REOS.toJson_ ? REOS.toJson_(value) : JSON.stringify(value);
  }

  function assertDependencies_() {
    if (!REOS.Database) throw new Error('REOS.Database is required.');
    if (!REOS.AcquisitionOpportunityView) throw new Error('REOS.AcquisitionOpportunityView is required.');
  }

  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) {
      REOS.PluginEventBus.publish(topic, payload, 'acquisitions');
    }
  }

  return {
    ensureSheets: ensureSheets,
    buildDashboard: buildDashboard,
    applyFilters: applyFilters,
    validateRelease: validateRelease
  };
})();

function reosSprint52BuildDashboard() {
  var result = REOS.AcquisitionOpportunityDashboard.buildDashboard();
  console.log(JSON.stringify(result, null, 2).slice(0, 12000));
  return result;
}

function reosSprint52FilterOfferReady() {
  var result = REOS.AcquisitionOpportunityDashboard.applyFilters({
    offerReady: true,
    minScore: 55
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 12000));
  return result;
}

function reosSprint52FilterHighValue() {
  var result = REOS.AcquisitionOpportunityDashboard.applyFilters({
    minScore: 70,
    minRoi: 15
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 12000));
  return result;
}

function reosSprint52ValidateRelease() {
  var result = REOS.AcquisitionOpportunityDashboard.validateRelease();
  console.log(JSON.stringify(result, null, 2).slice(0, 12000));
  return result;
}
