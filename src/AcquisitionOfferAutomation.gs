/**
 * REOS Enterprise v4.3.0
 * Sprint 7.2 — Acquisition Offer Automation
 *
 * Generates reviewable offer drafts from acquisition intelligence decisions.
 */
var REOS = REOS || {};

REOS.AcquisitionOfferAutomation = (function () {
  var DECISIONS = 'AI_ACQUISITION_DECISIONS';
  var QUEUE = 'AI_OFFER_QUEUE';

  var HEADERS = [
    'Offer Queue ID','Decision ID','Lead ID','Deal ID','Address',
    'Strategy','Recommended Offer','Projected Profit','Projected ROI %',
    'Risk Level','Confidence','Offer Status','Approval Status',
    'Offer Terms','Explanation','Created At','Updated At','Published Offer ID'
  ];

  function ensureSheets() {
    REOS.Database.ensureTable(QUEUE, HEADERS);

    return {
      ok: true,
      queue: QUEUE
    };
  }

  function generateDrafts(options) {
    ensureSheets();

    options = Object.assign({
      minimumScore: 70,
      allowedDecisions: ['Acquire', 'Review'],
      maxDrafts: 25
    }, options || {});

    var decisions = safeAll_(DECISIONS)
      .filter(function (row) {
        return (
          options.allowedDecisions.indexOf(
            String(row.Decision || '')
          ) !== -1 &&
          Number(row['Lead Score'] || 0) >=
            Number(options.minimumScore || 70)
        );
      })
      .sort(function (a, b) {
        return Number(b['Lead Score'] || 0) -
          Number(a['Lead Score'] || 0);
      })
      .slice(0, Number(options.maxDrafts || 25));

    var existing = safeAll_(QUEUE);
    var created = [];
    var skipped = [];

    decisions.forEach(function (decision) {
      var duplicate = existing.some(function (row) {
        return (
          String(row['Decision ID'] || '') ===
          String(decision['Decision ID'] || '')
        );
      });

      if (duplicate) {
        skipped.push({
          decisionId: decision['Decision ID'],
          reason: 'Draft already exists.'
        });
        return;
      }

      var terms = buildTerms_(decision);

      created.push(
        REOS.Database.insert(QUEUE, {
          'Decision ID': decision['Decision ID'],
          'Lead ID': decision['Lead ID'],
          'Deal ID': decision['Deal ID'] || '',
          Address: decision.Address || '',
          Strategy: decision['Recommended Strategy'] || '',
          'Recommended Offer':
            Number(decision['Recommended Offer'] || 0),
          'Projected Profit':
            Number(decision['Projected Profit'] || 0),
          'Projected ROI %':
            Number(decision['Projected ROI %'] || 0),
          'Risk Level': decision['Risk Level'] || '',
          Confidence: decision.Confidence || '',
          'Offer Status': 'Draft',
          'Approval Status': 'Pending Review',
          'Offer Terms': terms,
          Explanation: decision.Explanation || '',
          'Created At': new Date(),
          'Updated At': new Date(),
          'Published Offer ID': ''
        }, {
          idField: 'Offer Queue ID',
          idPrefix: 'AIOFFER'
        })
      );
    });

    return {
      ok: true,
      candidates: decisions.length,
      created: created.length,
      skipped: skipped.length,
      drafts: created,
      skippedDetails: skipped
    };
  }

  function approve(queueId) {
    ensureSheets();

    return REOS.Database.update(
      QUEUE,
      'Offer Queue ID',
      queueId,
      {
        'Approval Status': 'Approved',
        'Offer Status': 'Ready',
        'Updated At': new Date()
      }
    );
  }

  function reject(queueId, reason) {
    ensureSheets();

    return REOS.Database.update(
      QUEUE,
      'Offer Queue ID',
      queueId,
      {
        'Approval Status': 'Rejected',
        'Offer Status': 'Rejected',
        Explanation: reason || 'Rejected during review.',
        'Updated At': new Date()
      }
    );
  }

  function publishApproved() {
    ensureSheets();

    var approved = safeAll_(QUEUE).filter(function (row) {
      return (
        String(row['Approval Status'] || '') ===
          'Approved' &&
        !row['Published Offer ID']
      );
    });

    var published = [];
    var errors = [];

    approved.forEach(function (draft) {
      try {
        var offer = REOS.Database.insert('OFFERS', {
          'Deal ID': draft['Deal ID'] || '',
          'Lead ID': draft['Lead ID'] || '',
          'Offer Type':
            draft.Strategy || 'Acquisition',
          'Offer Amount':
            Number(draft['Recommended Offer'] || 0),
          Status: 'Draft',
          Terms: draft['Offer Terms'] || '',
          Notes: draft.Explanation || '',
          'Created At': new Date(),
          'Updated At': new Date()
        }, {
          idField: 'Offer ID',
          idPrefix: 'OFFER'
        });

        REOS.Database.update(
          QUEUE,
          'Offer Queue ID',
          draft['Offer Queue ID'],
          {
            'Offer Status': 'Published',
            'Published Offer ID': offer['Offer ID'],
            'Updated At': new Date()
          }
        );

        published.push(offer);
      } catch (error) {
        errors.push({
          queueId: draft['Offer Queue ID'],
          message: error.message || String(error)
        });
      }
    });

    return {
      ok: errors.length === 0,
      approved: approved.length,
      published: published.length,
      errors: errors
    };
  }

  function summary() {
    ensureSheets();

    var rows = safeAll_(QUEUE);

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      total: rows.length,
      draft: count_(rows, 'Offer Status', 'Draft'),
      ready: count_(rows, 'Offer Status', 'Ready'),
      published: count_(rows, 'Offer Status', 'Published'),
      approved: count_(
        rows,
        'Approval Status',
        'Approved'
      ),
      pendingReview: count_(
        rows,
        'Approval Status',
        'Pending Review'
      ),
      rejected: count_(
        rows,
        'Approval Status',
        'Rejected'
      )
    };
  }

  function buildTerms_(decision) {
    var strategy =
      decision['Recommended Strategy'] || 'Acquisition';

    var terms = [
      'Strategy: ' + strategy,
      'Offer amount: $' +
        Number(
          decision['Recommended Offer'] || 0
        ).toLocaleString(),
      'Property sold as-is',
      'Subject to satisfactory due diligence',
      'Clear and marketable title required',
      'Closing date subject to seller agreement'
    ];

    if (strategy === 'Wholesale') {
      terms.push('Contract must be assignable');
    }

    return terms.join('; ');
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
      return String(row[field] || '') === value;
    }).length;
  }

  return {
    ensureSheets: ensureSheets,
    generateDrafts: generateDrafts,
    approve: approve,
    reject: reject,
    publishApproved: publishApproved,
    summary: summary
  };
})();

function reosAcquisitionOffersEnsureSheets() {
  return REOS.AcquisitionOfferAutomation.ensureSheets();
}

function reosAcquisitionOffersGenerateDrafts(options) {
  return REOS.AcquisitionOfferAutomation.generateDrafts(
    options
  );
}

function reosAcquisitionOffersApprove(queueId) {
  return REOS.AcquisitionOfferAutomation.approve(queueId);
}

function reosAcquisitionOffersReject(queueId, reason) {
  return REOS.AcquisitionOfferAutomation.reject(
    queueId,
    reason
  );
}

function reosAcquisitionOffersPublishApproved() {
  return REOS.AcquisitionOfferAutomation.publishApproved();
}

function reosAcquisitionOffersSummary() {
  return REOS.AcquisitionOfferAutomation.summary();
}
