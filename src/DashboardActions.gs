/**
 * REOS Enterprise v4.1.0 - Dashboard Actions
 * Phase 1.2: interactive deal, task, pipeline, and offer operations.
 */
var REOS = REOS || {};

REOS.DashboardActions = (function () {
  var STAGES = [
    'Lead','Property Review','Initial Analysis','Comparable Analysis',
    'Offer Generation','Offer Submitted','Negotiation','Under Contract',
    'Due Diligence','Closing','Disposition','Closed'
  ];

  var OFFER_STATUSES = ['Draft','Submitted','Countered','Accepted','Rejected','Expired','Withdrawn'];

  function getDealWorkspace(dealId) {
    requireText_(dealId, 'Deal ID');

    var deal = findOne_('DEALS', 'Deal ID', dealId);
    if (!deal) throw new Error('Deal not found: ' + dealId);

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      deal: clean_(deal),
      pipeline: clean_(findLatest_('ACQUISITION_PIPELINE', 'Deal ID', dealId)),
      analyses: clean_(findAll_('DEAL_ANALYSIS', 'Deal ID', dealId)),
      comps: clean_(findAll_('DEAL_COMPARABLES', 'Deal ID', dealId)),
      offers: clean_(findAll_('OFFERS', 'Deal ID', dealId)),
      tasks: clean_(findAll_('ACQUISITION_TASK_QUEUE', 'Deal ID', dealId)),
      notes: clean_(findAll_('ACQUISITION_NOTES', 'Deal ID', dealId)),
      history: clean_(findAll_('ACQUISITION_STAGE_HISTORY', 'Deal ID', dealId)),
      allowedStages: STAGES.slice(),
      allowedOfferStatuses: OFFER_STATUSES.slice()
    };
  }

  function completeTask(taskId, notes) {
    requireText_(taskId, 'Task ID');
    if (!REOS.AcquisitionTaskEngine || typeof REOS.AcquisitionTaskEngine.completeTask !== 'function') {
      throw new Error('Acquisition Task Engine is unavailable.');
    }

    var result = REOS.AcquisitionTaskEngine.completeTask(taskId, notes || 'Completed from Operational Dashboard.');
    publish_('dashboard.task.completed', { taskId: taskId });
    return { ok: true, action: 'task.completed', result: clean_(result) };
  }

  function advancePipeline(dealId, nextStage, notes) {
    requireText_(dealId, 'Deal ID');
    requireText_(nextStage, 'Next stage');
    if (STAGES.indexOf(nextStage) === -1) throw new Error('Invalid pipeline stage: ' + nextStage);
    if (!REOS.AcquisitionPipeline || typeof REOS.AcquisitionPipeline.advanceStage !== 'function') {
      throw new Error('Acquisition Pipeline is unavailable.');
    }

    var result = REOS.AcquisitionPipeline.advanceStage(
      dealId,
      nextStage,
      notes || 'Advanced from Operational Dashboard.'
    );

    if (REOS.AcquisitionTaskEngine && typeof REOS.AcquisitionTaskEngine.generateForDealStage === 'function') {
      try { REOS.AcquisitionTaskEngine.generateForDealStage(dealId, nextStage); } catch (ignored) {}
    }

    publish_('dashboard.pipeline.advanced', { dealId: dealId, stage: nextStage });
    return { ok: true, action: 'pipeline.advanced', result: clean_(result) };
  }

  function updateOfferStatus(offerId, status, notes) {
    requireText_(offerId, 'Offer ID');
    requireText_(status, 'Offer status');
    if (OFFER_STATUSES.indexOf(status) === -1) throw new Error('Invalid offer status: ' + status);

    var offer = findOne_('OFFERS', 'Offer ID', offerId);
    if (!offer) throw new Error('Offer not found: ' + offerId);

    var updates = {
      Status: status,
      'Updated At': new Date()
    };
    if (notes !== undefined && notes !== null && String(notes).trim()) updates.Notes = String(notes).trim();

    var result = REOS.Database.update('OFFERS', 'Offer ID', offerId, updates);
    publish_('dashboard.offer.status.changed', {
      offerId: offerId,
      dealId: offer['Deal ID'] || '',
      previousStatus: offer.Status || '',
      newStatus: status
    });

    return { ok: true, action: 'offer.status.changed', result: clean_(result) };
  }

  function addDealNote(dealId, note) {
    requireText_(dealId, 'Deal ID');
    requireText_(note, 'Note');

    try {
      REOS.Database.ensureTable('ACQUISITION_NOTES', [
        'Note ID','Deal ID','Stage','Note','Created By','Created At'
      ]);
    } catch (ignored) {}

    var pipeline = findLatest_('ACQUISITION_PIPELINE', 'Deal ID', dealId) || {};
    var row = REOS.Database.insert('ACQUISITION_NOTES', {
      'Deal ID': dealId,
      Stage: pipeline['Current Stage'] || '',
      Note: String(note).trim(),
      'Created By': currentUser_(),
      'Created At': new Date()
    }, { idField: 'Note ID', idPrefix: 'ANOTE' });

    publish_('dashboard.deal.note.added', { dealId: dealId, noteId: row['Note ID'] || '' });
    return { ok: true, action: 'deal.note.added', result: clean_(row) };
  }

  function getPermissions() {
    var user = currentUser_();
    return {
      ok: true,
      user: user,
      canView: can_('dashboard:view'),
      canManageDeals: can_('leads:write'),
      canManageTasks: can_('tasks:write') || can_('leads:write'),
      canManageOffers: can_('leads:write'),
      canAdmin: isAdmin_()
    };
  }

  function findOne_(sheet, field, value) {
    var rows = safeAll_(sheet);
    for (var i = 0; i < rows.length; i++) if (rows[i][field] === value) return rows[i];
    return null;
  }

  function findAll_(sheet, field, value) {
    return safeAll_(sheet).filter(function (row) { return row[field] === value; });
  }

  function findLatest_(sheet, field, value) {
    var rows = findAll_(sheet, field, value);
    return rows.length ? rows[rows.length - 1] : null;
  }

  function safeAll_(sheet) {
    try { return REOS.Database.getAll(sheet); } catch (error) { return []; }
  }

  function requireText_(value, label) {
    if (value === null || value === undefined || String(value).trim() === '') {
      throw new Error(label + ' is required.');
    }
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail() || ''; } catch (error) { return ''; }
  }

  function can_(permission) {
    try {
      if (!REOS.Security || typeof REOS.Security.requirePermission !== 'function') return true;
      REOS.Security.requirePermission(permission);
      return true;
    } catch (error) { return false; }
  }

  function isAdmin_() {
    try {
      if (!REOS.Security || typeof REOS.Security.requireAdmin !== 'function') return false;
      REOS.Security.requireAdmin();
      return true;
    } catch (error) { return false; }
  }

  function publish_(topic, payload) {
    try {
      if (REOS.PluginEventBus && typeof REOS.PluginEventBus.publish === 'function') {
        REOS.PluginEventBus.publish(topic, payload, 'dashboard');
      }
    } catch (ignored) {}
  }

  function clean_(value) {
    return JSON.parse(JSON.stringify(value || null, function (key, item) {
      if (item instanceof Date) return item.toISOString();
      if (typeof item === 'number' && !isFinite(item)) return 0;
      return item;
    }));
  }

  return {
    getDealWorkspace: getDealWorkspace,
    completeTask: completeTask,
    advancePipeline: advancePipeline,
    updateOfferStatus: updateOfferStatus,
    addDealNote: addDealNote,
    getPermissions: getPermissions
  };
})();

function reosDashboardActionTransport_(value) {
  return JSON.stringify(value, function (key, item) {
    if (item instanceof Date) return item.toISOString();
    if (typeof item === 'number' && !isFinite(item)) return 0;
    return item;
  });
}

function reosDashboardGetDeal(dealId) {
  return reosDashboardActionTransport_(REOS.DashboardActions.getDealWorkspace(dealId));
}

function reosDashboardCompleteTask(taskId, notes) {
  return reosDashboardActionTransport_(REOS.DashboardActions.completeTask(taskId, notes));
}

function reosDashboardAdvancePipeline(dealId, nextStage, notes) {
  return reosDashboardActionTransport_(REOS.DashboardActions.advancePipeline(dealId, nextStage, notes));
}

function reosDashboardUpdateOfferStatus(offerId, status, notes) {
  return reosDashboardActionTransport_(REOS.DashboardActions.updateOfferStatus(offerId, status, notes));
}

function reosDashboardAddDealNote(dealId, note) {
  return reosDashboardActionTransport_(REOS.DashboardActions.addDealNote(dealId, note));
}

function reosDashboardPermissions() {
  return reosDashboardActionTransport_(REOS.DashboardActions.getPermissions());
}
