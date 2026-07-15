/**
 * REOS Enterprise v4.3.2
 * Sprint 7.2 Increment 4 — Offer Review Dashboard Service
 */
var REOS = REOS || {};

REOS.OfferReviewDashboard = (function () {
  function show() {
    var html = HtmlService
      .createHtmlOutputFromFile('OfferReviewDashboardUI')
      .setWidth(1380)
      .setHeight(860);

    SpreadsheetApp.getUi().showModelessDialog(
      html,
      'REOS AI Offer Review'
    );

    return { ok: true };
  }

  function bootstrap() {
    requireWorkflow_();
    REOS.OfferReviewWorkflow.ensureSheets();
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      filters: {
        statuses: ['Pending Review','Approved','Rejected'],
        risks: ['Low','Moderate','Medium','High','Critical'],
        strategies: ['Wholesale','Fix & Flip','Flip','Rental / BRRRR','BRRRR','Buy & Hold','Novation','Creative Finance']
      },
      summary: REOS.OfferReviewWorkflow.summary()
    };
  }

  function refresh(filters) {
    requireWorkflow_();
    return clean_({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: REOS.OfferReviewWorkflow.summary(),
      records: REOS.OfferReviewWorkflow.list(filters || {})
    });
  }

  function generate(options) {
    requireWorkflow_();
    return clean_(REOS.OfferReviewWorkflow.generateQueue(options || {}));
  }

  function approve(reviewId, notes) {
    requireWorkflow_();
    return clean_(REOS.OfferReviewWorkflow.approve(reviewId, notes || 'Approved from Offer Review Dashboard.'));
  }

  function reject(reviewId, notes) {
    requireWorkflow_();
    return clean_(REOS.OfferReviewWorkflow.reject(reviewId, notes || 'Rejected from Offer Review Dashboard.'));
  }

  function publishApproved() {
    requireWorkflow_();
    return clean_(REOS.OfferReviewWorkflow.publishApproved());
  }

  function requireWorkflow_() {
    if (!REOS.OfferReviewWorkflow) {
      throw new Error('OfferReviewWorkflow.gs is required.');
    }
  }

  function clean_(value) {
    return JSON.parse(JSON.stringify(value || null, function (key, item) {
      if (item instanceof Date) return item.toISOString();
      if (typeof item === 'number' && !isFinite(item)) return 0;
      return item;
    }));
  }

  return {
    show: show,
    bootstrap: bootstrap,
    refresh: refresh,
    generate: generate,
    approve: approve,
    reject: reject,
    publishApproved: publishApproved
  };
})();

function showOfferReviewDashboard() {
  return REOS.OfferReviewDashboard.show();
}

function reosOfferReviewDashboardBootstrap() {
  return REOS.OfferReviewDashboard.bootstrap();
}

function reosOfferReviewDashboardRefresh(filters) {
  return REOS.OfferReviewDashboard.refresh(filters);
}

function reosOfferReviewDashboardGenerate(options) {
  return REOS.OfferReviewDashboard.generate(options);
}

function reosOfferReviewDashboardApprove(reviewId, notes) {
  return REOS.OfferReviewDashboard.approve(reviewId, notes);
}

function reosOfferReviewDashboardReject(reviewId, notes) {
  return REOS.OfferReviewDashboard.reject(reviewId, notes);
}

function reosOfferReviewDashboardPublishApproved() {
  return REOS.OfferReviewDashboard.publishApproved();
}
