/**
 * REOS Enterprise - Zillow lead enrichment, CRM routing, and monitoring.
 * Keeps Gmail ingestion deterministic while adding production post-processing.
 */
var REOS = REOS || {};

REOS.ZillowLeadAutomation = (function () {
  var STAGING = 'ZILLOW_GMAIL_LEADS';
  var LEADS = (REOS.CONFIG && REOS.CONFIG.SHEETS && REOS.CONFIG.SHEETS.LEADS) || 'LEADS';
  var TASKS = (REOS.CONFIG && REOS.CONFIG.SHEETS && REOS.CONFIG.SHEETS.TASKS) || 'TASKS';
  var RUNS = 'ACQUISITION_CONNECTOR_RUNS';

  function process(stagingLead, options) {
    options = options || {};
    var classification = classify_(stagingLead || {});
    var score = score_(stagingLead || {}, classification);
    var priority = priority_(score);
    var crmResult = upsertLead_(stagingLead || {}, classification, score, priority);
    var taskResult = null;

    if (options.createFollowUpTask !== false && priority !== 'Low') {
      taskResult = ensureFollowUpTask_(crmResult.lead, stagingLead || {}, priority);
    }

    return {
      ok: true,
      classification: classification,
      score: score,
      priority: priority,
      crmAction: crmResult.action,
      crmLeadId: crmResult.lead['Lead ID'],
      taskAction: taskResult ? taskResult.action : 'none',
      taskId: taskResult && taskResult.task ? taskResult.task['Task ID'] : ''
    };
  }

  function classify_(lead) {
    var haystack = [
      lead['Source Label'], lead.Subject, lead.Message, lead['Raw Snippet']
    ].join(' ').toLowerCase();

    if (/seller|sell my home|home value|listing agent|list my/.test(haystack)) return 'Seller';
    if (/rent|rental|lease|tenant/.test(haystack)) return 'Rental';
    if (/buyer|buy|tour|showing|mortgage|pre.?approved/.test(haystack)) return 'Buyer';
    return 'General Inquiry';
  }

  function score_(lead, classification) {
    var score = 20;
    var text = [lead.Subject, lead.Message, lead['Raw Snippet']].join(' ').toLowerCase();

    if (lead['Buyer Email']) score += 15;
    if (lead['Buyer Phone']) score += 20;
    if (lead['Property Address']) score += 15;
    if (lead['Listing URL']) score += 5;
    if (classification === 'Seller') score += 10;
    if (/asap|immediately|today|urgent|ready|pre.?approved|cash buyer|make an offer/.test(text)) score += 15;
    if (/just browsing|not ready|maybe later/.test(text)) score -= 15;

    return Math.max(0, Math.min(score, 100));
  }

  function priority_(score) {
    if (score >= 75) return 'High';
    if (score >= 45) return 'Medium';
    return 'Low';
  }

  function upsertLead_(stagingLead, classification, score, priority) {
    ensureCoreTables_();
    var rows = REOS.Database.getAll(LEADS);
    var email = normalizeEmail_(stagingLead['Buyer Email']);
    var phone = normalizePhone_(stagingLead['Buyer Phone']);
    var address = normalizeText_(stagingLead['Property Address']);
    var existing = rows.filter(function (row) {
      var rowEmail = normalizeEmail_(row['Owner Email']);
      var rowPhone = normalizePhone_(row['Owner Phone']);
      var rowAddress = normalizeText_(row['Property Address']);
      return (email && rowEmail === email) ||
        (phone && rowPhone === phone) ||
        (address && rowAddress === address);
    })[0];

    var notes = buildNotes_(stagingLead, classification, score);
    var record = {
      'Lead Type': classification,
      'Property Address': stagingLead['Property Address'] || '',
      'Owner Name': stagingLead['Buyer Name'] || '',
      'Owner Phone': stagingLead['Buyer Phone'] || '',
      'Owner Email': stagingLead['Buyer Email'] || '',
      'Distress Indicator': classification === 'Seller' ? 'Inbound seller inquiry' : '',
      'Status': existing && existing.Status && existing.Status !== 'New' ? existing.Status : 'New',
      'Priority': priority,
      'Source': 'Zillow Gmail',
      'Assigned To': existing ? existing['Assigned To'] : currentUser_(),
      'Next Follow Up': nextFollowUp_(priority),
      'Notes': mergeNotes_(existing && existing.Notes, notes),
      'Active': true
    };

    if (existing) {
      return {
        action: 'updated',
        lead: REOS.Database.update(LEADS, 'Lead ID', existing['Lead ID'], record)
      };
    }

    return {
      action: 'created',
      lead: REOS.Database.insert(LEADS, record, {
        idField: 'Lead ID',
        idPrefix: (REOS.CONFIG && REOS.CONFIG.IDS && REOS.CONFIG.IDS.LEAD) || 'LEAD'
      })
    };
  }

  function ensureFollowUpTask_(crmLead, stagingLead, priority) {
    var existing = REOS.Database.getAll(TASKS).filter(function (task) {
      return String(task['Related ID'] || '') === String(crmLead['Lead ID'] || '') &&
        String(task.Status || '').toLowerCase() !== 'completed' &&
        String(task.Title || '').indexOf('Zillow lead follow-up') === 0;
    })[0];

    if (existing) return { action: 'existing', task: existing };

    var task = REOS.Database.insert(TASKS, {
      'Title': 'Zillow lead follow-up - ' + (stagingLead['Buyer Name'] || stagingLead['Property Address'] || crmLead['Lead ID']),
      'Related Type': 'Lead',
      'Related ID': crmLead['Lead ID'],
      'Assigned To': crmLead['Assigned To'] || currentUser_(),
      'Priority': priority,
      'Status': 'Open',
      'Due Date': nextFollowUp_(priority),
      'Notes': 'Contact inbound Zillow lead. Source Gmail message: ' + (stagingLead['Gmail Message ID'] || ''),
      'Active': true
    }, {
      idField: 'Task ID',
      idPrefix: (REOS.CONFIG && REOS.CONFIG.IDS && REOS.CONFIG.IDS.TASK) || 'TASK'
    });

    return { action: 'created', task: task };
  }

  function dashboard() {
    ensureCoreTables_();
    var staging = REOS.Database.getAll(STAGING);
    var runs = REOS.Database.getAll(RUNS).filter(function (run) {
      return String(run['Connector Key'] || '').indexOf('zillow_gmail') !== -1;
    }).slice().reverse();
    var latest = runs[0] || {};
    var crmLeads = REOS.Database.getAll(LEADS).filter(function (lead) {
      return String(lead.Source || '') === 'Zillow Gmail';
    });

    return {
      ok: String(latest.Status || '') !== 'Failed',
      stagingLeads: staging.length,
      crmLeads: crmLeads.length,
      highPriority: crmLeads.filter(function (lead) { return lead.Priority === 'High'; }).length,
      mediumPriority: crmLeads.filter(function (lead) { return lead.Priority === 'Medium'; }).length,
      lowPriority: crmLeads.filter(function (lead) { return lead.Priority === 'Low'; }).length,
      lastRunAt: latest['Completed At'] || latest['Started At'] || '',
      lastStatus: latest.Status || 'Never Run',
      lastMessage: latest.Message || '',
      lastFound: Number(latest['Records Found'] || 0),
      lastImported: Number(latest['Records Imported'] || 0),
      lastSkipped: Number(latest['Records Skipped'] || 0)
    };
  }

  function ensureCoreTables_() {
    if (!REOS.Database) throw new Error('Database.gs is required.');
    if (REOS.Schema && REOS.Schema.LEADS) REOS.Database.ensureTable(LEADS, REOS.Schema.LEADS);
    if (REOS.Schema && REOS.Schema.TASKS) REOS.Database.ensureTable(TASKS, REOS.Schema.TASKS);
  }

  function buildNotes_(lead, classification, score) {
    return [
      'Zillow Gmail lead',
      'Classification: ' + classification,
      'Score: ' + score + '/100',
      'Source label: ' + (lead['Source Label'] || ''),
      'Listing URL: ' + (lead['Listing URL'] || ''),
      'Message: ' + (lead.Message || lead['Raw Snippet'] || ''),
      'Gmail Message ID: ' + (lead['Gmail Message ID'] || '')
    ].join('\n');
  }

  function mergeNotes_(existing, incoming) {
    existing = String(existing || '').trim();
    incoming = String(incoming || '').trim();
    if (!existing) return incoming;
    if (existing.indexOf(incoming) !== -1) return existing;
    return existing + '\n\n--- Zillow update ' + new Date().toISOString() + ' ---\n' + incoming;
  }

  function nextFollowUp_(priority) {
    var date = new Date();
    date.setHours(date.getHours() + (priority === 'High' ? 2 : priority === 'Medium' ? 24 : 72));
    return date;
  }

  function normalizeEmail_(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizePhone_(value) {
    return String(value || '').replace(/\D/g, '').slice(-10);
  }

  function normalizeText_(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function currentUser_() {
    try { return Session.getEffectiveUser().getEmail() || ''; } catch (error) { return ''; }
  }

  return {
    process: process,
    classify: classify_,
    score: score_,
    dashboard: dashboard
  };
})();

function reosZillowLeadAutomationDashboard() {
  var result = REOS.ZillowLeadAutomation.dashboard();
  console.log(JSON.stringify(result));
  return result;
}
