/**
 * REOS Enterprise v3.4.3
 * Sprint 5.2 — Acquisition Deal Integration
 * Increment 2: batch queue, idempotency, skip rules, and run summaries.
 */

var REOS = REOS || {};

REOS.AcquisitionDealIntegration = (function () {
  var DEALS = 'DEALS';
  var ANALYSIS = 'DEAL_ANALYSIS';
  var OFFERS = 'OFFERS';
  var SCORES = 'ACQUISITION_DEAL_SCORES';
  var BATCH_RUNS = 'ACQUISITION_BATCH_RUNS';
  var BATCH_ITEMS = 'ACQUISITION_BATCH_ITEMS';

  function ensureSheets() {
    assertDependencies_();
    REOS.DealAnalyzer.ensureSheets();
    REOS.AcquisitionPipeline.ensureSheets();

    REOS.Database.ensureTable(SCORES, [
      'Score ID','Deal ID','Analysis ID','Score','Grade','MAO','Purchase Price',
      'ROI %','DSCR','Risk Level','Recommendation','Score Breakdown JSON',
      'Created At','Updated At'
    ]);

    REOS.Database.ensureTable(BATCH_RUNS, [
      'Batch Run ID','Started At','Completed At','Status','Total Deals','Processed',
      'Skipped','Errors','Duration Ms','Options JSON','Summary JSON','Created At','Updated At'
    ]);

    REOS.Database.ensureTable(BATCH_ITEMS, [
      'Batch Item ID','Batch Run ID','Deal ID','Status','Reason','Analysis ID',
      'Score ID','Offer ID','Duration Ms','Error Message','Created At','Updated At'
    ]);
  }

  /**
   * Runs the complete acquisition workflow for one deal.
   *
   * options:
   *   createDraftOffer: defaults to true
   *   advancePipeline: defaults to true
   *   offerType: defaults to Cash
   *   offerTerms: optional
   *   reuseLatestAnalysis: defaults to false
   *   forceReprocess: defaults to false
   */
  function processDeal(dealId, analysisInput, options) {
    ensureSheets();
    options = options || {};

    var deal = requireDeal_(dealId);
    var existingScore = getLatestScore(dealId);
    if (existingScore && options.forceReprocess !== true) {
      return {
        ok: true,
        skipped: true,
        reason: 'Deal already scored.',
        deal: deal,
        score: existingScore
      };
    }

    var pipeline = REOS.AcquisitionPipeline.getPipeline(dealId) ||
      REOS.AcquisitionPipeline.createPipeline(dealId);

    var analysis = null;
    if (options.reuseLatestAnalysis === true) {
      analysis = getLatestAnalysis_(dealId);
    }
    if (!analysis) {
      analysis = REOS.DealAnalyzer.analyzeDeal(dealId, analysisInput || {});
    }

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
      skipped: false,
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

  /**
   * Processes unscored deals in a resilient queue.
   *
   * Queue eligibility:
   * - Deal must not already have a score unless forceReprocess=true.
   * - Deal must have an existing analysis with Purchase Price and ARV > 0.
   * - Existing analysis is reused to prevent duplicate analysis rows.
   */
  function processQueue(options) {
    ensureSheets();
    options = options || {};

    var startedAt = new Date();
    var limit = Math.max(1, Math.min(number_(options.limit) || 50, 250));
    var forceReprocess = options.forceReprocess === true;
    var deals = REOS.Database.getAll(DEALS).slice(0, limit);

    var run = REOS.Database.insert(BATCH_RUNS, {
      'Started At': startedAt,
      'Completed At': '',
      Status: 'Running',
      'Total Deals': deals.length,
      Processed: 0,
      Skipped: 0,
      Errors: 0,
      'Duration Ms': 0,
      'Options JSON': json_({
        limit: limit,
        forceReprocess: forceReprocess,
        createDraftOffer: options.createDraftOffer !== false,
        advancePipeline: options.advancePipeline !== false
      }),
      'Summary JSON': ''
    }, { idField: 'Batch Run ID', idPrefix: 'BATCH' });

    var summary = {
      ok: true,
      batchRunId: run['Batch Run ID'],
      startedAt: startedAt.toISOString(),
      completedAt: '',
      totalDeals: deals.length,
      processed: 0,
      skipped: 0,
      errors: 0,
      durationMs: 0,
      items: []
    };

    deals.forEach(function (deal) {
      var itemStarted = new Date();
      var dealId = String(deal['Deal ID'] || '');
      var item = {
        dealId: dealId,
        status: '',
        reason: '',
        analysisId: '',
        scoreId: '',
        offerId: '',
        durationMs: 0,
        errorMessage: ''
      };

      try {
        if (!dealId) {
          item.status = 'Skipped';
          item.reason = 'Missing Deal ID.';
          summary.skipped++;
        } else if (!forceReprocess && getLatestScore(dealId)) {
          item.status = 'Skipped';
          item.reason = 'Deal already scored.';
          summary.skipped++;
        } else {
          var latestAnalysis = getLatestAnalysis_(dealId);
          var validation = validateAnalysisForQueue_(latestAnalysis);

          if (!validation.ok) {
            item.status = 'Skipped';
            item.reason = validation.reason;
            item.analysisId = latestAnalysis ? latestAnalysis['Analysis ID'] || '' : '';
            summary.skipped++;
          } else {
            var result = processDeal(dealId, {}, {
              createDraftOffer: options.createDraftOffer !== false,
              advancePipeline: options.advancePipeline !== false,
              offerType: options.offerType || 'Cash',
              offerTerms: options.offerTerms || '',
              reuseLatestAnalysis: true,
              forceReprocess: forceReprocess
            });

            item.status = result.skipped ? 'Skipped' : 'Processed';
            item.reason = result.reason || '';
            item.analysisId = result.analysis ? result.analysis['Analysis ID'] || '' : '';
            item.scoreId = result.score ? result.score['Score ID'] || '' : '';
            item.offerId = result.offer ? result.offer['Offer ID'] || '' : '';

            if (result.skipped) summary.skipped++;
            else summary.processed++;
          }
        }
      } catch (error) {
        item.status = 'Error';
        item.errorMessage = error && error.message ? error.message : String(error);
        summary.errors++;
      }

      item.durationMs = new Date().getTime() - itemStarted.getTime();
      summary.items.push(item);
      saveBatchItem_(run['Batch Run ID'], item);
    });

    var completedAt = new Date();
    summary.completedAt = completedAt.toISOString();
    summary.durationMs = completedAt.getTime() - startedAt.getTime();

    REOS.Database.update(BATCH_RUNS, 'Batch Run ID', run['Batch Run ID'], {
      'Completed At': completedAt,
      Status: summary.errors > 0 ? 'Completed With Errors' : 'Completed',
      Processed: summary.processed,
      Skipped: summary.skipped,
      Errors: summary.errors,
      'Duration Ms': summary.durationMs,
      'Summary JSON': json_(summary)
    });

    publish_('acquisition.batch.completed', summary);
    return summary;
  }

  function getBatchSummary(batchRunId) {
    ensureSheets();
    var run = null;

    if (batchRunId) {
      run = REOS.Database.findById(BATCH_RUNS, 'Batch Run ID', batchRunId);
    } else {
      var runs = REOS.Database.getAll(BATCH_RUNS);
      run = runs.length ? runs[runs.length - 1] : null;
    }

    if (!run) {
      return { ok: true, message: 'No batch runs found.', run: null, items: [] };
    }

    var items = REOS.Database.getAll(BATCH_ITEMS).filter(function (row) {
      return String(row['Batch Run ID'] || '') === String(run['Batch Run ID'] || '');
    });

    return {
      ok: true,
      run: run,
      items: items
    };
  }

  function getLatestScore(dealId) {
    ensureSheets();
    var rows = REOS.Database.getAll(SCORES).filter(function (row) {
      return String(row['Deal ID'] || '') === String(dealId || '');
    });
    return rows.length ? rows[rows.length - 1] : null;
  }

  function getLatestAnalysis_(dealId) {
    var rows = REOS.Database.getAll(ANALYSIS).filter(function (row) {
      return String(row['Deal ID'] || '') === String(dealId || '');
    });
    return rows.length ? rows[rows.length - 1] : null;
  }

  function validateAnalysisForQueue_(analysis) {
    if (!analysis) {
      return { ok: false, reason: 'No existing deal analysis.' };
    }

    var missing = [];
    if (number_(analysis['Purchase Price']) <= 0) missing.push('Purchase Price');
    if (number_(analysis.ARV) <= 0) missing.push('ARV');

    if (missing.length) {
      return {
        ok: false,
        reason: 'Missing required financial data: ' + missing.join(', ') + '.'
      };
    }

    return { ok: true, reason: '' };
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

  function saveBatchItem_(batchRunId, item) {
    return REOS.Database.insert(BATCH_ITEMS, {
      'Batch Run ID': batchRunId,
      'Deal ID': item.dealId,
      Status: item.status,
      Reason: item.reason,
      'Analysis ID': item.analysisId,
      'Score ID': item.scoreId,
      'Offer ID': item.offerId,
      'Duration Ms': item.durationMs,
      'Error Message': item.errorMessage
    }, { idField: 'Batch Item ID', idPrefix: 'BITEM' });
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
      'Lead','Property Review','Initial Analysis','Comparable Analysis',
      'Offer Generation','Offer Submitted','Negotiation','Under Contract',
      'Due Diligence','Closing','Disposition','Closed'
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
    processQueue: processQueue,
    getBatchSummary: getBatchSummary,
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
    advancePipeline: true,
    forceReprocess: true
  });

  console.log(JSON.stringify(result, null, 2).slice(0, 5000));
  return result;
}

function reosSprint52ProcessQueue() {
  var result = REOS.AcquisitionDealIntegration.processQueue({
    limit: 50,
    createDraftOffer: true,
    advancePipeline: true,
    forceReprocess: false
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 10000));
  return result;
}

function reosSprint52BatchSummary() {
  var result = REOS.AcquisitionDealIntegration.getBatchSummary();
  console.log(JSON.stringify(result, null, 2).slice(0, 10000));
  return result;
}
