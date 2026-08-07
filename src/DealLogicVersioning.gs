/*
 * REOS Enterprise v3.6.0
 * Deal Logic Versioning
 *
 * Updates the latest analysis by default, creates explicit versions on demand,
 * synchronizes the latest acquisition score, and reuses the active draft offer.
 */

var REOS = REOS || {};

REOS.DealLogicVersioning = (function () {
  var DEALS = 'DEALS';
  var ANALYSIS = 'DEAL_ANALYSIS';
  var OFFERS = 'OFFERS';
  var SCORES = 'ACQUISITION_DEAL_SCORES';

  function ensureSheets() {
    assertDependencies_();
    REOS.DealAnalyzer.ensureSheets();
    REOS.Database.ensureTable(ANALYSIS, [
      'Analysis ID','Deal ID','Analysis Version','Previous Analysis ID','Save Mode',
      'Purchase Price','ARV','Repair Cost','Holding Cost','Closing Cost','Financing Cost',
      'Selling Cost','Assignment Fee','Rent Monthly','Taxes Annual','Insurance Annual',
      'HOA Monthly','Loan Payment Monthly','MAO Percent','Operating Expense Percent',
      'MAO','Flip Profit','ROI %','Cash Required','NOI','Cap Rate %','DSCR',
      'Recommendation','Risk Level','Summary JSON','Created By','Created At','Updated By','Updated At'
    ]);
    REOS.Database.ensureTable(OFFERS, [
      'Offer ID','Deal ID','Analysis ID','Offer Type','Offer Amount','Status','Terms','Notes',
      'Created By','Created At','Updated By','Updated At'
    ]);
    REOS.Database.ensureTable(SCORES, [
      'Score ID','Deal ID','Analysis ID','Score','Grade','MAO','Purchase Price','ROI %','DSCR',
      'Risk Level','Recommendation','Score Breakdown JSON','Created At','Updated At'
    ]);
  }

  function save(dealId, analysisInput, options) {
    ensureSheets();
    options = options || {};
    if (!dealId) throw new Error('Deal ID is required.');
    if (!REOS.Database.findById(DEALS, 'Deal ID', dealId)) throw new Error('Deal not found: ' + dealId);

    var mode = normalizeMode_(options.analysisSaveMode);
    var metrics = REOS.DealAnalyzer.calculate(analysisInput || {});
    var latest = latestForDeal_(ANALYSIS, dealId, 'Updated At', 'Created At');
    var user = getUser_();
    var now = new Date();
    var version = latest ? Math.max(1, number_(latest['Analysis Version']) || countForDeal_(ANALYSIS, dealId)) : 1;
    var record = buildAnalysisRecord_(dealId, analysisInput || {}, metrics, {
      mode: mode,
      version: mode === 'create_version' && latest ? version + 1 : version,
      previousAnalysisId: mode === 'create_version' && latest ? latest['Analysis ID'] || '' : latest ? latest['Previous Analysis ID'] || '' : '',
      user: user,
      now: now,
      createdAt: latest ? latest['Created At'] : now,
      createdBy: latest ? latest['Created By'] : user
    });

    var analysis;
    var createdVersion = false;
    if (mode === 'create_version' || !latest) {
      analysis = REOS.Database.insert(ANALYSIS, record, {
        idField: 'Analysis ID',
        idPrefix: 'ANL'
      });
      createdVersion = Boolean(latest);
    } else {
      REOS.Database.update(ANALYSIS, 'Analysis ID', latest['Analysis ID'], record);
      analysis = REOS.Database.findById(ANALYSIS, 'Analysis ID', latest['Analysis ID']);
    }

    var score = upsertScore_(dealId, analysis, metrics);
    var offer = null;
    if (options.createDraftOffer !== false && number_(analysis.MAO) > 0) {
      offer = upsertDraftOffer_(dealId, analysis, options, user, now);
    }

    if (options.advancePipeline !== false && REOS.AcquisitionPipeline) {
      try {
        var pipeline = REOS.AcquisitionPipeline.getPipeline(dealId) || REOS.AcquisitionPipeline.createPipeline(dealId);
        var current = String(pipeline['Current Stage'] || 'Lead');
        var stages = REOS.AcquisitionPipeline.STAGES || ['Lead','Property Review','Initial Analysis'];
        if (stages.indexOf(current) < stages.indexOf('Initial Analysis')) {
          REOS.AcquisitionPipeline.advanceStage(
            dealId,
            'Initial Analysis',
            'Deal analysis v' + analysis['Analysis Version'] + ' saved. Score ' + score.Score + ' (' + score.Grade + ').'
          );
        }
      } catch (ignored) {}
    }

    publish_('deal.logic.saved', {
      dealId: dealId,
      analysisId: analysis['Analysis ID'],
      analysisVersion: analysis['Analysis Version'],
      saveMode: mode,
      offerId: offer ? offer['Offer ID'] : '',
      scoreId: score ? score['Score ID'] : ''
    });

    return {
      ok: true,
      saveMode: mode,
      createdVersion: createdVersion,
      analysis: analysis,
      score: score,
      offer: offer
    };
  }

  function buildAnalysisRecord_(dealId, input, metrics, meta) {
    return {
      'Deal ID': dealId,
      'Analysis Version': meta.version,
      'Previous Analysis ID': meta.previousAnalysisId,
      'Save Mode': meta.mode === 'create_version' ? 'Create New Version' : 'Update Latest',
      'Purchase Price': money_(input.purchasePrice),
      ARV: money_(input.arv),
      'Repair Cost': money_(input.repairCost),
      'Holding Cost': money_(input.holdingCost),
      'Closing Cost': money_(input.closingCost),
      'Financing Cost': money_(input.financingCost),
      'Selling Cost': money_(input.sellingCost),
      'Assignment Fee': money_(input.assignmentFee),
      'Rent Monthly': money_(input.rentMonthly),
      'Taxes Annual': money_(input.taxesAnnual),
      'Insurance Annual': money_(input.insuranceAnnual),
      'HOA Monthly': money_(input.hoaMonthly),
      'Loan Payment Monthly': money_(input.loanPaymentMonthly),
      'MAO Percent': metrics.maoPercent,
      'Operating Expense Percent': metrics.operatingExpensePercent,
      MAO: metrics.mao,
      'Flip Profit': metrics.flipProfit,
      'ROI %': metrics.roi,
      'Cash Required': metrics.cashRequired,
      NOI: metrics.noi,
      'Cap Rate %': metrics.capRate,
      DSCR: metrics.dscr,
      Recommendation: metrics.recommendation,
      'Risk Level': metrics.riskLevel,
      'Summary JSON': json_(metrics),
      'Created By': meta.createdBy || meta.user,
      'Created At': meta.createdAt || meta.now,
      'Updated By': meta.user,
      'Updated At': meta.now
    };
  }

  function upsertScore_(dealId, analysis, metrics) {
    var score = calculateScore_(analysis);
    var existing = latestForDeal_(SCORES, dealId, 'Updated At', 'Created At');
    var now = new Date();
    var record = {
      'Deal ID': dealId,
      'Analysis ID': analysis['Analysis ID'],
      Score: score.score,
      Grade: score.grade,
      MAO: number_(metrics.mao),
      'Purchase Price': number_(analysis['Purchase Price']),
      'ROI %': number_(metrics.roi),
      DSCR: number_(metrics.dscr),
      'Risk Level': metrics.riskLevel || '',
      Recommendation: metrics.recommendation || '',
      'Score Breakdown JSON': json_(score.breakdown),
      'Updated At': now
    };

    if (existing) {
      REOS.Database.update(SCORES, 'Score ID', existing['Score ID'], record);
      return REOS.Database.findById(SCORES, 'Score ID', existing['Score ID']);
    }

    record['Created At'] = now;
    return REOS.Database.insert(SCORES, record, { idField: 'Score ID', idPrefix: 'DSCORE' });
  }

  function upsertDraftOffer_(dealId, analysis, options, user, now) {
    var drafts = REOS.Database.getAll(OFFERS).filter(function (row) {
      return String(row['Deal ID'] || '') === String(dealId) && String(row.Status || '').toLowerCase() === 'draft';
    });
    drafts.sort(function (a, b) { return timestamp_(a['Updated At'] || a['Created At']) - timestamp_(b['Updated At'] || b['Created At']); });
    var latest = drafts.length ? drafts[drafts.length - 1] : null;
    var record = {
      'Deal ID': dealId,
      'Analysis ID': analysis['Analysis ID'],
      'Offer Type': options.offerType || 'Cash',
      'Offer Amount': number_(analysis.MAO),
      Status: 'Draft',
      Terms: options.offerTerms || 'Offer based on REOS calculated MAO.',
      Notes: 'Synchronized by Deal Logic Versioning from analysis v' + analysis['Analysis Version'] + '.',
      'Updated By': user,
      'Updated At': now
    };

    if (latest) {
      REOS.Database.update(OFFERS, 'Offer ID', latest['Offer ID'], record);
      return REOS.Database.findById(OFFERS, 'Offer ID', latest['Offer ID']);
    }

    record['Created By'] = user;
    record['Created At'] = now;
    return REOS.Database.insert(OFFERS, record, { idField: 'Offer ID', idPrefix: 'OFF' });
  }

  function calculateScore_(analysis) {
    var roi = number_(analysis['ROI %']);
    var dscr = number_(analysis.DSCR);
    var mao = number_(analysis.MAO);
    var purchase = number_(analysis['Purchase Price']);
    var risk = String(analysis['Risk Level'] || 'High');
    var recommendation = String(analysis.Recommendation || 'Review');
    var roiPoints = clamp_(roi, 0, 30);
    var maoPoints = mao > 0 ? clamp_(15 + (((mao - purchase) / mao) * 100), 0, 30) : 0;
    var dscrPoints = dscr >= 1.50 ? 20 : dscr >= 1.20 ? 16 : dscr > 0 ? 6 : 10;
    var riskPoints = risk === 'Low' ? 15 : risk === 'Medium' ? 8 : 0;
    var recommendationPoints = recommendation === 'Strong Review' ? 5 : recommendation === 'Review' ? 2 : 0;
    var total = Math.round(clamp_(roiPoints + maoPoints + dscrPoints + riskPoints + recommendationPoints, 0, 100));
    return {
      score: total,
      grade: total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F',
      breakdown: {
        roiPoints: round2_(roiPoints),
        maoPoints: round2_(maoPoints),
        dscrPoints: round2_(dscrPoints),
        riskPoints: round2_(riskPoints),
        recommendationPoints: round2_(recommendationPoints)
      }
    };
  }

  function latestForDeal_(sheetName, dealId, primaryDate, fallbackDate) {
    var rows = REOS.Database.getAll(sheetName).filter(function (row) {
      return String(row['Deal ID'] || '') === String(dealId || '');
    });
    rows.sort(function (a, b) {
      return timestamp_(a[primaryDate] || a[fallbackDate]) - timestamp_(b[primaryDate] || b[fallbackDate]);
    });
    return rows.length ? rows[rows.length - 1] : null;
  }

  function countForDeal_(sheetName, dealId) {
    return REOS.Database.getAll(sheetName).filter(function (row) {
      return String(row['Deal ID'] || '') === String(dealId || '');
    }).length || 1;
  }

  function normalizeMode_(mode) {
    mode = String(mode || 'update_latest').toLowerCase().replace(/[\s-]+/g, '_');
    return mode === 'create_version' || mode === 'new_version' ? 'create_version' : 'update_latest';
  }

  function getUser_() {
    try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
  }
  function money_(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    var parsed = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
    return isFinite(parsed) ? parsed : 0;
  }
  function number_(value) { return money_(value); }
  function timestamp_(value) {
    if (!value) return 0;
    var d = value instanceof Date ? value : new Date(value);
    return isFinite(d.getTime()) ? d.getTime() : 0;
  }
  function clamp_(value, min, max) { return Math.max(min, Math.min(max, number_(value))); }
  function round2_(value) { return Math.round((number_(value) + Number.EPSILON) * 100) / 100; }
  function json_(value) {
    try { return JSON.stringify(value); } catch (e) { return '{}'; }
  }
  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) REOS.PluginEventBus.publish(topic, payload, 'acquisitions');
  }
  function assertDependencies_() {
    if (!REOS.Database) throw new Error('REOS.Database is required.');
    if (!REOS.DealAnalyzer) throw new Error('REOS.DealAnalyzer is required.');
  }

  return {
    ensureSheets: ensureSheets,
    save: save
  };
})();

function reosDealLogicEnsureSheets() {
  REOS.DealLogicVersioning.ensureSheets();
  return { ok: true, message: 'Deal logic versioning columns are ready.' };
}

function reosDealLogicSave(dealId, analysis, options) {
  return REOS.DealLogicVersioning.save(dealId, analysis || {}, options || {});
}
