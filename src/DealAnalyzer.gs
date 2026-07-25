/**
 * REOS Enterprise v3.4.1
 * Sprint 5.1 — Acquisition & Deal Analyzer Foundation
 */

var REOS = REOS || {};

REOS.DealAnalyzer = (function () {
  var DEALS = 'DEALS';
  var ANALYSIS = 'DEAL_ANALYSIS';
  var OFFERS = 'OFFERS';
  var COMPS = 'DEAL_COMPARABLES';
  var EXITS = 'EXIT_STRATEGIES';
  var FINANCIALS = 'PROPERTY_FINANCIALS';

  function ensureSheets() {
    REOS.Database.ensureTable(DEALS, ['Deal ID','Address','City','State','Zip','Source','Seller Name','Deal Status','Assigned To','Created At','Updated At']);
    REOS.Database.ensureTable(ANALYSIS, ['Analysis ID','Deal ID','Purchase Price','ARV','Repair Cost','Holding Cost','Closing Cost','Financing Cost','Selling Cost','Assignment Fee','Rent Monthly','Taxes Annual','Insurance Annual','HOA Monthly','MAO','Flip Profit','ROI %','Cash Required','NOI','Cap Rate %','DSCR','Recommendation','Risk Level','Summary JSON','Created At']);
    REOS.Database.ensureTable(OFFERS, ['Offer ID','Deal ID','Offer Type','Offer Amount','Status','Terms','Notes','Created At','Updated At']);
    REOS.Database.ensureTable(COMPS, ['Comp ID','Deal ID','Address','Sold Price','Sold Date','Beds','Baths','Sq Ft','Distance Miles','Source','Notes','Created At']);
    REOS.Database.ensureTable(EXITS, ['Exit Strategy ID','Deal ID','Strategy','Projected Revenue','Projected Cost','Projected Profit','Risk Level','Notes','Created At']);
    REOS.Database.ensureTable(FINANCIALS, ['Financial ID','Deal ID','Category','Amount','Frequency','Notes','Created At']);
  }

  function createDeal(input) {
    ensureSheets();
    input = input || {};
    var deal = REOS.Database.insert(DEALS, {
      Address: input.address || '',
      City: input.city || '',
      State: input.state || '',
      Zip: input.zip || '',
      Source: input.source || 'Manual',
      'Seller Name': input.sellerName || '',
      'Deal Status': input.status || 'New',
      'Assigned To': getUser_(),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'Deal ID', idPrefix: 'DEAL' });
    publish_('deal.created', deal);
    return deal;
  }

  function calculate(input) {
    input = input || {};

    var purchase = money_(input.purchasePrice);
    var arv = money_(input.arv);
    var repairs = money_(input.repairCost);
    var holding = money_(input.holdingCost);
    var closing = money_(input.closingCost);
    var financing = money_(input.financingCost);
    var selling = money_(input.sellingCost);
    var assignment = money_(input.assignmentFee);
    var rent = money_(input.rentMonthly);
    var taxes = money_(input.taxesAnnual);
    var insurance = money_(input.insuranceAnnual);
    var hoa = money_(input.hoaMonthly);
    var debt = money_(input.loanPaymentMonthly);
    var maoPct = percent_(input.maoPercent, 0.70);
    var operatingExpensePct = percent_(input.operatingExpensePercent, 0.16);

    validateNonNegative_({
      purchasePrice: purchase,
      arv: arv,
      repairCost: repairs,
      holdingCost: holding,
      closingCost: closing,
      financingCost: financing,
      sellingCost: selling,
      assignmentFee: assignment,
      rentMonthly: rent,
      taxesAnnual: taxes,
      insuranceAnnual: insurance,
      hoaMonthly: hoa,
      loanPaymentMonthly: debt
    });

    var mao = Math.max(0, (arv * maoPct) - repairs - assignment);
    var acquisitionCost = purchase + assignment;
    var totalCost = acquisitionCost + repairs + holding + closing + financing + selling;
    var flipProfit = arv - totalCost;
    var cashRequired = acquisitionCost + repairs + closing + holding + financing;
    var roi = cashRequired > 0 ? (flipProfit / cashRequired) * 100 : 0;

    var grossRent = rent * 12;
    var variableOperatingExpenses = grossRent * operatingExpensePct;
    var expenses = taxes + insurance + (hoa * 12) + variableOperatingExpenses;
    var noi = grossRent - expenses;
    var capRateBasis = acquisitionCost + repairs;
    var capRate = capRateBasis > 0 ? (noi / capRateBasis) * 100 : 0;
    var annualDebtService = debt * 12;
    var dscr = annualDebtService > 0 ? noi / annualDebtService : 0;

    var risk = determineRisk_(flipProfit, roi, purchase, mao, dscr, rent);
    var recommendation = determineRecommendation_(flipProfit, roi, purchase, mao);

    return {
      maoPercent: round_(maoPct * 100),
      operatingExpensePercent: round_(operatingExpensePct * 100),
      mao: round_(mao),
      acquisitionCost: round_(acquisitionCost),
      totalCost: round_(totalCost),
      flipProfit: round_(flipProfit),
      roi: round_(roi),
      cashRequired: round_(cashRequired),
      grossRentAnnual: round_(grossRent),
      operatingExpensesAnnual: round_(expenses),
      noi: round_(noi),
      capRate: round_(capRate),
      dscr: round_(dscr),
      recommendation: recommendation,
      riskLevel: risk
    };
  }

  function analyzeDeal(dealId, input) {
    ensureSheets();
    input = input || {};
    if (!dealId) throw new Error('Deal ID is required.');

    var m = calculate(input);
    var row = REOS.Database.insert(ANALYSIS, {
      'Deal ID': dealId,
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
      MAO: m.mao,
      'Flip Profit': m.flipProfit,
      'ROI %': m.roi,
      'Cash Required': m.cashRequired,
      NOI: m.noi,
      'Cap Rate %': m.capRate,
      DSCR: m.dscr,
      Recommendation: m.recommendation,
      'Risk Level': m.riskLevel,
      'Summary JSON': REOS.toJson_(m),
      'Created At': new Date()
    }, { idField: 'Analysis ID', idPrefix: 'ANL' });
    publish_('deal.analyzed', { dealId: dealId, metrics: m });
    return row;
  }

  function createOffer(dealId, input) {
    ensureSheets();
    input = input || {};
    if (!dealId) throw new Error('Deal ID is required.');

    var row = REOS.Database.insert(OFFERS, {
      'Deal ID': dealId,
      'Offer Type': input.offerType || 'Cash',
      'Offer Amount': money_(input.offerAmount),
      Status: input.status || 'Draft',
      Terms: input.terms || '',
      Notes: input.notes || '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'Offer ID', idPrefix: 'OFF' });
    publish_('offer.generated', row);
    return row;
  }

  function seedDemoDeal() {
    var deal = createDeal({
      address: '123 Main St',
      city: 'Jacksonville',
      state: 'FL',
      zip: '32202',
      source: 'Demo',
      sellerName: 'Demo Seller'
    });

    var analysis = analyzeDeal(deal['Deal ID'], {
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
    });

    var offer = createOffer(deal['Deal ID'], {
      offerType: 'Cash',
      offerAmount: analysis.MAO,
      status: 'Draft',
      terms: 'Cash close with inspection contingency.'
    });

    return { deal: deal, analysis: analysis, offer: offer };
  }

  function summary() {
    ensureSheets();
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      deals: REOS.Database.getAll(DEALS).length,
      analyses: REOS.Database.getAll(ANALYSIS).length,
      offers: REOS.Database.getAll(OFFERS).length
    };
  }

  function determineRecommendation_(flipProfit, roi, purchase, mao) {
    if (flipProfit <= 0) return 'Pass';
    if (purchase <= mao && roi >= 15) return 'Strong Review';
    return 'Review';
  }

  function determineRisk_(flipProfit, roi, purchase, mao, dscr, monthlyRent) {
    if (flipProfit < 0 || roi < 10 || purchase > mao) return 'High';
    if (monthlyRent > 0 && dscr > 0 && dscr < 1.20) return 'High';
    if (roi < 20) return 'Medium';
    return 'Low';
  }

  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) {
      REOS.PluginEventBus.publish(topic, payload, 'acquisitions');
    }
  }

  function getUser_() {
    try { return Session.getActiveUser().getEmail(); } catch (e) { return ''; }
  }

  function money_(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return isFinite(value) ? value : 0;

    var normalized = String(value)
      .trim()
      .replace(/\((.*)\)/, '-$1')
      .replace(/[^0-9.\-]/g, '');

    if (!normalized || normalized === '-' || normalized === '.') return 0;
    var number = Number(normalized);
    return isFinite(number) ? number : 0;
  }

  function percent_(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    var parsed = money_(value);
    if (parsed <= 0) return fallback;
    if (parsed > 1) parsed = parsed / 100;
    return Math.min(parsed, 1);
  }

  function validateNonNegative_(values) {
    Object.keys(values).forEach(function (key) {
      if (values[key] < 0) throw new Error(key + ' cannot be negative.');
    });
  }

  function round_(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  return {
    ensureSheets: ensureSheets,
    createDeal: createDeal,
    calculate: calculate,
    analyzeDeal: analyzeDeal,
    createOffer: createOffer,
    seedDemoDeal: seedDemoDeal,
    summary: summary
  };
})();

