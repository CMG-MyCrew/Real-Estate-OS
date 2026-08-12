/**
 * REOS Enterprise v3.7.0
 * Deal Logic Increment 2 — Lifecycle Synchronization
 *
 * Coordinates DEALS, DEAL_ANALYSIS, DEAL_COMPARABLES, OFFERS and
 * ACQUISITION_PIPELINE using evidence-based forward-only stage rules.
 */

var REOS = REOS || {};

REOS.DealLifecycleWorkflow = (function () {
  var DEALS = 'DEALS';
  var ANALYSIS = 'DEAL_ANALYSIS';
  var COMPS = 'DEAL_COMPARABLES';
  var OFFERS = 'OFFERS';
  var LOG = 'DEAL_LIFECYCLE_LOG';

  var STAGES = [
    'Lead',
    'Property Review',
    'Initial Analysis',
    'Comparable Analysis',
    'Offer Generation',
    'Offer Submitted',
    'Negotiation',
    'Under Contract',
    'Due Diligence',
    'Closing',
    'Disposition',
    'Closed'
  ];

  var LOG_HEADERS = [
    'Lifecycle Log ID','Deal ID','Previous Stage','Target Stage','Final Stage',
    'Reason','Evidence JSON','Source','Changed By','Created At'
  ];

  var DEFAULTS = {
    minimumComps: 3,
    requirePositiveMaoForOfferGeneration: true,
    allowBackward: false,
    createPipelineIfMissing: true,
    logNoop: false
  };

  function ensureSheets() {
    assertDependencies_();
    REOS.AcquisitionPipeline.ensureSheets();
    ensureColumns_(LOG, LOG_HEADERS);

    if (REOS.PluginEventBus && REOS.PluginEventBus.subscribe) {
      try {
        REOS.PluginEventBus.subscribe(
          'deal.logic.saved',
          'acquisitions',
          'reosDealLifecycleHandleDealLogicEvent'
        );
      } catch (ignored) {}
    }

    return {
      ok: true,
      stages: STAGES.slice(),
      logSheet: LOG
    };
  }

  function syncDeal(dealId, options) {
    ensureSheets();
    options = mergeOptions_(options);
    dealId = String(dealId || '').trim();
    if (!dealId) throw new Error('Deal ID is required.');

    var deal = REOS.Database.findById(DEALS, 'Deal ID', dealId);
    if (!deal) throw new Error('Deal not found: ' + dealId);

    var pipeline = REOS.AcquisitionPipeline.getPipeline(dealId);
    if (!pipeline && options.createPipelineIfMissing) {
      pipeline = REOS.AcquisitionPipeline.createPipeline(dealId);
    }
    if (!pipeline) throw new Error('Acquisition pipeline not found for ' + dealId);

    var currentStage = normalizeStage_(pipeline['Current Stage']) || 'Lead';
    var evidence = collectEvidence_(dealId, deal, options);
    var target = deriveTargetStage_(deal, evidence, options);
    var targetStage = target.stage;

    if (!options.allowBackward && indexOfStage_(targetStage) < indexOfStage_(currentStage)) {
      targetStage = currentStage;
      target.reason = 'Forward-only guard retained current stage.';
    }

    var finalStage = currentStage;
    var transitions = [];
    if (indexOfStage_(targetStage) > indexOfStage_(currentStage)) {
      transitions = advanceSequentially_(dealId, currentStage, targetStage, target.reason);
      finalStage = transitions.length ? transitions[transitions.length - 1].newStage : currentStage;
    }

    synchronizeDealRow_(dealId, finalStage, target.reason);

    var changed = finalStage !== currentStage;
    var log = null;
    if (changed || options.logNoop) {
      log = writeLog_(dealId, {
        previousStage: currentStage,
        targetStage: targetStage,
        finalStage: finalStage,
        reason: target.reason,
        evidence: evidence,
        source: options.source || 'deal-lifecycle-sync'
      });
    }

    if (changed) {
      publish_('deal.lifecycle.synchronized', {
        dealId: dealId,
        previousStage: currentStage,
        targetStage: targetStage,
        finalStage: finalStage,
        transitions: transitions.length,
        reason: target.reason
      });
    }

    return {
      ok: true,
      dealId: dealId,
      previousStage: currentStage,
      targetStage: targetStage,
      finalStage: finalStage,
      changed: changed,
      transitions: transitions,
      evidence: evidence,
      reason: target.reason,
      logId: log ? log['Lifecycle Log ID'] : ''
    };
  }

  function syncAll(options) {
    ensureSheets();
    options = mergeOptions_(options);
    var deals = REOS.Database.getAll(DEALS);
    var results = [];
    var errors = [];

    deals.forEach(function (deal) {
      var dealId = String(deal['Deal ID'] || '').trim();
      if (!dealId) return;
      try {
        results.push(syncDeal(dealId, options));
      } catch (error) {
        errors.push({ dealId: dealId, error: error.message });
      }
    });

    return {
      ok: errors.length === 0,
      scanned: deals.length,
      synchronized: results.length,
      changed: results.filter(function (r) { return r.changed; }).length,
      errors: errors,
      results: results
    };
  }

  function collectEvidence_(dealId, deal, options) {
    var analyses = rowsForDeal_(ANALYSIS, dealId);
    var comps = rowsForDeal_(COMPS, dealId);
    var offers = rowsForDeal_(OFFERS, dealId);

    var latestAnalysis = latest_(analyses, ['Updated At','Created At']);
    var latestOffer = latest_(offers, ['Updated At','Created At']);
    var offerStatuses = offers.map(function (row) {
      return normalizeToken_(row.Status || row['Offer Status']);
    }).filter(Boolean);

    var validAnalysis = Boolean(
      latestAnalysis &&
      number_(latestAnalysis['Purchase Price']) > 0 &&
      number_(latestAnalysis.ARV) > 0 &&
      number_(latestAnalysis['Repair Cost']) >= 0
    );

    var positiveMao = Boolean(latestAnalysis && number_(latestAnalysis.MAO) > 0);
    var submittedOffer = hasAny_(offerStatuses, ['submitted','sent','delivered']);
    var negotiationOffer = hasAny_(offerStatuses, ['countered','counter','negotiation','negotiating']);
    var acceptedOffer = hasAny_(offerStatuses, ['accepted','executed','under contract','under_contract']);
    var draftOffer = offers.some(function (row) {
      var status = normalizeToken_(row.Status || row['Offer Status']);
      return status === 'draft' && number_(row['Offer Amount']) > 0;
    });

    return {
      dealStatus: String(deal['Deal Status'] || ''),
      analysisCount: analyses.length,
      latestAnalysisId: latestAnalysis ? latestAnalysis['Analysis ID'] || '' : '',
      validAnalysis: validAnalysis,
      mao: latestAnalysis ? number_(latestAnalysis.MAO) : 0,
      positiveMao: positiveMao,
      compCount: comps.length,
      minimumComps: options.minimumComps,
      offerCount: offers.length,
      latestOfferId: latestOffer ? latestOffer['Offer ID'] || '' : '',
      latestOfferStatus: latestOffer ? String(latestOffer.Status || latestOffer['Offer Status'] || '') : '',
      draftOffer: draftOffer,
      submittedOffer: submittedOffer,
      negotiationOffer: negotiationOffer,
      acceptedOffer: acceptedOffer,
      offerStatuses: offerStatuses
    };
  }

  function deriveTargetStage_(deal, evidence, options) {
    var dealStatus = normalizeToken_(deal['Deal Status']);

    if (hasAny_([dealStatus], ['closed','sold','completed'])) {
      return decision_('Closed', 'Deal status indicates the transaction is closed.');
    }
    if (hasAny_([dealStatus], ['disposition','disposition ready','disposition_ready'])) {
      return decision_('Disposition', 'Deal status indicates disposition.');
    }
    if (hasAny_([dealStatus], ['closing','scheduled to close','scheduled_to_close'])) {
      return decision_('Closing', 'Deal status indicates closing.');
    }
    if (hasAny_([dealStatus], ['due diligence','due_diligence','inspection','inspections'])) {
      return decision_('Due Diligence', 'Deal status indicates due diligence.');
    }
    if (evidence.acceptedOffer || hasAny_([dealStatus], ['under contract','under_contract','contract'])) {
      return decision_('Under Contract', 'Accepted offer or deal status indicates under contract.');
    }
    if (evidence.negotiationOffer || hasAny_([dealStatus], ['negotiation','negotiating','counter'])) {
      return decision_('Negotiation', 'Offer or deal status indicates active negotiation.');
    }
    if (evidence.submittedOffer) {
      return decision_('Offer Submitted', 'At least one offer has been submitted, sent, or delivered.');
    }
    if (
      evidence.validAnalysis &&
      evidence.compCount >= options.minimumComps &&
      evidence.draftOffer &&
      (!options.requirePositiveMaoForOfferGeneration || evidence.positiveMao)
    ) {
      return decision_('Offer Generation', 'Valid analysis, minimum comps, and a positive draft offer are present.');
    }
    if (evidence.validAnalysis && evidence.compCount >= options.minimumComps) {
      return decision_('Comparable Analysis', 'Valid analysis exists and minimum comparable count has been met.');
    }
    if (evidence.validAnalysis) {
      return decision_('Initial Analysis', 'A valid deal analysis has been saved.');
    }
    if (hasAny_([dealStatus], ['property review','property_review','review'])) {
      return decision_('Property Review', 'Deal status indicates property review.');
    }
    return decision_('Lead', 'No later-stage evidence is present.');
  }

  function advanceSequentially_(dealId, currentStage, targetStage, reason) {
    var fromIndex = indexOfStage_(currentStage);
    var toIndex = indexOfStage_(targetStage);
    var transitions = [];

    for (var i = fromIndex + 1; i <= toIndex; i++) {
      var next = STAGES[i];
      var before = STAGES[i - 1];
      REOS.AcquisitionPipeline.advanceStage(
        dealId,
        next,
        'Lifecycle sync: ' + reason
      );
      transitions.push({ previousStage: before, newStage: next });
    }
    return transitions;
  }

  function synchronizeDealRow_(dealId, stage, reason) {
    var mappedStatus = stageToDealStatus_(stage);
    var updates = {
      'Deal Status': mappedStatus,
      'Updated At': new Date()
    };

    var headers = [];
    try { headers = REOS.Database.getHeaders(DEALS); } catch (ignored) {}
    if (headers.indexOf('Lifecycle Stage') !== -1) updates['Lifecycle Stage'] = stage;
    if (headers.indexOf('Lifecycle Reason') !== -1) updates['Lifecycle Reason'] = reason || '';
    if (headers.indexOf('Lifecycle Updated At') !== -1) updates['Lifecycle Updated At'] = new Date();

    REOS.Database.update(DEALS, 'Deal ID', dealId, updates);
  }

  function stageToDealStatus_(stage) {
    var map = {
      'Lead': 'New',
      'Property Review': 'Property Review',
      'Initial Analysis': 'Initial Analysis',
      'Comparable Analysis': 'Comparable Analysis',
      'Offer Generation': 'Offer Ready',
      'Offer Submitted': 'Offer Submitted',
      'Negotiation': 'Negotiation',
      'Under Contract': 'Under Contract',
      'Due Diligence': 'Due Diligence',
      'Closing': 'Closing',
      'Disposition': 'Disposition',
      'Closed': 'Closed'
    };
    return map[stage] || stage;
  }

  function writeLog_(dealId, data) {
    return REOS.Database.insert(LOG, {
      'Deal ID': dealId,
      'Previous Stage': data.previousStage,
      'Target Stage': data.targetStage,
      'Final Stage': data.finalStage,
      Reason: data.reason || '',
      'Evidence JSON': json_(data.evidence || {}),
      Source: data.source || 'deal-lifecycle-sync',
      'Changed By': currentUser_(),
      'Created At': new Date()
    }, { idField: 'Lifecycle Log ID', idPrefix: 'DLIFE' });
  }

  function rowsForDeal_(sheetName, dealId) {
    try {
      return REOS.Database.getAll(sheetName).filter(function (row) {
        return String(row['Deal ID'] || '') === String(dealId || '');
      });
    } catch (ignored) {
      return [];
    }
  }

  function latest_(rows, dateFields) {
    if (!rows.length) return null;
    rows = rows.slice().sort(function (a, b) {
      return timestampFromFields_(a, dateFields) - timestampFromFields_(b, dateFields);
    });
    return rows[rows.length - 1];
  }

  function timestampFromFields_(row, fields) {
    for (var i = 0; i < fields.length; i++) {
      var t = timestamp_(row[fields[i]]);
      if (t) return t;
    }
    return 0;
  }

  function ensureColumns_(sheetName, requiredHeaders) {
    var sheet = REOS.Database.ensureTable(sheetName, requiredHeaders);
    var existing = REOS.Database.getHeaders(sheetName);
    var missing = requiredHeaders.filter(function (header) {
      return existing.indexOf(header) === -1;
    });
    if (!missing.length) return sheet;

    var startColumn = Math.max(sheet.getLastColumn(), existing.length, 0) + 1;
    sheet.getRange(1, startColumn, 1, missing.length)
      .setValues([missing])
      .setFontWeight('bold')
      .setWrap(true);
    return sheet;
  }

  function mergeOptions_(options) {
    options = options || {};
    return {
      minimumComps: positiveInt_(options.minimumComps, DEFAULTS.minimumComps),
      requirePositiveMaoForOfferGeneration: options.requirePositiveMaoForOfferGeneration !== false,
      allowBackward: options.allowBackward === true,
      createPipelineIfMissing: options.createPipelineIfMissing !== false,
      logNoop: options.logNoop === true,
      source: String(options.source || 'deal-lifecycle-sync')
    };
  }

  function decision_(stage, reason) {
    return { stage: stage, reason: reason };
  }

  function normalizeStage_(stage) {
    var token = normalizeToken_(stage);
    for (var i = 0; i < STAGES.length; i++) {
      if (normalizeToken_(STAGES[i]) === token) return STAGES[i];
    }
    return '';
  }

  function indexOfStage_(stage) {
    var normalized = normalizeStage_(stage);
    return normalized ? STAGES.indexOf(normalized) : 0;
  }

  function normalizeToken_(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  }

  function hasAny_(values, candidates) {
    var normalizedCandidates = candidates.map(normalizeToken_);
    return values.some(function (value) {
      return normalizedCandidates.indexOf(normalizeToken_(value)) !== -1;
    });
  }

  function number_(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    var parsed = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
    return isFinite(parsed) ? parsed : 0;
  }

  function positiveInt_(value, fallback) {
    var parsed = Math.floor(number_(value));
    return parsed > 0 ? parsed : fallback;
  }

  function timestamp_(value) {
    if (!value) return 0;
    var date = value instanceof Date ? value : new Date(value);
    var time = date.getTime();
    return isFinite(time) ? time : 0;
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail() || ''; } catch (ignored) { return ''; }
  }

  function json_(value) {
    try { return JSON.stringify(value); } catch (ignored) { return '{}'; }
  }

  function publish_(topic, payload) {
    if (REOS.PluginEventBus && REOS.PluginEventBus.publish) {
      try { REOS.PluginEventBus.publish(topic, payload, 'acquisitions'); } catch (ignored) {}
    }
  }

  function assertDependencies_() {
    if (!REOS.Database) throw new Error('REOS.Database is required.');
    if (!REOS.AcquisitionPipeline) throw new Error('REOS.AcquisitionPipeline is required.');
  }

  return {
    STAGES: STAGES,
    ensureSheets: ensureSheets,
    syncDeal: syncDeal,
    syncAll: syncAll,
    collectEvidence: collectEvidence_
  };
})();

