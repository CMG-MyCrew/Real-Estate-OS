/**
 * REOS Enterprise v3.4.2
 * Sprint 5.2 — Acquisition Deal Integration
 * Increment 1: pipeline + analysis + scoring + draft offer orchestration.
 */

var REOS = REOS || {};

REOS.AcquisitionDealIntegration = (function () {
  var DEALS = 'DEALS';
  var ANALYSIS = 'DEAL_ANALYSIS';
  var OFFERS = 'OFFERS';
  var SCORES = 'ACQUISITION_DEAL_SCORES';

  function ensureSheets() {
    assertDependencies_();
    REOS.DealAnalyzer.ensureSheets();
    REOS.AcquisitionPipeline.ensureSheets();
    REOS.Database.ensureTable(SCORES, [
      'Score ID',
      'Deal ID',
      'Analysis ID',
      'Score',
      'Grade',
      'MAO',
      'Purchase Price',
      'ROI %',
      'DSCR',
      'Risk Level',
      'Recommendation',
      'Score Breakdown JSON',
      'Created At',
      'Updated At'
    ]);
  }

  /**
   * Runs the first complete acquisition workflow for one deal.
   *
   * options:
   *   createDraftOffer: defaults to true
   *   advancePipeline: defaults to true
   *   offerType: defaults to Cash
   *   offerTerms: optional
   */
  function processDeal(dealId, analysisInput, options) {
    ensureSheets();
    options = options || {};

    var deal = requireDeal_(dealId);
    var pipeline = REOS.AcquisitionPipeline.getPipeline(dealId) ||
      REOS.AcquisitionPipeline.createPipeline(dealId);

    var analysis = REOS.DealAnalyzer.analyzeDeal(dealId, analysisInput || {});
    var score = scoreAnalysis_(analysis);
    var scoreRow = saveScore_(dealId, analysis, score);
    var offer = null;

    if (options.createDraftOffer !== false && number_(analysis.MAO) > 0) {
      offer = createDraftOfferIfMissing_(dealId, analysis, options);
    }

    if (options.advancePipeline !== false) {
      pipeline = advanceToInitialAnalysis_(dealId, pipeline, score);
    }

    var result = {
      ok: true,
      deal: deal,
      pipeline: pipeline,
      analysis: analysis,
      score: scoreRow,
      offer: offer
    };

    publish_('acquisition.deal.processed', {
      dealId: dealId,
      analysisId: analysis['Analysis ID'],
      score: score.score,
      grade: score.grade,
      offerId: offer ? offer['Offer ID'] : ''
    });

    return result;
  }

  function processLatestDeal(analysisInput, options) {
    ensureSheets();
    var deals = REOS.Database.getAll(DEALS);
    if (!deals.length) throw new Error('No deals found.');
    return processDeal(deals[deals.length - 1]['Deal ID'], analysisInput || {}, options || {});
  }

  function getLatestScore(dealId) {
    ensureSheets();
    var rows = REOS.Database.getAll(SCORES).filter(function (row) {
      return String(row['Deal ID'] || '') === String(dealId || '');
    });
    return rows.length ? rows[rows.length - 1] : null;
  }

  function scoreAnalysis_(analysis) {
    var roi = number_(analysis['ROI %']);
    var dscr = number_(analysis.DSCR);
    var mao = number_(analysis.MAO);
    var purchase = number_(analysis['Purchase Price']);
    var risk = String(analysis['Risk Level'] || 'High');
    var recommendation = String(analysis.Recommendation || 'Review');

    var roiPoints = clamp_(roi, 0, 30);
    var maoPoints = 0;
    if (mao > 0) {
      var discountToMao = ((mao - purchase) / mao) * 100;
      maoPoints = clamp_(15 + discountToMao, 0, 30);
    }

    var dscrPoints = 10;
    if (dscr >= 1.50) dscrPoints = 20;
    else if (dscr >= 1.20) dscrPoints = 16;
    else if (dscr > 0) dscrPoints = 6;

    var riskPoints = risk === 'Low' ? 15 : (risk === 'Medium' ? 8 : 0);
    var recommendationPoints = recommendation === 'Strong Review' ? 5 :
      (recommendation === 'Review' ? 2 : 0);

    var total = Math.round(clamp_(
      roiPoints + maoPoints + dscrPoints + riskPoints + recommendationPoints,
      0,
      100
    ));

    return {
      score: total,
      grade: grade_(total),
      breakdown: {
        roiPoints: round_(roiPoints),
        maoPoints: round_(maoPoints),
        dscrPoints: round_(dscrPoints),
        riskPoints: round_(riskPoints),
        recommendationPoints: round_(recommendationPoints)
      }
    };
  }

  function saveScore_(dealId, analysis, score) {
    return REOS.Database.insert(SCORES, {
      'Deal ID': dealId,
      'Analysis ID': analysis['Analysis ID'],
      Score: score.score,
      Grade: score.grade,
      MAO: number_(analysis.MAO),
      'Purchase Price': number_(analysis['Purchase Price']),
      'ROI %': number_(analysis['ROI %']),
      DSCR: number_(analysis.DSCR),
      'Risk Level': analysis['Risk Level'] || '',
      Recommendation: analysis.Recommendation || '',
      'Score Breakdown JSON': json_(score.breakdown),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'Score ID', idPrefix: 'DSCORE' });
  }

  function createDraftOfferIfMissing_(dealId, analysis, options) {
    var existing = REOS.Database.getAll(OFFERS).filter(function (row) {
      return String(row['Deal ID'] || '') === String(dealId) &&
        String(row.Status || '').toLowerCase() === 'draft';
    });

    if (existing.length) return existing[existing.length - 1];

    return REOS.DealAnalyzer.createOffer(dealId, {
      offerType: options.offerType || 'Cash',
      offerAmount: analysis.MAO,
      status: 'Draft',
      terms: options.offerTerms || 'Offer based on REOS calculated MAO.',
      notes: 'Auto-generated by Sprint 5.2 acquisition integration.'
    });
  }

  function advanceToInitialAnalysis_(dealId, pipeline, score) {
    var currentStage = String(pipeline['Current Stage'] || 'Lead');
    var stages = REOS.AcquisitionPipeline.STAGES || [
      'Lead', 'Property Review', 'Initial Analysis', 'Comparable Analysis',
      'Offer Generation', 'Offer Submitted', 'Negotiation', 'Under Contract',
      'Due Diligence', 'Closing', 'Disposition', 'Closed'
    ];
    var currentIndex = stages.indexOf(currentStage);
    var targetIndex = stages.indexOf('Initial Analysis');

    if (currentIndex >= targetIndex) return pipeline;

    return REOS.AcquisitionPipeline.advanceStage(
      dealId,
      'Initial Analysis',
      'Automated Deal Analyzer completed. Score ' + score.score + ' (' + score.grade + ').'
    );
  }

  function requireDeal_(dealId) {
    if (!dealId) throw new Error('Deal ID is required.');
    var deal = REOS.Database.findById(DEALS, 'Deal ID', dealId);
    if (!deal) throw new Error('Deal not found: ' + dealId);
    return deal;
  }

  function assertDependencies_() {
    if (!REOS.Database) throw new Error('REOS.Database is required.');
    if (!REOS.DealAnalyzer) throw new Error('REOS.DealAnalyzer is required.');
    if (!REOS.AcquisitionPipeline) throw new Error('REOS.AcquisitionPipeline is required.');
  }

  function grade_(score) {
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  function clamp_(value, min, max) {
    return Math.min(Math.max(number_(value), min), max);
  }

  function number_(value) {
    var parsed = Number(value || 0);
    return isFinite(parsed) ? parsed : 0;
  }

  function round_(value) {
    return Math.round((number_(value) + Number.EPSILON) * 100) / 100;
  }

  function json_(value) {
    if (REOS.toJson_) return REOS.toJson_(value);
    return JSON.stringify(value);
  }

  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) {
      REOS.PluginEventBus.publish(topic, payload, 'acquisitions');
    }
  }

  return {
    ensureSheets: ensureSheets,
    processDeal: processDeal,
    processLatestDeal: processLatestDeal,
    getLatestScore: getLatestScore,
    scoreAnalysis: scoreAnalysis_
  };
})();

function reosSprint52EnsureSheets() {
  REOS.AcquisitionDealIntegration.ensureSheets();
  var result = { ok: true, message: 'Sprint 5.2 integration sheets ready.' };
  console.log(JSON.stringify(result));
  return result;
}

function reosSprint52ProcessLatestDemo() {
  var result = REOS.AcquisitionDealIntegration.processLatestDeal({
    purchasePrice: 95000,
    arv: 165000,
    repairCost: 25000,
    holdingCost: 4500,
    closingCost: 3500,
    financingCost: 2500,
    sellingCost: 9900,
    assignmentFee: 10000,
    rentMonthly: 1450,
    taxesAnnual: 2200,
    insuranceAnnual: 1500,
    hoaMonthly: 0,
    loanPaymentMonthly: 750
  }, {
    createDraftOffer: true,
    advancePipeline: true
  });

  console.log(JSON.stringify(result, null, 2).slice(0, 5000));
  return result;
}
