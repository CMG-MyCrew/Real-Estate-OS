/**
 * REOS Enterprise v3.4.4
 * Sprint 5.2 — Acquisition Opportunity Intelligence
 * Increment 3: ranked opportunity read model and summary queues.
 */

var REOS = REOS || {};

REOS.AcquisitionOpportunityView = (function () {
  var DEALS = 'DEALS';
  var ANALYSIS = 'DEAL_ANALYSIS';
  var SCORES = 'ACQUISITION_DEAL_SCORES';
  var PIPELINE = 'ACQUISITION_PIPELINE';
  var OFFERS = 'OFFERS';
  var VIEW = 'ACQUISITION_OPPORTUNITY_VIEW';

  var HEADERS = [
    'Rank','Deal ID','Address','City','State','Zip','Source','Deal Status',
    'Score','Grade','Recommendation','Risk Level','Purchase Price','ARV','MAO',
    'Flip Profit','ROI %','Cash Required','NOI','Cap Rate %','DSCR',
    'Current Stage','Pipeline Status','Offer ID','Offer Amount','Offer Status',
    'Strong Review','High Risk','Offer Ready','Analysis ID','Score ID','Updated At'
  ];

  function ensureSheets() {
    assertDependencies_();
    REOS.Database.ensureTable(VIEW, HEADERS);
  }

  function build() {
    ensureSheets();

    var deals = REOS.Database.getAll(DEALS);
    var analyses = latestByDeal_(safeGetAll_(ANALYSIS), 'Created At');
    var scores = latestByDeal_(safeGetAll_(SCORES), 'Updated At');
    var pipelines = latestByDeal_(safeGetAll_(PIPELINE), 'Updated At');
    var offers = latestByDeal_(safeGetAll_(OFFERS), 'Updated At');

    var rows = deals.map(function (deal) {
      var dealId = String(deal['Deal ID'] || '');
      var analysis = analyses[dealId] || {};
      var score = scores[dealId] || {};
      var pipeline = pipelines[dealId] || {};
      var offer = offers[dealId] || {};

      var risk = String(score['Risk Level'] || analysis['Risk Level'] || '');
      var recommendation = String(score.Recommendation || analysis.Recommendation || '');
      var scoreValue = number_(score.Score);
      var offerStatus = String(offer.Status || '');
      var pipelineStage = String(pipeline['Current Stage'] || '');

      var strongReview = recommendation === 'Strong Review' || scoreValue >= 70;
      var highRisk = risk === 'High';
      var offerReady = Boolean(
        number_(analysis.MAO) > 0 &&
        scoreValue >= 55 &&
        !highRisk &&
        ['Offer Submitted','Negotiation','Under Contract','Due Diligence','Closing','Disposition','Closed']
          .indexOf(pipelineStage) === -1
      );

      return {
        'Rank': 0,
        'Deal ID': dealId,
        'Address': deal.Address || '',
        'City': deal.City || '',
        'State': deal.State || '',
        'Zip': deal.Zip || '',
        'Source': deal.Source || '',
        'Deal Status': deal['Deal Status'] || '',
        'Score': scoreValue,
        'Grade': score.Grade || '',
        'Recommendation': recommendation,
        'Risk Level': risk,
        'Purchase Price': number_(analysis['Purchase Price']),
        'ARV': number_(analysis.ARV),
        'MAO': number_(analysis.MAO),
        'Flip Profit': number_(analysis['Flip Profit']),
        'ROI %': number_(analysis['ROI %']),
        'Cash Required': number_(analysis['Cash Required']),
        'NOI': number_(analysis.NOI),
        'Cap Rate %': number_(analysis['Cap Rate %']),
        'DSCR': number_(analysis.DSCR),
        'Current Stage': pipelineStage,
        'Pipeline Status': pipeline.Status || '',
        'Offer ID': offer['Offer ID'] || '',
        'Offer Amount': number_(offer['Offer Amount']),
        'Offer Status': offerStatus,
        'Strong Review': strongReview,
        'High Risk': highRisk,
        'Offer Ready': offerReady,
        'Analysis ID': analysis['Analysis ID'] || '',
        'Score ID': score['Score ID'] || '',
        'Updated At': new Date()
      };
    });

    rows.sort(function (a, b) {
      var scoreDiff = number_(b.Score) - number_(a.Score);
      if (scoreDiff !== 0) return scoreDiff;
      return number_(b['ROI %']) - number_(a['ROI %']);
    });

    rows.forEach(function (row, index) {
      row.Rank = index + 1;
    });

    replaceViewRows_(rows);

    var result = summarizeRows_(rows);
    result.ok = true;
    result.generatedAt = new Date().toISOString();
    result.rowsWritten = rows.length;

    publish_('acquisition.opportunity.view.built', result);
    return result;
  }

  function summary() {
    ensureSheets();
    var rows = REOS.Database.getAll(VIEW);
    var result = summarizeRows_(rows);
    result.ok = true;
    result.generatedAt = new Date().toISOString();
    return result;
  }

  function summarizeRows_(rows) {
    rows = rows || [];
    var gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0, Unscored: 0 };
    var scoreTotal = 0;
    var scoreCount = 0;
    var roiTotal = 0;
    var roiCount = 0;
    var dscrTotal = 0;
    var dscrCount = 0;

    rows.forEach(function (row) {
      var grade = String(row.Grade || '');
      if (Object.prototype.hasOwnProperty.call(gradeCounts, grade)) gradeCounts[grade]++;
      else gradeCounts.Unscored++;

      var score = number_(row.Score);
      if (score > 0 || grade) {
        scoreTotal += score;
        scoreCount++;
      }

      var roi = number_(row['ROI %']);
      if (roi !== 0) {
        roiTotal += roi;
        roiCount++;
      }

      var dscr = number_(row.DSCR);
      if (dscr > 0) {
        dscrTotal += dscr;
        dscrCount++;
      }
    });

    return {
      totalOpportunities: rows.length,
      scoredOpportunities: scoreCount,
      averageScore: scoreCount ? round_(scoreTotal / scoreCount) : 0,
      averageROI: roiCount ? round_(roiTotal / roiCount) : 0,
      averageDSCR: dscrCount ? round_(dscrTotal / dscrCount) : 0,
      strongReview: rows.filter(function (row) { return truthy_(row['Strong Review']); }).length,
      highRisk: rows.filter(function (row) { return truthy_(row['High Risk']); }).length,
      offerReady: rows.filter(function (row) { return truthy_(row['Offer Ready']); }).length,
      draftOffers: rows.filter(function (row) {
        return String(row['Offer Status'] || '').toLowerCase() === 'draft';
      }).length,
      gradeCounts: gradeCounts,
      topOpportunities: rows.slice(0, 10).map(function (row) {
        return {
          rank: number_(row.Rank),
          dealId: row['Deal ID'] || '',
          address: row.Address || '',
          score: number_(row.Score),
          grade: row.Grade || '',
          roi: number_(row['ROI %']),
          riskLevel: row['Risk Level'] || '',
          stage: row['Current Stage'] || '',
          offerReady: truthy_(row['Offer Ready'])
        };
      })
    };
  }

  function replaceViewRows_(rows) {
    var sheet = REOS.Database.getSheet(VIEW);
    var lastRow = sheet.getLastRow();
    var lastColumn = HEADERS.length;

    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), lastColumn)).clearContent();
    }

    if (!rows.length) return;

    var values = rows.map(function (row) {
      return HEADERS.map(function (header) {
        return Object.prototype.hasOwnProperty.call(row, header) ? row[header] : '';
      });
    });

    sheet.getRange(2, 1, values.length, HEADERS.length).setValues(values);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
  }

  function latestByDeal_(rows, dateField) {
    var map = {};
    (rows || []).forEach(function (row) {
      var dealId = String(row['Deal ID'] || '');
      if (!dealId) return;

      var current = map[dealId];
      if (!current || timestamp_(row[dateField]) >= timestamp_(current[dateField])) {
        map[dealId] = row;
      }
    });
    return map;
  }

  function safeGetAll_(sheetName) {
    try {
      return REOS.Database.getAll(sheetName);
    } catch (error) {
      return [];
    }
  }

  function timestamp_(value) {
    if (!value) return 0;
    var date = value instanceof Date ? value : new Date(value);
    var time = date.getTime();
    return isFinite(time) ? time : 0;
  }

  function truthy_(value) {
    return value === true || String(value).toLowerCase() === 'true' || value === 1;
  }

  function number_(value) {
    var parsed = Number(value || 0);
    return isFinite(parsed) ? parsed : 0;
  }

  function round_(value) {
    return Math.round((number_(value) + Number.EPSILON) * 100) / 100;
  }

  function assertDependencies_() {
    if (!REOS.Database) throw new Error('REOS.Database is required.');
  }

  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) {
      REOS.PluginEventBus.publish(topic, payload, 'acquisitions');
    }
  }

  return {
    ensureSheets: ensureSheets,
    build: build,
    summary: summary
  };
})();

function reosSprint52BuildOpportunityView() {
  var result = REOS.AcquisitionOpportunityView.build();
  console.log(JSON.stringify(result, null, 2).slice(0, 10000));
  return result;
}

function reosSprint52OpportunitySummary() {
  var result = REOS.AcquisitionOpportunityView.summary();
  console.log(JSON.stringify(result, null, 2).slice(0, 10000));
  return result;
}
