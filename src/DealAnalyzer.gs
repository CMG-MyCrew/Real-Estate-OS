/**
 * REOS Enterprise v3.4.0
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
    var purchase = num_(input.purchasePrice);
    var arv = num_(input.arv);
    var repairs = num_(input.repairCost);
    var holding = num_(input.holdingCost);
    var closing = num_(input.closingCost);
    var financing = num_(input.financingCost);
    var selling = num_(input.sellingCost);
    var assignment = num_(input.assignmentFee);
    var rent = num_(input.rentMonthly);
    var taxes = num_(input.taxesAnnual);
    var insurance = num_(input.insuranceAnnual);
    var hoa = num_(input.hoaMonthly);
    var debt = num_(input.loanPaymentMonthly);
    var maoPct = num_(input.maoPercent) || 0.70;

    var mao = (arv * maoPct) - repairs - assignment;
    var totalCost = purchase + repairs + holding + closing + financing + selling;
    var flipProfit = arv - totalCost;
    var cashRequired = purchase + repairs + closing + holding + financing;
    var roi = cashRequired ? (flipProfit / cashRequired) * 100 : 0;

    var grossRent = rent * 12;
    var expenses = taxes + insurance + (hoa * 12) + (grossRent * 0.16);
    var noi = grossRent - expenses;
    var capRate = purchase ? (noi / purchase) * 100 : 0;
    var dscr = debt ? noi / (debt * 12) : 0;

    var risk = flipProfit < 0 || roi < 10 ? 'High' : roi < 20 ? 'Medium' : 'Low';
    var recommendation = flipProfit > 0 && roi >= 15 && purchase <= mao ? 'Strong Review' : flipProfit > 0 ? 'Review' : 'Pass';

    return {
      mao: round_(mao),
      totalCost: round_(totalCost),
      flipProfit: round_(flipProfit),
      roi: round_(roi),
      cashRequired: round_(cashRequired),
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
    var m = calculate(input);
    var row = REOS.Database.insert(ANALYSIS, {
      'Deal ID': dealId,
      'Purchase Price': num_(input.purchasePrice),
      ARV: num_(input.arv),
      'Repair Cost': num_(input.repairCost),
      'Holding Cost': num_(input.holdingCost),
      'Closing Cost': num_(input.closingCost),
      'Financing Cost': num_(input.financingCost),
      'Selling Cost': num_(input.sellingCost),
      'Assignment Fee': num_(input.assignmentFee),
      'Rent Monthly': num_(input.rentMonthly),
      'Taxes Annual': num_(input.taxesAnnual),
      'Insurance Annual': num_(input.insuranceAnnual),
      'HOA Monthly': num_(input.hoaMonthly),
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
    var row = REOS.Database.insert(OFFERS, {
      'Deal ID': dealId,
      'Offer Type': input.offerType || 'Cash',
      'Offer Amount': num_(input.offerAmount),
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

  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) {
      REOS.PluginEventBus.publish(topic, payload, 'acquisitions');
    }
  }

  function getUser_() {
    try { return Session.getActiveUser().getEmail(); } catch (e) { return ''; }
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
  SpreadsheetApp.getUi().alert('Deal Analyzer sheets ready.');
}

function reosDealAnalyzerSeedDemo() {
  var result = REOS.DealAnalyzer.seedDemoDeal();
  SpreadsheetApp.getUi().alert('REOS Deal Analyzer Demo', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosDealAnalyzerSummary() {
  var result = REOS.DealAnalyzer.summary();
  SpreadsheetApp.getUi().alert('REOS Deal Analyzer Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}