function reosDealLifecycleEnsureSheets() {
  return REOS.DealLifecycleWorkflow.ensureSheets();
}

function reosDealLifecycleSyncDeal(dealId, options) {
  return REOS.DealLifecycleWorkflow.syncDeal(dealId, options || {});
}

function reosDealLifecycleSyncAll() {
  return REOS.DealLifecycleWorkflow.syncAll({ source: 'manual-sync-all' });
}

function reosDealLifecycleHandleDealLogicEvent(eventRow, subscription) {
  var payload = {};
  try { payload = JSON.parse(eventRow['Payload JSON'] || '{}'); } catch (ignored) {}
  if (!payload.dealId) return { ok: false, skipped: true, reason: 'Event payload has no Deal ID.' };
  return REOS.DealLifecycleWorkflow.syncDeal(payload.dealId, {
    source: 'plugin-event:deal.logic.saved'
  });
}

function reosDealLifecycleScheduledSync() {
  return REOS.DealLifecycleWorkflow.syncAll({ source: 'scheduled-sync' });
}

function reosDealLifecycleInstallTrigger() {
  reosDealLifecycleRemoveTrigger();
  var trigger = ScriptApp.newTrigger('reosDealLifecycleScheduledSync')
    .timeBased()
    .everyHours(1)
    .create();
  return {
    ok: true,
    handler: 'reosDealLifecycleScheduledSync',
    triggerId: trigger.getUniqueId(),
    cadence: 'HOURLY'
  };
}

function reosDealLifecycleRemoveTrigger() {
  var handler = 'reosDealLifecycleScheduledSync';
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return { ok: true, handler: handler, removed: removed };
}
