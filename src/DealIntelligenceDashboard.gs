/**
 * REOS Enterprise v4.3.2
 * Sprint 7.2 Increment 3 — Deal Intelligence Dashboard
 */
var REOS = REOS || {};

REOS.DealIntelligenceDashboard = (function () {
  var TABLE = 'AI_DEAL_INTELLIGENCE';

  function safeAll_(sheet) {
    try { return REOS.Database.getAll(sheet) || []; }
    catch (error) { return []; }
  }

  function n_(value) {
    var number = Number(value || 0);
    return isNaN(number) ? 0 : number;
  }

  function text_(value) {
    return String(value === null || value === undefined ? '' : value).trim();
  }

  function clean_(value) {
    return JSON.parse(JSON.stringify(value || null, function (key, item) {
      if (item instanceof Date) return item.toISOString();
      if (typeof item === 'number' && !isFinite(item)) return 0;
      return item;
    }));
  }

  function data(filters) {
    filters = filters || {};
    var rows = safeAll_(TABLE);

    rows = rows.filter(function (row) {
      if (filters.city && text_(row.City).toLowerCase() !== text_(filters.city).toLowerCase()) return false;
      if (filters.state && text_(row.State).toLowerCase() !== text_(filters.state).toLowerCase()) return false;
      if (filters.strategy && text_(row.Strategy).toLowerCase() !== text_(filters.strategy).toLowerCase()) return false;
      if (filters.risk && text_(row['Risk Level']).toLowerCase() !== text_(filters.risk).toLowerCase()) return false;
      if (filters.grade && text_(row['Investment Grade']).toLowerCase() !== text_(filters.grade).toLowerCase()) return false;
      if (filters.status && text_(row.Status).toLowerCase() !== text_(filters.status).toLowerCase()) return false;
      return true;
    });

    rows.sort(function (a, b) {
      var gradeRank = { 'A+': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
      var diff = (gradeRank[text_(b['Investment Grade'])] || 0) - (gradeRank[text_(a['Investment Grade'])] || 0);
      return diff || n_(b['ROI %']) - n_(a['ROI %']);
    });

    var open = rows.filter(function (row) { return text_(row.Status) === 'Open'; });
    var roiValues = open.map(function (row) { return n_(row['ROI %']); });

    return clean_({
      ok: true,
      generatedAt: new Date().toISOString(),
      kpis: {
        openDeals: open.length,
        topGradeDeals: open.filter(function (row) {
          return ['A+', 'A'].indexOf(text_(row['Investment Grade'])) !== -1;
        }).length,
        averageROI: roiValues.length
          ? Math.round((roiValues.reduce(function (sum, value) { return sum + value; }, 0) / roiValues.length) * 100) / 100
          : 0,
        projectedProfit: open.reduce(function (sum, row) { return sum + n_(row['Estimated Profit']); }, 0),
        lowRiskDeals: open.filter(function (row) { return text_(row['Risk Level']) === 'Low'; }).length
      },
      filters: {
        cities: unique_(rows, 'City'),
        states: unique_(rows, 'State'),
        strategies: unique_(rows, 'Strategy'),
        risks: unique_(rows, 'Risk Level'),
        grades: unique_(rows, 'Investment Grade')
      },
      records: rows.slice(0, 250).map(function (row) {
        return {
          aiDealId: row['AI Deal ID'],
          leadId: row['Distress Lead ID'],
          address: row.Address || '',
          city: row.City || '',
          state: row.State || '',
          leadScore: n_(row['Lead Score']),
          arv: n_(row.ARV),
          repairs: n_(row['Repair Estimate']),
          mao: n_(row.MAO),
          profit: n_(row['Estimated Profit']),
          roi: n_(row['ROI %']),
          risk: row['Risk Level'] || '',
          grade: row['Investment Grade'] || '',
          strategy: row.Strategy || '',
          recommendedOffer: n_(row['Recommended Offer']),
          status: row.Status || ''
        };
      })
    });
  }

  function unique_(rows, field) {
    var values = {};
    rows.forEach(function (row) {
      var value = text_(row[field]);
      if (value) values[value] = true;
    });
    return Object.keys(values).sort();
  }

  function createOfferDraft(aiDealId) {
    var row = safeAll_(TABLE).filter(function (item) {
      return text_(item['AI Deal ID']) === text_(aiDealId);
    })[0];
    if (!row) throw new Error('AI deal not found: ' + aiDealId);

    var offer = REOS.Database.insert('OFFERS', {
      'Deal ID': '',
      'Lead ID': row['Distress Lead ID'] || '',
      'Offer Type': row.Strategy || 'Acquisition',
      'Offer Amount': n_(row['Recommended Offer']),
      Status: 'Draft',
      Terms: 'AI recommended offer. Subject to due diligence and clear title.',
      Notes: 'Created from AI Deal Intelligence dashboard: ' + aiDealId,
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'Offer ID', idPrefix: 'OFFER' });

    return clean_({ ok: true, action: 'offer.created', offer: offer });
  }

  function promoteToPipeline(aiDealId) {
    var row = safeAll_(TABLE).filter(function (item) {
      return text_(item['AI Deal ID']) === text_(aiDealId);
    })[0];
    if (!row) throw new Error('AI deal not found: ' + aiDealId);

    var deal = REOS.Database.insert('DEALS', {
      Address: row.Address || '',
      City: row.City || '',
      State: row.State || '',
      Source: 'AI Deal Intelligence',
      'Deal Status': 'New',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'Deal ID', idPrefix: 'DEAL' });

    try {
      if (REOS.AcquisitionPipeline && typeof REOS.AcquisitionPipeline.createForDeal === 'function') {
        REOS.AcquisitionPipeline.createForDeal(deal['Deal ID']);
      }
    } catch (ignored) {}

    REOS.Database.update(TABLE, 'AI Deal ID', aiDealId, {
      Status: 'Promoted',
      'Updated At': new Date()
    });

    return clean_({ ok: true, action: 'deal.promoted', deal: deal });
  }

  return {
    data: data,
    createOfferDraft: createOfferDraft,
    promoteToPipeline: promoteToPipeline
  };
})();

function showDealIntelligenceDashboard() {
  var html = HtmlService.createHtmlOutputFromFile('DealIntelligenceDashboardUI')
    .setWidth(1400)
    .setHeight(900);
  SpreadsheetApp.getUi().showModelessDialog(html, 'REOS Deal Intelligence');
}

function reosDealIntelligenceDashboardData(filters) {
  return REOS.DealIntelligenceDashboard.data(filters);
}

function reosDealIntelligenceDashboardCreateOffer(aiDealId) {
  return REOS.DealIntelligenceDashboard.createOfferDraft(aiDealId);
}

function reosDealIntelligenceDashboardPromote(aiDealId) {
  return REOS.DealIntelligenceDashboard.promoteToPipeline(aiDealId);
}
