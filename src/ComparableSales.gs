/**
 * REOS Enterprise v3.4.1
 * Sprint 5.2 — Comparable Sales Engine
 */

var REOS = REOS || {};

REOS.ComparableSales = (function () {
  var COMPS = 'DEAL_COMPARABLES';
  var ANALYSIS = 'DEAL_COMP_ANALYSIS';

  function ensureSheets() {
    REOS.Database.ensureTable(COMPS, ['Comp ID','Deal ID','Address','Sold Price','Sold Date','Beds','Baths','Sq Ft','Distance Miles','Source','Notes','Created At']);
    REOS.Database.ensureTable(ANALYSIS, ['Comp Analysis ID','Deal ID','Comp Count','Average Sold Price','Median Sold Price','Average Price Per Sq Ft','Low Value','High Value','Estimated ARV','Confidence Score','Summary JSON','Created At']);
  }

  function addComp(dealId, input) {
    ensureSheets();
    input = input || {};
    return REOS.Database.insert(COMPS, {
      'Deal ID': dealId,
      Address: input.address || '',
      'Sold Price': num_(input.soldPrice),
      'Sold Date': input.soldDate || '',
      Beds: num_(input.beds),
      Baths: num_(input.baths),
      'Sq Ft': num_(input.sqFt),
      'Distance Miles': num_(input.distanceMiles),
      Source: input.source || 'Manual',
      Notes: input.notes || '',
      'Created At': new Date()
    }, { idField: 'Comp ID', idPrefix: 'COMP' });
  }

  function analyzeComps(dealId, subject) {
    ensureSheets();
    subject = subject || {};
    var rows = REOS.Database.getAll(COMPS).filter(function (r) {
      return r['Deal ID'] === dealId;
    });

    var prices = rows.map(function (r) { return num_(r['Sold Price']); }).filter(Boolean);
    var ppsf = rows.map(function (r) {
      var price = num_(r['Sold Price']);
      var sqft = num_(r['Sq Ft']);
      return sqft ? price / sqft : 0;
    }).filter(Boolean);

    var subjectSqFt = num_(subject.sqFt);
    var avgPpsf = avg_(ppsf);
    var estimatedArv = subjectSqFt && avgPpsf ? subjectSqFt * avgPpsf : avg_(prices);

    var confidence = Math.min(100, Math.round((rows.length / 5) * 70 + qualityScore_(rows)));

    var summary = {
      compCount: rows.length,
      averageSoldPrice: round_(avg_(prices)),
      medianSoldPrice: round_(median_(prices)),
      averagePricePerSqFt: round_(avgPpsf),
      lowValue: round_(Math.min.apply(null, prices)),
      highValue: round_(Math.max.apply(null, prices)),
      estimatedArv: round_(estimatedArv),
      confidenceScore: confidence
    };

    return REOS.Database.insert(ANALYSIS, {
      'Deal ID': dealId,
      'Comp Count': summary.compCount,
      'Average Sold Price': summary.averageSoldPrice,
      'Median Sold Price': summary.medianSoldPrice,
      'Average Price Per Sq Ft': summary.averagePricePerSqFt,
      'Low Value': summary.lowValue,
      'High Value': summary.highValue,
      'Estimated ARV': summary.estimatedArv,
      'Confidence Score': summary.confidenceScore,
      'Summary JSON': REOS.toJson_(summary),
      'Created At': new Date()
    }, { idField: 'Comp Analysis ID', idPrefix: 'CANL' });
  }

  function seedDemoComps(dealId) {
    addComp(dealId, { address: '101 Oak St', soldPrice: 158000, soldDate: '2026-05-01', beds: 3, baths: 2, sqFt: 1420, distanceMiles: 0.3 });
    addComp(dealId, { address: '115 Pine St', soldPrice: 169000, soldDate: '2026-04-18', beds: 3, baths: 2, sqFt: 1500, distanceMiles: 0.5 });
    addComp(dealId, { address: '89 Cedar Ave', soldPrice: 162500, soldDate: '2026-03-30', beds: 3, baths: 2, sqFt: 1460, distanceMiles: 0.6 });
    return analyzeComps(dealId, { sqFt: 1450 });
  }

  function summary() {
    ensureSheets();
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      comps: REOS.Database.getAll(COMPS).length,
      analyses: REOS.Database.getAll(ANALYSIS).length
    };
  }

  function num_(v) { var n = Number(v || 0); return isNaN(n) ? 0 : n; }
  function round_(v) { return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100; }
  function avg_(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
  function median_(a) { if (!a.length) return 0; a = a.slice().sort(function (x,y){return x-y;}); var m = Math.floor(a.length/2); return a.length % 2 ? a[m] : (a[m-1]+a[m])/2; }
  function qualityScore_(rows) { return rows.reduce(function (s, r) { return s + (num_(r['Distance Miles']) <= 1 ? 6 : 2); }, 0); }

  return { ensureSheets: ensureSheets, addComp: addComp, analyzeComps: analyzeComps, seedDemoComps: seedDemoComps, summary: summary };
})();

function reosComparableSalesEnsureSheets() {
  REOS.ComparableSales.ensureSheets();
  SpreadsheetApp.getUi().alert('Comparable Sales sheets ready.');
}

function reosComparableSalesSeedDemo() {
  var deals = REOS.Database.getAll('DEALS');
  if (!deals.length) throw new Error('No deals found. Run reosDealAnalyzerSeedDemo first.');
  var result = REOS.ComparableSales.seedDemoComps(deals[0]['Deal ID']);
  SpreadsheetApp.getUi().alert('Comparable Sales Demo', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosComparableSalesSummary() {
  var result = REOS.ComparableSales.summary();
  SpreadsheetApp.getUi().alert('Comparable Sales Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}
