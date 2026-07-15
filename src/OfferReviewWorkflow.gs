/**
 * REOS Enterprise v4.3.2
 * Sprint 7.2 Increment 4 — AI Offer Review Workflow
 */
var REOS = REOS || {};

REOS.OfferReviewWorkflow = (function () {
  var SOURCE = 'AI_OFFER_QUEUE';
  var REVIEW = 'AI_OFFER_REVIEW';
  var OFFERS = 'OFFERS';

  var HEADERS = [
    'Review ID','Offer Queue ID','Decision ID','Lead ID','Deal ID','Address',
    'Strategy','Recommended Offer','Projected Profit','Projected ROI %',
    'Risk Level','Confidence','Review Status','Reviewer','Review Notes',
    'Reviewed At','Published Offer ID','Published At','Created At','Updated At'
  ];

  function ensureSheets() {
    REOS.Database.ensureTable(REVIEW, HEADERS);
    return { ok: true, review: REVIEW };
  }

  function generateQueue(options) {
    ensureSheets();
    options = Object.assign({ includeDrafts: true, maxItems: 100 }, options || {});

    var sourceRows = safeAll_(SOURCE).filter(function (row) {
      var approval = String(row['Approval Status'] || 'Pending Review');
      var status = String(row['Offer Status'] || 'Draft');
      return approval !== 'Rejected' && (options.includeDrafts || status !== 'Draft');
    }).slice(0, Number(options.maxItems || 100));

    var existing = safeAll_(REVIEW);
    var existingKeys = {};
    existing.forEach(function (row) {
      existingKeys[String(row['Offer Queue ID'] || '')] = true;
    });

    var created = [];
    var skipped = 0;

    sourceRows.forEach(function (row) {
      var queueId = String(row['Offer Queue ID'] || '');
      if (!queueId || existingKeys[queueId]) {
        skipped++;
        return;
      }

      var review = REOS.Database.insert(REVIEW, {
        'Offer Queue ID': queueId,
        'Decision ID': row['Decision ID'] || '',
        'Lead ID': row['Lead ID'] || '',
        'Deal ID': row['Deal ID'] || '',
        Address: row.Address || '',
        Strategy: row.Strategy || '',
        'Recommended Offer': Number(row['Recommended Offer'] || 0),
        'Projected Profit': Number(row['Projected Profit'] || 0),
        'Projected ROI %': Number(row['Projected ROI %'] || 0),
        'Risk Level': row['Risk Level'] || '',
        Confidence: row.Confidence || '',
        'Review Status': 'Pending Review',
        Reviewer: '',
        'Review Notes': '',
        'Reviewed At': '',
        'Published Offer ID': '',
        'Published At': '',
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: 'Review ID', idPrefix: 'AIREV' });

      existingKeys[queueId] = true;
      created.push(review);
    });

    return { ok: true, source: sourceRows.length, created: created.length, skipped: skipped, records: created };
  }

  function approve(reviewId, notes) {
    return review_(reviewId, 'Approved', notes);
  }

  function reject(reviewId, notes) {
    return review_(reviewId, 'Rejected', notes || 'Rejected during offer review.');
  }

  function review_(reviewId, status, notes) {
    ensureSheets();
    requireText_(reviewId, 'Review ID');

    var row = findOne_(REVIEW, 'Review ID', reviewId);
    if (!row) throw new Error('Offer review not found: ' + reviewId);
    if (row['Published Offer ID']) throw new Error('Published offers cannot be changed.');

    var updated = REOS.Database.update(REVIEW, 'Review ID', reviewId, {
      'Review Status': status,
      Reviewer: currentUser_(),
      'Review Notes': String(notes || '').trim(),
      'Reviewed At': new Date(),
      'Updated At': new Date()
    });

    try {
      if (row['Offer Queue ID']) {
        REOS.Database.update(SOURCE, 'Offer Queue ID', row['Offer Queue ID'], {
          'Approval Status': status,
          'Offer Status': status === 'Approved' ? 'Ready' : 'Rejected',
          Explanation: notes || row.Explanation || '',
          'Updated At': new Date()
        });
      }
    } catch (ignored) {}

    publish_('offer.review.' + status.toLowerCase(), { reviewId: reviewId, queueId: row['Offer Queue ID'] || '' });
    return { ok: true, status: status, record: updated };
  }

  function publishApproved() {
    ensureSheets();
    var rows = safeAll_(REVIEW).filter(function (row) {
      return row['Review Status'] === 'Approved' && !row['Published Offer ID'];
    });

    var published = [];
    var errors = [];

    rows.forEach(function (row) {
      try {
        var offer = REOS.Database.insert(OFFERS, {
          'Deal ID': row['Deal ID'] || '',
          'Lead ID': row['Lead ID'] || '',
          'Offer Type': row.Strategy || 'Acquisition',
          'Offer Amount': Number(row['Recommended Offer'] || 0),
          Status: 'Draft',
          Terms: buildTerms_(row),
          Notes: row['Review Notes'] || '',
          'Created At': new Date(),
          'Updated At': new Date()
        }, { idField: 'Offer ID', idPrefix: 'OFFER' });

        REOS.Database.update(REVIEW, 'Review ID', row['Review ID'], {
          'Published Offer ID': offer['Offer ID'],
          'Published At': new Date(),
          'Updated At': new Date()
        });

        try {
          if (row['Offer Queue ID']) {
            REOS.Database.update(SOURCE, 'Offer Queue ID', row['Offer Queue ID'], {
              'Offer Status': 'Published',
              'Published Offer ID': offer['Offer ID'],
              'Updated At': new Date()
            });
          }
        } catch (ignored) {}

        try {
          if (row['Deal ID'] && REOS.AcquisitionPipeline && typeof REOS.AcquisitionPipeline.advanceStage === 'function') {
            REOS.AcquisitionPipeline.advanceStage(row['Deal ID'], 'Offer Generation', 'Approved AI offer published.');
          }
        } catch (ignored2) {}

        published.push(offer);
      } catch (error) {
        errors.push({ reviewId: row['Review ID'], message: error.message || String(error) });
      }
    });

    publish_('offer.review.published', { published: published.length, errors: errors.length });
    return { ok: errors.length === 0, approved: rows.length, published: published.length, offers: published, errors: errors };
  }

  function list(filters) {
    ensureSheets();
    filters = filters || {};
    return safeAll_(REVIEW).filter(function (row) {
      if (filters.status && row['Review Status'] !== filters.status) return false;
      if (filters.risk && row['Risk Level'] !== filters.risk) return false;
      if (filters.strategy && row.Strategy !== filters.strategy) return false;
      return true;
    }).slice().reverse();
  }

  function summary() {
    var rows = list();
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      total: rows.length,
      pending: count_(rows, 'Review Status', 'Pending Review'),
      approved: count_(rows, 'Review Status', 'Approved'),
      rejected: count_(rows, 'Review Status', 'Rejected'),
      published: rows.filter(function (r) { return !!r['Published Offer ID']; }).length,
      totalOfferValue: rows.reduce(function (s, r) { return s + Number(r['Recommended Offer'] || 0); }, 0),
      records: clean_(rows)
    };
  }

  function buildTerms_(row) {
    var terms = [
      'Strategy: ' + (row.Strategy || 'Acquisition'),
      'Offer amount: $' + Number(row['Recommended Offer'] || 0).toLocaleString(),
      'Property sold as-is',
      'Subject to satisfactory due diligence',
      'Clear and marketable title required'
    ];
    if (row.Strategy === 'Wholesale') terms.push('Contract must be assignable');
    return terms.join('; ');
  }

  function safeAll_(sheet) { try { return REOS.Database.getAll(sheet) || []; } catch (e) { return []; } }
  function findOne_(sheet, field, value) { return safeAll_(sheet).filter(function (r) { return r[field] === value; })[0] || null; }
  function count_(rows, field, value) { return rows.filter(function (r) { return r[field] === value; }).length; }
  function requireText_(value, label) { if (value === null || value === undefined || String(value).trim() === '') throw new Error(label + ' is required.'); }
  function currentUser_() { try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; } }
  function clean_(value) { return JSON.parse(JSON.stringify(value || null, function (k, v) { return v instanceof Date ? v.toISOString() : v; })); }
  function publish_(topic, payload) { try { if (REOS.PluginEventBus && typeof REOS.PluginEventBus.publish === 'function') REOS.PluginEventBus.publish(topic, payload, 'offer-review'); } catch (e) {} }

  return {
    ensureSheets: ensureSheets,
    generateQueue: generateQueue,
    approve: approve,
    reject: reject,
    publishApproved: publishApproved,
    list: list,
    summary: summary
  };
})();

function reosOfferReviewEnsureSheets() { return REOS.OfferReviewWorkflow.ensureSheets(); }
function reosOfferReviewGenerateQueue(options) { return REOS.OfferReviewWorkflow.generateQueue(options); }
function reosOfferReviewApprove(reviewId, notes) { return REOS.OfferReviewWorkflow.approve(reviewId, notes); }
function reosOfferReviewReject(reviewId, notes) { return REOS.OfferReviewWorkflow.reject(reviewId, notes); }
function reosOfferReviewPublishApproved() { return REOS.OfferReviewWorkflow.publishApproved(); }
function reosOfferReviewList(filters) { return REOS.OfferReviewWorkflow.list(filters); }
function reosOfferReviewSummary() { return REOS.OfferReviewWorkflow.summary(); }
