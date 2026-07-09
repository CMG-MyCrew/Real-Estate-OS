/**
 * REOS Enterprise v3.5.0
 * Sprint 5.5 — Portfolio Intelligence Dashboard
 */

var REOS = REOS || {};

REOS.PortfolioIntelligence = (function () {
  var SNAPSHOTS = 'PORTFOLIO_INTELLIGENCE';
  var ASSETS = 'PORTFOLIO_ASSETS';
  var PERFORMANCE = 'PORTFOLIO_PERFORMANCE';

  function ensureSheets() {
    REOS.Database.ensureTable(ASSETS, [
      'Asset ID','Deal ID','Property ID','Address','City','State','Acquisition Type',
      'Acquisition Price','ARV','Current Value','Equity','Strategy','Status',
      'Acquired At','Created At','Updated At'
    ]);

    REOS.Database.ensureTable(PERFORMANCE, [
      'Performance ID','Asset ID','Deal ID','Revenue','Expenses','NOI',
      'Cash Flow','ROI %','Cap Rate %','DSCR','Recorded At'
    ]);

    REOS.Database.ensureTable(SNAPSHOTS, [
      'Snapshot ID','Generated At','Total Assets','Active Assets','Closed Assets',
      'Total Acquisition Cost','Total Current Value','Total Equity','Projected Profit',
      'Average ROI %','Average Cap Rate %','Average DSCR','By Strategy JSON',
      'By City JSON','Top Assets JSON'
    ]);
  }

  function createAssetFromDeal(dealId) {
    ensureSheets();

    var deal = findById_('DEALS', 'Deal ID', dealId);
    if (!deal) throw new Error('Deal not found: ' + dealId);

    var analysis = latestForDeal_('DEAL_ANALYSIS', dealId);
    var existing = findById_(ASSETS, 'Deal ID', dealId);
    if (existing) return existing;

    var acquisitionPrice = num_(analysis && analysis['Purchase Price']);
    var arv = num_(analysis && analysis.ARV);
    var equity = arv - acquisitionPrice;

    var asset = REOS.Database.insert(ASSETS, {
      'Deal ID': dealId,
      'Property ID': deal['Property ID'] || '',
      Address: deal.Address || '',
      City: deal.City || '',
      State: deal.State || '',
      'Acquisition Type': 'Pipeline',
      'Acquisition Price': acquisitionPrice,
      ARV: arv,
      'Current Value': arv,
      Equity: equity,
      Strategy: strategyFromAnalysis_(analysis),
      Status: 'Active',
      'Acquired At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'Asset ID', idPrefix: 'AST' });

    createPerformance_(asset, analysis);
    publish_('portfolio.asset.created', asset);

    return asset;
  }

  function createAssetsFromClosedOrActiveDeals() {
    ensureSheets();

    var deals = REOS.Database.getAll('DEALS');
    var created = [];

    deals.forEach(function (deal) {
      try {
        var asset = createAssetFromDeal(deal['Deal ID']);
        created.push(asset);
      } catch (e) {}
    });

    return {
      ok: true,
      createdOrExisting: created.length,
      assets: created
    };
  }

  function buildSnapshot() {
    ensureSheets();

    var assets = REOS.Database.getAll(ASSETS);
    var perf = REOS.Database.getAll(PERFORMANCE);

    var totalCost = sum_(assets, 'Acquisition Price');
    var totalValue = sum_(assets, 'Current Value');
    var totalEquity = sum_(assets, 'Equity');

    var projectedProfit = assets.reduce(function (sum, asset) {
      return sum + (num_(asset['Current Value']) - num_(asset['Acquisition Price']));
    }, 0);

    var avgROI = avg_(perf.map(function (p) { return num_(p['ROI %']); }).filter(function (v) { return v !== 0; }));
    var avgCap = avg_(perf.map(function (p) { return num_(p['Cap Rate %']); }).filter(function (v) { return v !== 0; }));
    var avgDscr = avg_(perf.map(function (p) { return num_(p.DSCR); }).filter(function (v) { return v !== 0; }));

    var topAssets = assets.map(function (asset) {
      return {
        assetId: asset['Asset ID'],
        dealId: asset['Deal ID'],
        address: asset.Address,
        city: asset.City,
        state: asset.State,
        strategy: asset.Strategy,
        equity: num_(asset.Equity),
        currentValue: num_(asset['Current Value'])
      };
    }).sort(function (a, b) {
      return b.equity - a.equity;
    }).slice(0, 10);

    var snapshot = {
      totalAssets: assets.length,
      activeAssets: assets.filter(function (a) { return a.Status === 'Active'; }).length,
      closedAssets: assets.filter(function (a) { return a.Status === 'Closed'; }).length,
      totalAcquisitionCost: round_(totalCost),
      totalCurrentValue: round_(totalValue),
      totalEquity: round_(totalEquity),
      projectedProfit: round_(projectedProfit),
      averageROI: round_(avgROI),
      averageCapRate: round_(avgCap),
      averageDSCR: round_(avgDscr),
      byStrategy: groupCount_(assets, 'Strategy'),
      byCity: groupCount_(assets, 'City'),
      topAssets: topAssets
    };

    var row = REOS.Database.insert(SNAPSHOTS, {
      'Generated At': new Date(),
      'Total Assets': snapshot.totalAssets,
      'Active Assets': snapshot.activeAssets,
      'Closed Assets': snapshot.closedAssets,
      'Total Acquisition Cost': snapshot.totalAcquisitionCost,
      'Total Current Value': snapshot.totalCurrentValue,
      'Total Equity': snapshot.totalEquity,
      'Projected Profit': snapshot.projectedProfit,
      'Average ROI %': snapshot.averageROI,
      'Average Cap Rate %': snapshot.averageCapRate,
      'Average DSCR': snapshot.averageDSCR,
      'By Strategy JSON': REOS.toJson_(snapshot.byStrategy),
      'By City JSON': REOS.toJson_(snapshot.byCity),
      'Top Assets JSON': REOS.toJson_(snapshot.topAssets)
    }, { idField: 'Snapshot ID', idPrefix: 'PINT' });

    publish_('portfolio.snapshot.created', snapshot);

    return { ok: true, snapshot: snapshot, row: row };
  }

  function executiveBrief() {
    var result = buildSnapshot();
    var s = result.snapshot;

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      message:
        'Portfolio Intelligence Brief' +
        '\nTotal Assets: ' + s.totalAssets +
        '\nActive Assets: ' + s.activeAssets +
        '\nTotal Current Value: $' + s.totalCurrentValue +
        '\nTotal Equity: $' + s.totalEquity +
        '\nProjected Profit: $' + s.projectedProfit +
        '\nAverage ROI: ' + s.averageROI + '%' +
        '\nAverage Cap Rate: ' + s.averageCapRate + '%' +
        '\nAverage DSCR: ' + s.averageDSCR,
      snapshot: s
    };
  }

  function summary() {
    ensureSheets();
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      assets: REOS.Database.getAll(ASSETS).length,
      performance: REOS.Database.getAll(PERFORMANCE).length,
      snapshots: REOS.Database.getAll(SNAPSHOTS).length
    };
  }

  function createPerformance_(asset, analysis) {
    analysis = analysis || {};
    var revenue = num_(analysis['Rent Monthly']) * 12;
    var noi = num_(analysis.NOI);
    var cashFlow = noi;
    var roi = num_(analysis['ROI %']);
    var capRate = num_(analysis['Cap Rate %']);
    var dscr = num_(analysis.DSCR);

    return REOS.Database.insert(PERFORMANCE, {
      'Asset ID': asset['Asset ID'],
      'Deal ID': asset['Deal ID'],
      Revenue: revenue,
      Expenses: revenue - noi,
      NOI: noi,
      'Cash Flow': cashFlow,
      'ROI %': roi,
      'Cap Rate %': capRate,
      DSCR: dscr,
      'Recorded At': new Date()
    }, { idField: 'Performance ID', idPrefix: 'PPERF' });
  }

  function strategyFromAnalysis_(analysis) {
    if (!analysis) return 'Unknown';
    if (num_(analysis['Rent Monthly']) > 0 && num_(analysis['Cap Rate %']) > 0) return 'Rental';
    if (num_(analysis['Flip Profit']) > 0) return 'Flip';
    return 'Hold';
  }

  function latestForDeal_(sheetName, dealId) {
    var rows = REOS.Database.getAll(sheetName).filter(function (r) {
      return r['Deal ID'] === dealId;
    });
    return rows.length ? rows[rows.length - 1] : null;
  }

  function findById_(sheetName, idField, id) {
    var rows = REOS.Database.getAll(sheetName).filter(function (r) {
      return r[idField] === id;
    });
    return rows.length ? rows[0] : null;
  }

  function sum_(rows, field) {
    return rows.reduce(function (sum, row) { return sum + num_(row[field]); }, 0);
  }

  function avg_(values) {
    return values.length ? values.reduce(function (s, v) { return s + v; }, 0) / values.length : 0;
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
      REOS.PluginEventBus.publish(topic, payload, 'portfolio');
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
    createAssetFromDeal: createAssetFromDeal,
    createAssetsFromClosedOrActiveDeals: createAssetsFromClosedOrActiveDeals,
    buildSnapshot: buildSnapshot,
    executiveBrief: executiveBrief,
    summary: summary
  };
})();

function reosPortfolioIntelligenceEnsureSheets() {
  REOS.PortfolioIntelligence.ensureSheets();
  SpreadsheetApp.getUi().alert('Portfolio Intelligence sheets ready.');
}

function reosPortfolioIntelligenceCreateAssets() {
  var result = REOS.PortfolioIntelligence.createAssetsFromClosedOrActiveDeals();
  SpreadsheetApp.getUi().alert('Portfolio Assets Created', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosPortfolioIntelligenceSnapshot() {
  var result = REOS.PortfolioIntelligence.buildSnapshot();
  SpreadsheetApp.getUi().alert('Portfolio Intelligence Snapshot', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosPortfolioIntelligenceBrief() {
  var result = REOS.PortfolioIntelligence.executiveBrief();
  SpreadsheetApp.getUi().alert('Portfolio Intelligence Brief', result.message, SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosPortfolioIntelligenceSummary() {
  var result = REOS.PortfolioIntelligence.summary();
  SpreadsheetApp.getUi().alert('Portfolio Intelligence Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}
