/**
 * REOS Enterprise v3.0 - CRM Framework
 *
 * Provides contact/lead CRUD, search, and CRM sheet initialization.
 */

var REOS = REOS || {};

REOS.CRM = (function () {
  const CONTACT_SHEET = REOS.CONFIG.SHEETS.CRM;
  const LEAD_SHEET = REOS.CONFIG.SHEETS.LEADS;

  const CONTACT_ID_FIELD = 'Client ID';
  const LEAD_ID_FIELD = 'Lead ID';

  const CONTACT_HEADERS = [
    'Client ID', 'First Name', 'Last Name', 'Full Name', 'Client Type', 'Status',
    'Company', 'Email', 'Mobile', 'Office', 'Address', 'City', 'State', 'ZIP',
    'Birthday', 'Home Anniversary', 'Lead Source', 'Referral By', 'Tags', 'Notes',
    'Last Contact', 'Next Follow-up', 'Lead Score', 'Lifetime Value', 'Active',
    'Created At', 'Updated At'
  ];

  const LEAD_HEADERS = [
    'Lead ID', 'Client ID', 'Created Date', 'Lead Type', 'Lead Source', 'Status',
    'Stage', 'Assigned To', 'Lead Score', 'Priority', 'Budget', 'Pre-Approved',
    'Desired Area', 'Timeline', 'Probability', 'Expected Commission',
    'Expected Close', 'Last Contact', 'Next Follow-up', 'Notes', 'Active',
    'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(CONTACT_SHEET, CONTACT_HEADERS);
    ensureTable_(LEAD_SHEET, LEAD_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  }

  function createContact(contact) {
    REOS.Security.requirePermission('crm:write');
    ensureSheets();

    contact = contact || {};
    contact.Email = REOS.normalizeEmail_(contact.Email);
    contact.Mobile = REOS.normalizePhone_(contact.Mobile);
    contact['Full Name'] = buildFullName_(contact);
    contact.Active = contact.Active === false ? false : true;
    contact.Status = contact.Status || 'Lead';

    const validation = REOS.Validation.validateRecord(contact, {
      required: ['First Name', 'Last Name'],
      emailField: 'Email',
      phoneField: 'Mobile',
      dateFields: ['Birthday', 'Home Anniversary', 'Last Contact', 'Next Follow-up']
    });

    if (!validation.ok) throw new Error(validation.errors.join(' '));

    if (contact.Email) {
      const duplicateEmail = REOS.Validation.findDuplicate(CONTACT_SHEET, 'Email', contact.Email);
      if (duplicateEmail) throw new Error('Duplicate email found: ' + contact.Email);
    }

    const created = REOS.Database.insert(CONTACT_SHEET, contact, {
      idField: CONTACT_ID_FIELD,
      idPrefix: REOS.CONFIG.IDS.CLIENT
    });

    REOS.Logger.audit('CRM contact created', { clientId: created[CONTACT_ID_FIELD] });
    return created;
  }

  function updateContact(clientId, changes) {
    REOS.Security.requirePermission('crm:write');
    ensureSheets();

    changes = changes || {};
    if (changes.Email) changes.Email = REOS.normalizeEmail_(changes.Email);
    if (changes.Mobile) changes.Mobile = REOS.normalizePhone_(changes.Mobile);

    const existing = getContact(clientId);
    if (!existing) throw new Error('Contact not found: ' + clientId);

    const merged = Object.assign({}, existing, changes);
    merged['Full Name'] = buildFullName_(merged);

    const validation = REOS.Validation.validateRecord(merged, {
      required: ['First Name', 'Last Name'],
      emailField: 'Email',
      phoneField: 'Mobile',
      dateFields: ['Birthday', 'Home Anniversary', 'Last Contact', 'Next Follow-up']
    });

    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const updated = REOS.Database.update(CONTACT_SHEET, CONTACT_ID_FIELD, clientId, changes);
    REOS.Logger.audit('CRM contact updated', { clientId: clientId });
    return updated;
  }

  function getContact(clientId) {
    REOS.Security.requirePermission('crm:read');
    ensureSheets();
    return REOS.Database.findById(CONTACT_SHEET, CONTACT_ID_FIELD, clientId);
  }

  function listContacts() {
    REOS.Security.requirePermission('crm:read');
    ensureSheets();
    return REOS.Database.getAll(CONTACT_SHEET);
  }

  function searchContacts(query) {
    REOS.Security.requirePermission('crm:read');
    ensureSheets();

    const q = String(query || '').trim().toLowerCase();
    if (!q) return listContacts().slice(0, 50);

    return REOS.Database.query(CONTACT_SHEET, function (contact) {
      const haystack = [
        contact['Full Name'], contact.Email, contact.Mobile, contact.Company,
        contact.Address, contact.Tags, contact.Notes
      ].join(' ').toLowerCase();
      return haystack.indexOf(q) !== -1;
    }).slice(0, 50);
  }

  function archiveContact(clientId) {
    REOS.Security.requirePermission('crm:write');
    ensureSheets();
    const archived = REOS.Database.softDelete(CONTACT_SHEET, CONTACT_ID_FIELD, clientId);
    REOS.Logger.audit('CRM contact archived', { clientId: clientId });
    return archived;
  }

  function createLead(lead) {
    REOS.Security.requirePermission('leads:write');
    ensureSheets();

    lead = lead || {};
    lead['Created Date'] = lead['Created Date'] || new Date();
    lead.Status = lead.Status || 'New';
    lead.Stage = lead.Stage || 'New';
    lead.Active = lead.Active === false ? false : true;
    lead['Lead Score'] = calculateLeadScore_(lead);
    lead.Priority = calculatePriority_(lead['Lead Score']);

    const validation = REOS.Validation.validateRecord(lead, {
      required: ['Lead Type', 'Lead Source', 'Status']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(LEAD_SHEET, lead, {
      idField: LEAD_ID_FIELD,
      idPrefix: REOS.CONFIG.IDS.LEAD
    });

    REOS.Logger.audit('Lead created', { leadId: created[LEAD_ID_FIELD], clientId: created['Client ID'] });
    return created;
  }

  function listLeads() {
    REOS.Security.requirePermission('leads:read');
    ensureSheets();
    return REOS.Database.getAll(LEAD_SHEET);
  }

  function updateLead(leadId, changes) {
    REOS.Security.requirePermission('leads:write');
    ensureSheets();

    const existing = REOS.Database.findById(LEAD_SHEET, LEAD_ID_FIELD, leadId);
    if (!existing) throw new Error('Lead not found: ' + leadId);

    const merged = Object.assign({}, existing, changes || {});
    merged['Lead Score'] = calculateLeadScore_(merged);
    merged.Priority = calculatePriority_(merged['Lead Score']);

    const updated = REOS.Database.update(LEAD_SHEET, LEAD_ID_FIELD, leadId, merged);
    REOS.Logger.audit('Lead updated', { leadId: leadId });
    return updated;
  }

  function calculateLeadScore_(lead) {
    let score = 0;
    const source = String(lead['Lead Source'] || '').toLowerCase();
    const type = String(lead['Lead Type'] || '').toLowerCase();
    const status = String(lead.Status || lead.Stage || '').toLowerCase();
    const timeline = String(lead.Timeline || '').toLowerCase();
    const budget = Number(lead.Budget || 0);

    if (source.indexOf('referral') !== -1) score += 30;
    if (source.indexOf('repeat') !== -1) score += 25;
    if (status.indexOf('appointment') !== -1) score += 20;
    if (lead['Pre-Approved'] === true || String(lead['Pre-Approved']).toLowerCase() === 'yes') score += 20;
    if (type.indexOf('investor') !== -1) score += 15;
    if (budget >= 500000) score += 10;
    if (timeline.indexOf('immediate') !== -1 || timeline.indexOf('30') !== -1) score += 15;

    return Math.min(score, 100);
  }

  function calculatePriority_(score) {
    score = Number(score || 0);
    if (score >= 90) return 'Hot';
    if (score >= 70) return 'Warm';
    if (score >= 40) return 'Cool';
    return 'Cold';
  }

  function buildFullName_(record) {
    return [record['First Name'], record['Last Name']].filter(Boolean).join(' ').trim();
  }

  return {
    ensureSheets: ensureSheets,
    createContact: createContact,
    updateContact: updateContact,
    getContact: getContact,
    listContacts: listContacts,
    searchContacts: searchContacts,
    archiveContact: archiveContact,
    createLead: createLead,
    listLeads: listLeads,
    updateLead: updateLead
  };
})();

function showCRM() {
  const html = HtmlService.createHtmlOutputFromFile('CRM')
    .setWidth(900)
    .setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS CRM');
}

function crmSearchContacts(query) {
  return REOS.CRM.searchContacts(query);
}

function crmCreateContact(contact) {
  return REOS.CRM.createContact(contact);
}
