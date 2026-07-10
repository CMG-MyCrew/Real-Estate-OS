/**
 * REOS Enterprise v3.0 - Acquisitions Module Foundation
 *
 * Handles distressed/off-market property lead intake, scoring, pipeline,
 * follow-ups, and offer tracking using the shared LEADS/TASKS/ACTIVITIES tables.
 */

var REOS = REOS || {};

REOS.Acquisitions = (function () {
  const LEAD_SHEET = (REOS.CONFIG && REOS.CONFIG.SHEETS && REOS.CONFIG.SHEETS.LEADS) || 'LEADS';
  const LEAD_ID = 'Lead ID';

  const PIPELINE = [
    'New',
    'Skip Trace',
    'Contacted',
    'Appointment',
    'Offer Sent',
    'Under Contract',
    'Closed',
    'Lost'
  ];

  const DISTRESS_INDICATORS = [
    'Absentee Owner',
    'Tax Delinquent',
    'Probate',
    'Code Violation',
    'Vacant',
    'Pre-Foreclosure',
    'REO',
    'Eviction',
    'Inherited',
    'Tired Landlord',
    'High Equity',
    'Out of State Owner'
  ];

  function initialize() {
    if (REOS.Setup && REOS.Setup.initializeWorkbook) REOS.Setup.initializeWorkbook();
    registerRoutes_();
    REOS.Logger.info('Acquisitions module initialized', {});
    return { ok: true, module: 'acquisitions' };
  }

  function registerRoutes_() {
    if (!REOS.Router) return;

    REOS.Router.registerRoute({
      key: 'acquisitions.open',
      module: 'leads',
      name: 'Open Acquisitions',
      permission: 'leads:read',
      handler: function () { return dashboard(); }
    });

    REOS.Router.registerRoute({
      key: 'acquisitions.leads.create',
      module: 'leads',
      name: 'Create Acquisition Lead',
      permission: 'leads:write',
      handler: function (payload) { return createLead(payload || {}); }
    });

    REOS.Router.registerRoute({
      key: 'acquisitions.leads.list',
      module: 'leads',
      name: 'List Acquisition Leads',
      permission: 'leads:read',
      handler: function (payload) { return listLeads(payload || {}); }
    });

    REOS.Router.registerRoute({
      key: 'acquisitions.dashboard',
      module: 'leads',
      name: 'Acquisition Dashboard',
      permission: 'leads:read',
      handler: function () { return dashboard(); }
    });
  }

  function createLead(lead) {
    REOS.Security.requirePermission('leads:write');
    lead = normalizeLead_(lead || {});

    const validation = validateLead_(lead);
    REOS.Validation.throwIfInvalid(validation);

    lead.Priority = calculatePriority_(lead);
    lead['Lead Type'] = lead['Lead Type'] || 'Acquisition';
    lead.Active = lead.Active === false ? false : true;

    const created = REOS.Database.insert(LEAD_SHEET, lead, {
      idField: LEAD_ID,
      idPrefix: REOS.CONFIG.IDS.LEAD
    });

    logActivity_(created[LEAD_ID], 'Created', 'Acquisition lead created', created.Notes || '');
    createFollowUpTask_(created);
    REOS.Logger.audit('Acquisition lead created', { leadId: created[LEAD_ID], address: created['Property Address'] });
    return created;
  }

  function updateLead(leadId, changes) {
    REOS.Security.requirePermission('leads:write');
    const existing = getLead(leadId);
    if (!existing) throw new Error('Acquisition lead not found: ' + leadId);

    const merged = normalizeLead_(Object.assign({}, existing, changes || {}));
    const validation = validateLead_(merged);
    REOS.Validation.throwIfInvalid(validation);
    merged.Priority = calculatePriority_(merged);

    const updated = REOS.Database.update(LEAD_SHEET, LEAD_ID, leadId, merged);
    logActivity_(leadId, 'Updated', 'Acquisition lead updated', REOS.toJson_(changes || {}));
    REOS.Logger.audit('Acquisition lead updated', { leadId: leadId });
    return updated;
  }

  function moveStage(leadId, status, notes) {
    REOS.Security.requirePermission('leads:write');
    const validation = REOS.Validation.validateAllowedValue(status, 'Status', PIPELINE, true);
    REOS.Validation.throwIfInvalid(validation);

    const updated = REOS.Database.update(LEAD_SHEET, LEAD_ID, leadId, {
      Status: status,
      Notes: notes || '',
      'Updated At': new Date()
    });

    logActivity_(leadId, 'Stage Change', 'Moved to ' + status, notes || '');
    return updated;
  }

  function getLead(leadId) {
    REOS.Security.requirePermission('leads:read');
    return REOS.Database.findById(LEAD_SHEET, LEAD_ID, leadId);
  }

  function listLeads(options) {
    REOS.Security.requirePermission('leads:read');
    options = options || {};
    let leads = REOS.Database.getAll(LEAD_SHEET).filter(function (lead) {
      return String(lead['Lead Type'] || '').toLowerCase().indexOf('acquisition') !== -1 || !!lead['Property Address'];
    });

    if (options.activeOnly !== false) leads = leads.filter(function (lead) { return lead.Active !== false; });
    if (options.status) leads = leads.filter(function (lead) { return String(lead.Status || '') === String(options.status); });
    if (options.priority) leads = leads.filter(function (lead) { return String(lead.Priority || '') === String(options.priority); });

    return leads.slice(0, options.limit || 100);
  }

  function searchLeads(query) {
    REOS.Security.requirePermission('leads:read');
    const q = String(query || '').trim().toLowerCase();
    if (!q) return listLeads({ limit: 50 });

    return listLeads({ limit: 500 }).filter(function (lead) {
      return [
        lead[LEAD_ID], lead['Property Address'], lead.City, lead.State, lead.Zip,
        lead['Owner Name'], lead['Owner Phone'], lead['Owner Email'], lead['Distress Indicator'],
        lead.Status, lead.Priority, lead.Source, lead.Notes
      ].join(' ').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 50);
  }

  function dashboard() {
    REOS.Security.requirePermission('leads:read');
    const leads = listLeads({ limit: 1000 });
    const byStatus = {};
    const byPriority = {};
    let hot = 0;
    let followUpsDue = 0;
    const today = new Date();

    PIPELINE.forEach(function (stage) { byStatus[stage] = 0; });

    leads.forEach(function (lead) {
      const status = lead.Status || 'New';
      const priority = lead.Priority || 'Medium';
      byStatus[status] = (byStatus[status] || 0) + 1;
      byPriority[priority] = (byPriority[priority] || 0) + 1;
      if (priority === 'Critical' || priority === 'High') hot++;
      if (lead['Next Follow Up']) {
        const due = new Date(lead['Next Follow Up']);
        if (!isNaN(due.getTime()) && due <= today) followUpsDue++;
      }
    });

    return {
      ok: true,
      total: leads.length,
      hot: hot,
      followUpsDue: followUpsDue,
      byStatus: byStatus,
      byPriority: byPriority,
      pipeline: PIPELINE,
      distressIndicators: DISTRESS_INDICATORS
    };
  }

  function normalizeLead_(lead) {
    lead['Lead Type'] = lead['Lead Type'] || 'Acquisition';
    lead.Status = lead.Status || 'New';
    lead.Source = lead.Source || 'Manual';
    lead['Assigned To'] = lead['Assigned To'] || REOS.Security.getCurrentUserEmail();
    lead['Owner Email'] = REOS.normalizeEmail_(lead['Owner Email']);
    lead['Owner Phone'] = REOS.normalizePhone_(lead['Owner Phone']);
    lead.Active = lead.Active === false ? false : true;
    return lead;
  }

  function validateLead_(lead) {
    return REOS.Validation.validateRecord(lead, {
      required: ['Property Address', 'City', 'State', 'Owner Name', 'Status', 'Source'],
      emailField: 'Owner Email',
      phoneField: 'Owner Phone',
      numberFields: [
        { field: 'Estimated Value', min: 0 },
        { field: 'Asking Price', min: 0 }
      ],
      allowedValues: [
        { field: 'Status', values: PIPELINE, required: true },
        { field: 'Priority', values: ['Critical', 'High', 'Medium', 'Low'], required: false }
      ]
    });
  }

  function calculatePriority_(lead) {
    let score = 0;
    const distress = String(lead['Distress Indicator'] || '').toLowerCase();
    const estimatedValue = Number(lead['Estimated Value'] || 0);
    const askingPrice = Number(lead['Asking Price'] || 0);

    if (distress.indexOf('tax') !== -1) score += 20;
    if (distress.indexOf('probate') !== -1) score += 20;
    if (distress.indexOf('code') !== -1) score += 15;
    if (distress.indexOf('vacant') !== -1) score += 15;
    if (distress.indexOf('pre-foreclosure') !== -1) score += 25;
    if (distress.indexOf('absentee') !== -1) score += 10;
    if (estimatedValue > 0 && askingPrice > 0 && askingPrice <= estimatedValue * 0.7) score += 25;
    if (lead['Owner Phone']) score += 5;
    if (lead['Next Follow Up']) score += 5;

    if (score >= 60) return 'Critical';
    if (score >= 40) return 'High';
    if (score >= 20) return 'Medium';
    return 'Low';
  }

  function createFollowUpTask_(lead) {
    if (!lead['Next Follow Up'] || !REOS.CRM || typeof REOS.CRM.createTask !== 'function') return null;
    return REOS.CRM.createTask({
      Title: 'Follow up acquisition lead: ' + lead['Property Address'],
      'Related Type': 'Lead',
      'Related ID': lead[LEAD_ID],
      'Assigned To': lead['Assigned To'],
      Priority: lead.Priority || 'Medium',
      Status: 'Open',
      'Due Date': lead['Next Follow Up'],
      Notes: lead.Notes || ''
    });
  }

  function logActivity_(leadId, type, subject, notes) {
    if (REOS.CRM && typeof REOS.CRM.logActivity === 'function') {
      return REOS.CRM.logActivity('Lead', leadId, type, subject, notes || '');
    }
    return null;
  }

  return {
    PIPELINE: PIPELINE,
    DISTRESS_INDICATORS: DISTRESS_INDICATORS,
    initialize: initialize,
    createLead: createLead,
    updateLead: updateLead,
    moveStage: moveStage,
    getLead: getLead,
    listLeads: listLeads,
    searchLeads: searchLeads,
    dashboard: dashboard
  };
})();

function reosInitializeAcquisitions() {
  return REOS.Acquisitions.initialize();
}

function showAcquisitions() {
  const html = HtmlService.createHtmlOutputFromFile('Acquisitions')
    .setWidth(1200)
    .setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Acquisitions');
}

function acquisitionsCreateLead(lead) {
  return REOS.Acquisitions.createLead(lead || {});
}

function acquisitionsSearchLeads(query) {
  return REOS.Acquisitions.searchLeads(query || '');
}

function acquisitionsDashboard() {
  return REOS.Acquisitions.dashboard();
}

function acquisitionsMoveStage(leadId, status, notes) {
  return REOS.Acquisitions.moveStage(leadId, status, notes || '');
}
