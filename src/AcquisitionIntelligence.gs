/**
 * REOS Enterprise v4.3.0
 * Sprint 7.2 — AI Acquisition Intelligence
 *
 * Explainable opportunity scoring, MAO calculations, strategy selection,
 * risk evaluation, and acquisition recommendations.
 */
var REOS = REOS || {};

REOS.AcquisitionIntelligence = (function () {
  var LEADS = 'IA_LEADS';
  var DECISIONS = 'AI_ACQUISITION_DECISIONS';
  var RUNS = 'AI_ACQUISITION_RUNS';

  var DECISION_HEADERS = [
    'Decision ID','Lead ID','Deal ID','Address','City','State',
    'Lead Score','Grade','Estimated Value','ARV','Estimated Repairs',
    'Estimated Debt','Asking Price','Estimated Equity','Equity %',
    'Flip MAO','Wholesale MAO','Rental MAO','Recommended Offer',
    'Recommended Strategy','Projected Profit','Projected ROI %',
    'Risk Level','Confidence','Decision','Explanation',
    'Components JSON','Status','Generated At','Updated At'
  ];

  var RUN_HEADERS = [
    'Intelligence Run ID','Status','Leads Found','Leads Analyzed',
    'Recommendations','Rejected','Errors','Top Score',
    'Average Recommended Offer','Started At','Completed At',
    'Duration Ms','Summary JSON','Errors JSON'
  ];

  var DEFAULTS = {
    flipRulePercent: 0.70,
    wholesaleFee: 10000,
    closingCostPercent: 0.03,
    holdingCostPercent: 0.06,
    rentalDiscountPercent: 0.78,
    minimumProfit: 20000,
    minimumROI: 15,
    minimumLeadScore: 55
  };

  function ensureSheets() {
    REOS.Database.ensureTable(DECISIONS, DECISION_HEADERS);
    REOS.Database.ensureTable(RUNS, RUN_HEADERS);

    return {
      ok: true,
      decisions: DECISIONS,
      runs: RUNS
    };
  }

  function analyzeLead(lead, options) {
    ensureSheets();

    options = Object.assign({}, DEFAULTS, options || {});
    lead = lead || {};

    var leadId = text_(lead['Lead ID'] || lead['Distress Lead ID']);
    var value = number_(
      lead['Estimated Value'] ||
      lead.ARV ||
      lead['After Repair Value']
    );
    var arv = number_(
      lead.ARV ||
      lead['After Repair Value'] ||
      lead['Estimated Value']
    );
    var repairs = number_(lead['Estimated Repairs']);
    var debt = number_(lead['Estimated Debt']);
    var asking = number_(lead['Asking Price']);
    var leadScore = number_(lead['Total Score']);
    var grade = text_(lead.Grade);

    var equity = Math.max(0, value - debt);
    var equityPercent = value > 0
      ? round_((equity / value) * 100)
      : number_(lead['Equity %']);

    var closingCosts = arv * options.closingCostPercent;
    var holdingCosts = arv * options.holdingCostPercent;

    var flipMao = Math.max(
      0,
      (arv * options.flipRulePercent) -
      repairs -
      closingCosts -
      holdingCosts
    );

    var wholesaleMao = Math.max(
      0,
      flipMao - options.wholesaleFee
    );

    var rentalMao = Math.max(
      0,
      (value * options.rentalDiscountPercent) - repairs
    );

    var strategy = chooseStrategy_({
      lead: lead,
      value: value,
      arv: arv,
      repairs: repairs,
      asking: asking,
      equityPercent: equityPercent,
      flipMao: flipMao,
      wholesaleMao: wholesaleMao,
      rentalMao: rentalMao
    });

    var recommendedOffer = strategy === 'Wholesale'
      ? wholesaleMao
      : strategy === 'Rental / BRRRR'
        ? rentalMao
        : flipMao;

    if (asking > 0) {
      recommendedOffer = Math.min(recommendedOffer, asking);
    }

    recommendedOffer = roundCurrency_(recommendedOffer);

    var acquisitionCost = recommendedOffer + repairs + closingCosts + holdingCosts;
    var projectedProfit = strategy === 'Rental / BRRRR'
      ? Math.max(0, value - recommendedOffer - repairs)
      : Math.max(0, arv - acquisitionCost);

    var projectedRoi = acquisitionCost > 0
      ? round_((projectedProfit / acquisitionCost) * 100)
      : 0;

    var risk = riskLevel_({
      leadScore: leadScore,
      equityPercent: equityPercent,
      repairs: repairs,
      value: value,
      projectedProfit: projectedProfit,
      projectedRoi: projectedRoi
    });

    var confidence = confidence_({
      value: value,
      arv: arv,
      repairs: repairs,
      asking: asking,
      leadScore: leadScore
    });

    var decision = decision_({
      leadScore: leadScore,
      projectedProfit: projectedProfit,
      projectedRoi: projectedRoi,
      risk: risk,
      minimumProfit: options.minimumProfit,
      minimumROI: options.minimumROI,
      minimumLeadScore: options.minimumLeadScore
    });

    var explanation = explanation_({
      strategy: strategy,
      leadScore: leadScore,
      equityPercent: equityPercent,
      projectedProfit: projectedProfit,
      projectedRoi: projectedRoi,
      risk: risk,
      confidence: confidence,
      decision: decision,
      recommendedOffer: recommendedOffer
    });

    var components = {
      value: roundCurrency_(value),
      arv: roundCurrency_(arv),
      repairs: roundCurrency_(repairs),
      debt: roundCurrency_(debt),
      askingPrice: roundCurrency_(asking),
      equity: roundCurrency_(equity),
      equityPercent: equityPercent,
      closingCosts: roundCurrency_(closingCosts),
      holdingCosts: roundCurrency_(holdingCosts),
      flipMao: roundCurrency_(flipMao),
      wholesaleMao: roundCurrency_(wholesaleMao),
      rentalMao: roundCurrency_(rentalMao),
      recommendedOffer: recommendedOffer,
      projectedProfit: roundCurrency_(projectedProfit),
      projectedRoi: projectedRoi
    };

    return {
      ok: true,
      leadId: leadId,
      leadScore: leadScore,
      grade: grade,
      strategy: strategy,
      recommendedOffer: recommendedOffer,
      projectedProfit: roundCurrency_(projectedProfit),
      projectedRoi: projectedRoi,
      risk: risk,
      confidence: confidence,
      decision: decision,
      explanation: explanation,
      components: components
    };
  }

  function analyzeAll(options) {
    ensureSheets();

    options = Object.assign({}, DEFAULTS, options || {});

    var started = new Date();
    var leads = safeAll_(LEADS);
    var analyzed = 0;
    var recommendations = 0;
    var rejected = 0;
    var errors = [];
    var scores = [];
    var offers = [];

    leads.forEach(function (lead) {
      try {
        if (text_(lead.Status) === 'Archived') return;

        var result = analyzeLead(lead, options);

        saveDecision_(lead, result);

        analyzed++;
        scores.push(number_(result.leadScore));
        offers.push(number_(result.recommendedOffer));

        if (
          result.decision === 'Acquire' ||
          result.decision === 'Review'
        ) {
          recommendations++;
        } else {
          rejected++;
        }
      } catch (error) {
        errors.push({
          leadId: lead['Lead ID'] || '',
          message: error.message || String(error)
        });
      }
    });

    var completed = new Date();

    var summary = {
      leadsFound: leads.length,
      analyzed: analyzed,
      recommendations: recommendations,
      rejected: rejected,
      topScore: scores.length
        ? Math.max.apply(null, scores)
        : 0,
      averageRecommendedOffer: offers.length
        ? roundCurrency_(
            offers.reduce(function (sum, value) {
              return sum + value;
            }, 0) / offers.length
          )
        : 0
    };

    var run = REOS.Database.insert(RUNS, {
      Status: errors.length
        ? 'Completed With Errors'
        : 'Complete',
      'Leads Found': leads.length,
      'Leads Analyzed': analyzed,
      Recommendations: recommendations,
      Rejected: rejected,
      Errors: errors.length,
      'Top Score': summary.topScore,
      'Average Recommended Offer':
        summary.averageRecommendedOffer,
      'Started At': started,
      'Completed At': completed,
      'Duration Ms':
        completed.getTime() - started.getTime(),
      'Summary JSON': JSON.stringify(summary),
      'Errors JSON': JSON.stringify(errors)
    }, {
      idField: 'Intelligence Run ID',
      idPrefix: 'AIRUN'
    });

    return {
      ok: errors.length === 0,
      runId: run['Intelligence Run ID'],
      summary: summary,
      errors: errors
    };
  }

  function saveDecision_(lead, result) {
    var existing = safeAll_(DECISIONS).filter(function (row) {
      return text_(row['Lead ID']) === text_(result.leadId);
    });

    var values = {
      'Lead ID': result.leadId,
      'Deal ID': lead['Promoted Deal ID'] || '',
      Address: lead.Address || '',
      City: lead.City || '',
      State: lead.State || '',
      'Lead Score': result.leadScore,
      Grade: result.grade,
      'Estimated Value': result.components.value,
      ARV: result.components.arv,
      'Estimated Repairs': result.components.repairs,
      'Estimated Debt': result.components.debt,
      'Asking Price': result.components.askingPrice,
      'Estimated Equity': result.components.equity,
      'Equity %': result.components.equityPercent,
      'Flip MAO': result.components.flipMao,
      'Wholesale MAO': result.components.wholesaleMao,
      'Rental MAO': result.components.rentalMao,
      'Recommended Offer': result.recommendedOffer,
      'Recommended Strategy': result.strategy,
      'Projected Profit': result.projectedProfit,
      'Projected ROI %': result.projectedRoi,
      'Risk Level': result.risk,
      Confidence: result.confidence,
      Decision: result.decision,
      Explanation: result.explanation,
      'Components JSON': JSON.stringify(result.components),
      Status: result.decision === 'Reject'
        ? 'Rejected'
        : 'Open',
      'Updated At': new Date()
    };

    if (existing.length) {
      return REOS.Database.update(
        DECISIONS,
        'Decision ID',
        existing[existing.length - 1]['Decision ID'],
        values
      );
    }

    values['Generated At'] = new Date();

    return REOS.Database.insert(DECISIONS, values, {
      idField: 'Decision ID',
      idPrefix: 'AIDEC'
    });
  }

  function getDecision(leadId) {
    ensureSheets();

    var matches = safeAll_(DECISIONS).filter(function (row) {
      return text_(row['Lead ID']) === text_(leadId);
    });

    return matches.length
      ? matches[matches.length - 1]
      : null;
  }

  function summary(limit) {
    ensureSheets();

    var decisions = safeAll_(DECISIONS);
    var runs = safeAll_(RUNS);

    var open = decisions.filter(function (row) {
      return text_(row.Status) === 'Open';
    });

    var top = open
      .slice()
      .sort(function (a, b) {
        return number_(b['Lead Score']) -
          number_(a['Lead Score']);
      })
      .slice(0, Number(limit || 10));

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      decisions: decisions.length,
      acquire: count_(decisions, 'Decision', 'Acquire'),
      review: count_(decisions, 'Decision', 'Review'),
      monitor: count_(decisions, 'Decision', 'Monitor'),
      rejected: count_(decisions, 'Decision', 'Reject'),
      open: open.length,
      runs: runs.length,
      latestRun: runs.length
        ? runs[runs.length - 1]
        : null,
      topOpportunities: top
    };
  }

  function chooseStrategy_(input) {
    var distressType = text_(
      input.lead['Distress Type']
    ).toLowerCase();

    if (
      input.equityPercent >= 35 &&
      input.repairs <= input.value * 0.20
    ) {
      return 'Flip';
    }

    if (
      input.equityPercent >= 20 &&
      (
        distressType.indexOf('absentee') !== -1 ||
        distressType.indexOf('vacant') !== -1
      )
    ) {
      return 'Wholesale';
    }

    if (
      input.repairs <= input.value * 0.15 &&
      input.value > 0
    ) {
      return 'Rental / BRRRR';
    }

    return 'Wholesale';
  }

  function riskLevel_(input) {
    var points = 0;

    if (input.leadScore < 60) points += 2;
    if (input.equityPercent < 20) points += 2;
    if (
      input.value > 0 &&
      input.repairs > input.value * 0.30
    ) {
      points += 2;
    }
    if (input.projectedProfit < 15000) points += 2;
    if (input.projectedRoi < 10) points += 2;

    if (points >= 7) return 'Critical';
    if (points >= 5) return 'High';
    if (points >= 3) return 'Medium';
    return 'Low';
  }

  function confidence_(input) {
    var fields = [
      input.value,
      input.arv,
      input.repairs,
      input.asking,
      input.leadScore
    ];

    var present = fields.filter(function (value) {
      return number_(value) > 0;
    }).length;

    if (present >= 5) return 'High';
    if (present >= 3) return 'Medium';
    return 'Low';
  }

  function decision_(input) {
    if (
      input.leadScore >= 75 &&
      input.projectedProfit >= input.minimumProfit &&
      input.projectedRoi >= input.minimumROI &&
      input.risk !== 'Critical'
    ) {
      return 'Acquire';
    }

    if (
      input.leadScore >= input.minimumLeadScore &&
      input.risk !== 'Critical'
    ) {
      return 'Review';
    }

    if (input.leadScore >= 40) {
      return 'Monitor';
    }

    return 'Reject';
  }

  function explanation_(input) {
    return [
      'Recommendation: ' + input.decision + '.',
      'Strategy: ' + input.strategy + '.',
      'Lead score: ' + input.leadScore + '.',
      'Equity: ' + input.equityPercent + '%.',
      'Recommended offer: $' +
        formatNumber_(input.recommendedOffer) + '.',
      'Projected profit: $' +
        formatNumber_(input.projectedProfit) + '.',
      'Projected ROI: ' + input.projectedRoi + '%.',
      'Risk: ' + input.risk + '.',
      'Confidence: ' + input.confidence + '.'
    ].join(' ');
  }

  function safeAll_(sheet) {
    try {
      return REOS.Database.getAll(sheet);
    } catch (error) {
      return [];
    }
  }

  function count_(rows, field, value) {
    return rows.filter(function (row) {
      return text_(row[field]) === value;
    }).length;
  }

  function text_(value) {
    return String(
      value === null || value === undefined
        ? ''
        : value
    ).trim();
  }

  function number_(value) {
    var number = Number(value || 0);
    return isNaN(number) ? 0 : number;
  }

  function round_(value) {
    return Math.round(number_(value) * 100) / 100;
  }

  function roundCurrency_(value) {
    return Math.round(number_(value));
  }

  function formatNumber_(value) {
    return roundCurrency_(value).toLocaleString();
  }

  return {
    ensureSheets: ensureSheets,
    analyzeLead: analyzeLead,
    analyzeAll: analyzeAll,
    getDecision: getDecision,
    summary: summary
  };
})();

function reosAcquisitionIntelligenceEnsureSheets() {
  return REOS.AcquisitionIntelligence.ensureSheets();
}

function reosAcquisitionIntelligenceAnalyzeLead(lead, options) {
  return REOS.AcquisitionIntelligence.analyzeLead(
    lead,
    options
  );
}

function reosAcquisitionIntelligenceAnalyzeAll(options) {
  return REOS.AcquisitionIntelligence.analyzeAll(options);
}

function reosAcquisitionIntelligenceSummary(limit) {
  return REOS.AcquisitionIntelligence.summary(limit);
}

function reosAcquisitionIntelligenceGetDecision(leadId) {
  return REOS.AcquisitionIntelligence.getDecision(leadId);
}
