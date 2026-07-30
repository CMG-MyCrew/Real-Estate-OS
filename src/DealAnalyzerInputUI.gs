/**
 * REOS Enterprise v3.4.6
 * Deal Analyzer Input Interface — server-side controller.
 */

var REOS = REOS || {};

REOS.DealAnalyzerInputUI = (function () {
  var DEALS = 'DEALS';
  var ANALYSIS = 'DEAL_ANALYSIS';
  var OFFERS = 'OFFERS';

  function showSidebar() {
    assertDependencies_();
    var html = HtmlService.createHtmlOutputFromFile('DealAnalyzerSidebar')
      .setTitle('REOS Deal Analyzer')
      .setWidth(430);
    SpreadsheetApp.getUi().showSidebar(html);
  }

  function getInitialData() {
    assertDependencies_();
    REOS.DealAnalyzer.ensureSheets();

    var deals = REOS.Database.getAll(DEALS).map(function (deal) {
      var dealId = String(deal['Deal ID'] || '');
      return {
        dealId: dealId,
        address: deal.Address || '',
        city: deal.City || '',
        state: deal.State || '',
        zip: deal.Zip || '',
        source: deal.Source || '',
        status: deal['Deal Status'] || '',
        label: buildDealLabel_(deal)
      };
    }).filter(function (deal) {
      return Boolean(deal.dealId);
    });

    deals.sort(function (a, b) {
      return a.label.localeCompare(b.label);
    });

    return {
      ok: true,
      deals: deals,
      defaults: {
        maoPercent: 70,
        operatingExpensePercent: 16,
        offerType: 'Cash',
        createDraftOffer: true,
        advancePipeline: true
      }
    };
  }

  function getDealContext(dealId) {
    assertDependencies_();
    if (!dealId) throw new Error('Deal ID is required.');

    var deal = REOS.Database.findById(DEALS, 'Deal ID', dealId);
    if (!deal) throw new Error('Deal not found: ' + dealId);

    var latestAnalysis = latestForDeal_(ANALYSIS, dealId, 'Created At');
    var latestOffer = latestForDeal_(OFFERS, dealId, 'Updated At');

    return {
      ok: true,
      deal: deal,
      latestAnalysis: latestAnalysis || null,
      latestOffer: latestOffer || null,
      form: latestAnalysis ? analysisToForm_(latestAnalysis) : {}
    };
  }

  function preview(input) {
    assertDependencies_();
    input = normalizeRequest_(input);
    validateRequest_(input, false);

    return {
      ok: true,
      metrics: REOS.DealAnalyzer.calculate(input.analysis)
    };
  }

  function submit(input) {
    assertDependencies_();
    input = normalizeRequest_(input);
    validateRequest_(input, true);

    var result;
    if (REOS.AcquisitionDealIntegration && REOS.AcquisitionDealIntegration.processDeal) {
      result = REOS.AcquisitionDealIntegration.processDeal(
        input.dealId,
        input.analysis,
        {
          createDraftOffer: input.options.createDraftOffer,
          advancePipeline: input.options.advancePipeline,
          offerType: input.options.offerType,
          offerTerms: input.options.offerTerms,
          forceReprocess: true,
          reuseLatestAnalysis: false
        }
      );
    } else {
      var analysis = REOS.DealAnalyzer.analyzeDeal(input.dealId, input.analysis);
      var offer = null;
      if (input.options.createDraftOffer && number_(analysis.MAO) > 0) {
        offer = REOS.DealAnalyzer.createOffer(input.dealId, {
          offerType: input.options.offerType,
          offerAmount: analysis.MAO,
          status: 'Draft',
          terms: input.options.offerTerms || 'Offer based on REOS calculated MAO.',
          notes: 'Created through Deal Analyzer input interface.'
        });
      }
      result = { ok: true, analysis: analysis, offer: offer };
    }

    if (REOS.AcquisitionOpportunityView && REOS.AcquisitionOpportunityView.build) {
      try { REOS.AcquisitionOpportunityView.build(); } catch (ignored) {}
    }

    return {
      ok: true,
      message: 'Deal analysis saved successfully.',
      result: result
    };
  }

  function normalizeRequest_(input) {
    input = input || {};
    var analysis = input.analysis || {};
    var options = input.options || {};

    return {
      dealId: String(input.dealId || '').trim(),
      analysis: {
        purchasePrice: analysis.purchasePrice,
        arv: analysis.arv,
        repairCost: analysis.repairCost,
        holdingCost: analysis.holdingCost,
        closingCost: analysis.closingCost,
        financingCost: analysis.financingCost,
        sellingCost: analysis.sellingCost,
        assignmentFee: analysis.assignmentFee,
        rentMonthly: analysis.rentMonthly,
        taxesAnnual: analysis.taxesAnnual,
        insuranceAnnual: analysis.insuranceAnnual,
        hoaMonthly: analysis.hoaMonthly,
        loanPaymentMonthly: analysis.loanPaymentMonthly,
        maoPercent: analysis.maoPercent,
        operatingExpensePercent: analysis.operatingExpensePercent
      },
      options: {
        createDraftOffer: options.createDraftOffer !== false,
        advancePipeline: options.advancePipeline !== false,
        offerType: String(options.offerType || 'Cash'),
        offerTerms: String(options.offerTerms || '')
      }
    };
  }

  function validateRequest_(input, requireDeal) {
    if (requireDeal && !input.dealId) throw new Error('Select a deal before saving.');
    if (number_(input.analysis.purchasePrice) <= 0) throw new Error('Purchase Price must be greater than zero.');
    if (number_(input.analysis.arv) <= 0) throw new Error('ARV must be greater than zero.');
    if (number_(input.analysis.repairCost) < 0) throw new Error('Repair Cost cannot be negative.');
  }

  function analysisToForm_(row) {
    return {
      purchasePrice: row['Purchase Price'] || '',
      arv: row.ARV || '',
      repairCost: row['Repair Cost'] || '',
      holdingCost: row['Holding Cost'] || '',
      closingCost: row['Closing Cost'] || '',
      financingCost: row['Financing Cost'] || '',
      sellingCost: row['Selling Cost'] || '',
      assignmentFee: row['Assignment Fee'] || '',
      rentMonthly: row['Rent Monthly'] || '',
      taxesAnnual: row['Taxes Annual'] || '',
      insuranceAnnual: row['Insurance Annual'] || '',
      hoaMonthly: row['HOA Monthly'] || '',
      loanPaymentMonthly: '',
      maoPercent: 70,
      operatingExpensePercent: 16
    };
  }

  function latestForDeal_(sheetName, dealId, dateField) {
    var rows = [];
    try { rows = REOS.Database.getAll(sheetName); } catch (ignored) { return null; }
    rows = rows.filter(function (row) {
      return String(row['Deal ID'] || '') === String(dealId || '');
    });
    rows.sort(function (a, b) {
      return timestamp_(a[dateField]) - timestamp_(b[dateField]);
    });
    return rows.length ? rows[rows.length - 1] : null;
  }

  function buildDealLabel_(deal) {
    var location = [deal.Address, deal.City, deal.State].filter(Boolean).join(', ');
    return (location || 'Unnamed property') + ' — ' + String(deal['Deal ID'] || '');
  }

  function timestamp_(value) {
    if (!value) return 0;
    var date = value instanceof Date ? value : new Date(value);
    var time = date.getTime();
    return isFinite(time) ? time : 0;
  }

  function number_(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    var parsed = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
    return isFinite(parsed) ? parsed : 0;
  }

  function assertDependencies_() {
    if (!REOS.Database) throw new Error('REOS.Database is required.');
    if (!REOS.DealAnalyzer) throw new Error('REOS.DealAnalyzer is required.');
  }

  return {
    showSidebar: showSidebar,
    getInitialData: getInitialData,
    getDealContext: getDealContext,
    preview: preview,
    submit: submit
  };
})();

function reosOpenDealAnalyzer() {
  return REOS.DealAnalyzerInputUI.showSidebar();
}

function reosDealAnalyzerGetInitialData() {
  return REOS.DealAnalyzerInputUI.getInitialData();
}

function reosDealAnalyzerGetDealContext(dealId) {
  return REOS.DealAnalyzerInputUI.getDealContext(dealId);
}

function reosDealAnalyzerPreview(input) {
  return REOS.DealAnalyzerInputUI.preview(input);
}

function reosDealAnalyzerSubmit(input) {
  return REOS.DealAnalyzerInputUI.submit(input);
}
