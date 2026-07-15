/**
 * REOS Enterprise v4.3.1
 * Sprint 7.2 Increment 2 — AI Deal Intelligence
 *
 * Property-level investment analysis, MAO, ROI, risk, grading,
 * strategy recommendation, and ranked opportunity output.
 */
var REOS = REOS || {};

REOS.AcquisitionDealIntelligence = (function () {
  var SOURCE = 'IA_LEADS';
  var TABLE = 'AI_DEAL_INTELLIGENCE';

  var HEADERS = [
    'AI Deal ID','Distress Lead ID','Address','City','State',
    'Lead Score','ARV','Repair Estimate','MAO','Estimated Equity',
    'Estimated Profit','ROI %','Risk Score','Risk Level',
    'Investment Grade','Strategy','Confidence','Recommended Offer',
    'Status','Components JSON','Created At','Updated At'
  ];

  var DEFAULTS = {
    maoPercent: 0.70,
    closingCostPercent: 0.03,
    holdingCostPercent: 0.06,
    wholesaleFee: 10000,
    minimumProfit: 20000,
    minimumROI: 15
  };

  function ensureSheets() {
    REOS.Database.ensureTable(TABLE, HEADERS);

    return {
      ok: true,
      table: TABLE
    };
  }

  function analyzeLead(lead, options) {
    ensureSheets();

    options = Object.assign({}, DEFAULTS, options || {});
    lead = lead || {};

    var leadId = text_(
      lead['Lead ID'] ||
      lead['Distress Lead ID']
    );

    var leadScore = number_(lead['Total Score']);
    var arv = number_(
      lead.ARV ||
      lead['After Repair Value'] ||
      lead['Estimated Value']
    );
    var repairs = number_(
      lead['Estimated Repairs'] ||
      lead['Repair Estimate']
    );
    var debt = number_(lead['Estimated Debt']);
    var asking = number_(lead['Asking Price']);

    var closingCosts = arv * options.closingCostPercent;
    var holdingCosts = arv * options.holdingCostPercent;

    var mao = calculateMAO({
      arv: arv,
      repairs: repairs,
      closingCosts: closingCosts,
      holdingCosts: holdingCosts,
      maoPercent: options.maoPercent
    });

    var recommendedOffer = asking > 0
      ? Math.min(mao, asking)
      : mao;

    recommendedOffer = roundCurrency_(recommendedOffer);

    var estimatedEquity = Math.max(0, arv - debt);
    var estimatedProfit = Math.max(
      0,
      arv -
      recommendedOffer -
      repairs -
      closingCosts -
      holdingCosts
    );

    var roi = calculateROI(
      estimatedProfit,
      recommendedOffer +
      repairs +
      closingCosts +
      holdingCosts
    );

    var risk = calculateRisk({
      leadScore: leadScore,
      arv: arv,
      repairs: repairs,
      asking: asking,
      equity: estimatedEquity,
      profit: estimatedProfit,
      roi: roi,
      ownerName: lead['Owner Name']
    });

    var strategy = recommendStrategy({
      lead: lead,
      arv: arv,
      repairs: repairs,
      asking: asking,
      equity: estimatedEquity,
      profit: estimatedProfit,
      roi: roi,
      risk: risk
    });

    var grade = grade_({
      leadScore: leadScore,
      roi: roi,
      profit: estimatedProfit,
      riskScore: risk.score
    });

    var confidence = confidence_({
      arv: arv,
      repairs: repairs,
      asking: asking,
      leadScore: leadScore,
      ownerName: lead['Owner Name']
    });

    return {
      ok: true,
      leadId: leadId,
      address: lead.Address || '',
      city: lead.City || '',
      state: lead.State || '',
      leadScore: leadScore,
      arv: roundCurrency_(arv),
      repairs: roundCurrency_(repairs),
      mao: roundCurrency_(mao),
      estimatedEquity: roundCurrency_(estimatedEquity),
      estimatedProfit: roundCurrency_(estimatedProfit),
      roi: roi,
      riskScore: risk.score,
      riskLevel: risk.level,
      grade: grade,
      strategy: strategy,
      confidence: confidence,
      recommendedOffer: recommendedOffer,
      status: strategy === 'Pass' ? 'Rejected' : 'Open',
      components: {
        closingCosts: roundCurrency_(closingCosts),
        holdingCosts: roundCurrency_(holdingCosts),
        debt: roundCurrency_(debt),
        askingPrice: roundCurrency_(asking)
      }
    };
  }

  function analyzeAll(options) {
    ensureSheets();

    var leads = safeAll_(SOURCE);
    var created = 0;
    var updated = 0;
    var errors = [];

    leads.forEach(function (lead) {
      try {
        if (text_(lead.Status) === 'Archived') return;

        var result = analyzeLead(lead, options);
        var existing = safeAll_(TABLE).filter(function (row) {
          return text_(row['Distress Lead ID']) ===
            text_(result.leadId);
        });

        var values = {
          'Distress Lead ID': result.leadId,
          Address: result.address,
          City: result.city,
          State: result.state,
          'Lead Score': result.leadScore,
          ARV: result.arv,
          'Repair Estimate': result.repairs,
          MAO: result.mao,
          'Estimated Equity': result.estimatedEquity,
          'Estimated Profit': result.estimatedProfit,
          'ROI %': result.roi,
          'Risk Score': result.riskScore,
          'Risk Level': result.riskLevel,
          'Investment Grade': result.grade,
          Strategy: result.strategy,
          Confidence: result.confidence,
          'Recommended Offer': result.recommendedOffer,
          Status: result.status,
          'Components JSON': JSON.stringify(result.components),
          'Updated At': new Date()
        };

        if (existing.length) {
          REOS.Database.update(
            TABLE,
            'AI Deal ID',
            existing[existing.length - 1]['AI Deal ID'],
            values
          );
          updated++;
        } else {
          values['Created At'] = new Date();

          REOS.Database.insert(TABLE, values, {
            idField: 'AI Deal ID',
            idPrefix: 'AIDEAL'
          });

          created++;
        }
      } catch (error) {
        errors.push({
          leadId: lead['Lead ID'] || '',
          message: error.message || String(error)
        });
      }
    });

    return {
      ok: errors.length === 0,
      found: leads.length,
      created: created,
      updated: updated,
      errors: errors
    };
  }

  function calculateMAO(input) {
    input = input || {};

    var arv = number_(input.arv);
    var repairs = number_(input.repairs);
    var closingCosts = number_(input.closingCosts);
    var holdingCosts = number_(input.holdingCosts);
    var percent = number_(
      input.maoPercent == null
        ? DEFAULTS.maoPercent
        : input.maoPercent
    );

    return Math.max(
      0,
      (arv * percent) -
      repairs -
      closingCosts -
      holdingCosts
    );
  }

  function calculateROI(profit, investment) {
    profit = number_(profit);
    investment = number_(investment);

    return investment > 0
      ? round_((profit / investment) * 100)
      : 0;
  }

  function calculateRisk(input) {
    input = input || {};

    var score = 0;

    if (number_(input.leadScore) < 60) score += 20;
    if (!number_(input.arv)) score += 20;
    if (!number_(input.repairs)) score += 15;
    if (!number_(input.asking)) score += 10;
    if (!text_(input.ownerName)) score += 10;
    if (number_(input.equity) < 20000) score += 15;
    if (number_(input.profit) < 15000) score += 15;
    if (number_(input.roi) < 10) score += 15;

    score = Math.min(score, 100);

    return {
      score: score,
      level: score >= 70
        ? 'High'
        : score >= 40
          ? 'Moderate'
          : 'Low'
    };
  }

  function recommendStrategy(input) {
    input = input || {};

    var distress = text_(
      input.lead &&
      input.lead['Distress Type']
    ).toLowerCase();

    if (
      input.risk.level === 'High' ||
      number_(input.profit) < 10000
    ) {
      return 'Pass';
    }

    if (
      number_(input.roi) >= 25 &&
      number_(input.repairs) <= number_(input.arv) * 0.25
    ) {
      return 'Fix & Flip';
    }

    if (
      distress.indexOf('vacant') !== -1 ||
      distress.indexOf('absentee') !== -1
    ) {
      return 'Wholesale';
    }

    if (
      number_(input.repairs) <= number_(input.arv) * 0.15 &&
      number_(input.equity) >= 30000
    ) {
      return 'BRRRR';
    }

    if (number_(input.equity) >= 50000) {
      return 'Buy & Hold';
    }

    if (number_(input.asking) > 0) {
      return 'Novation';
    }

    return 'Creative Finance';
  }

  function topDeals(limit) {
    ensureSheets();

    return safeAll_(TABLE)
      .filter(function (row) {
        return text_(row.Status) === 'Open';
      })
      .sort(function (a, b) {
        var gradeDiff =
          gradeRank_(b['Investment Grade']) -
          gradeRank_(a['Investment Grade']);

        if (gradeDiff !== 0) return gradeDiff;

        return number_(b['ROI %']) -
          number_(a['ROI %']);
      })
      .slice(0, Number(limit || 20));
  }

  function summary() {
    ensureSheets();

    var rows = safeAll_(TABLE);

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      total: rows.length,
      open: rows.filter(function (row) {
        return text_(row.Status) === 'Open';
      }).length,
      rejected: rows.filter(function (row) {
        return text_(row.Status) === 'Rejected';
      }).length,
      lowRisk: rows.filter(function (row) {
        return text_(row['Risk Level']) === 'Low';
      }).length,
      highRisk: rows.filter(function (row) {
        return text_(row['Risk Level']) === 'High';
      }).length,
      topDeals: topDeals(10)
    };
  }

  function grade_(input) {
    var composite =
      number_(input.leadScore) * 0.40 +
      Math.min(number_(input.roi), 100) * 0.30 +
      Math.min(
        number_(input.profit) / 1000,
        100
      ) * 0.20 +
      Math.max(
        0,
        100 - number_(input.riskScore)
      ) * 0.10;

    if (composite >= 90) return 'A+';
    if (composite >= 80) return 'A';
    if (composite >= 70) return 'B';
    if (composite >= 60) return 'C';
    return 'D';
  }

  function gradeRank_(grade) {
    var ranks = {
      'A+': 5,
      'A': 4,
      'B': 3,
      'C': 2,
      'D': 1
    };

    return ranks[text_(grade)] || 0;
  }

  function confidence_(input) {
    var fields = [
      input.arv,
      input.repairs,
      input.asking,
      input.leadScore,
      input.ownerName
    ];

    var present = fields.filter(function (value) {
      return value !== '' &&
        value !== null &&
        value !== undefined &&
        value !== 0;
    }).length;

    if (present >= 5) return 'High';
    if (present >= 3) return 'Medium';
    return 'Low';
  }

  function safeAll_(sheet) {
    try {
      return REOS.Database.getAll(sheet);
    } catch (error) {
      return [];
    }
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

  return {
    ensureSheets: ensureSheets,
    analyzeLead: analyzeLead,
    analyzeAll: analyzeAll,
    calculateMAO: calculateMAO,
    calculateROI: calculateROI,
    calculateRisk: calculateRisk,
    recommendStrategy: recommendStrategy,
    topDeals: topDeals,
    summary: summary
  };
})();

function reosDealIntelligenceEnsureSheets() {
  return REOS.AcquisitionDealIntelligence.ensureSheets();
}

function reosDealIntelligenceAnalyzeLead(lead, options) {
  return REOS.AcquisitionDealIntelligence.analyzeLead(
    lead,
    options
  );
}

function reosDealIntelligenceAnalyzeAll(options) {
  return REOS.AcquisitionDealIntelligence.analyzeAll(
    options
  );
}

function reosDealIntelligenceTopDeals(limit) {
  return REOS.AcquisitionDealIntelligence.topDeals(limit);
}

function reosDealIntelligenceSummary() {
  return REOS.AcquisitionDealIntelligence.summary();
}