function reosDealAnalyzerEnsureSheets() {
  REOS.DealAnalyzer.ensureSheets();

  var result = {
    ok: true,
    message: 'Deal Analyzer sheets ready.'
  };

  notifyDealAnalyzer_(result.message, result);
  return result;
}

function reosDealAnalyzerSeedDemo() {
  var result = REOS.DealAnalyzer.seedDemoDeal();

  notifyDealAnalyzer_(
    'REOS Deal Analyzer demo completed.',
    result
  );

  return result;
}

function reosDealAnalyzerSummary() {
  var result = REOS.DealAnalyzer.summary();

  notifyDealAnalyzer_(
    'REOS Deal Analyzer summary generated.',
    result
  );

  return result;
}

/**
 * Displays a spreadsheet alert when UI access is available.
 * Falls back to the execution log in standalone, trigger,
 * API, web-app, and headless contexts.
 */
function notifyDealAnalyzer_(message, payload) {
  var output = message;

  if (payload !== undefined) {
    try {
      output += '\n\n' + JSON.stringify(payload, null, 2).slice(0, 1800);
    } catch (jsonError) {
      output += '\n\n[Unable to serialize response]';
    }
  }

  console.log(output);

  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    if (spreadsheet) {
      SpreadsheetApp.getUi().alert(
        'REOS Deal Analyzer',
        output,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    }
  } catch (uiError) {
    console.log(
      'Spreadsheet UI unavailable; result written to execution log. ' +
      uiError.message
    );
  }
}
