/**
 * REOS Enterprise v3.0 - CRM Module Foundation
 *
 * Provides client/contact CRUD, lead CRUD, search, activity logging,
 * and task creation using the shared REOS database/security framework.
 */

var REOS = REOS || {};

REOS.CRM = (function () {
  const CLIENT_SHEET = (REOS.CONFIG && REOS.CONFIG.SHEETS && REOS.CONFIG.SHEETS.CRM) || 'CRM';
  const LEAD_SHEET = (REOS.CONFIG && REOS.CONFIG.SHEETS && REOS.CONFIG.SHEETS.LEADS) || 'LEADS';
  const TASK_SHEET = (REOS.CONFIG && REOS.CONFIG.SHEETS && REOS.CONFIG.SHEETS.TASKS) || 'TASKS';
  const ACTIVITY_SHEET = (REOS.CONFIG && REOS.CONFIG.SHEETS && REOS.CONFIG.SHEETS.ACTIVITIES) || 'ACTIVITIES';

  const CLIENT_ID = 'Client ID';
  const LEAD_ID = 'Lead ID';
  const TASK_ID = 'Task ID';
  const ACTIVITY_ID = 'Activity ID';

  function initialize() {
    if (REOS.Setup && REOS.Setup.initializeWorkbook) {
      REOS.Setup.initializeWorkbook();
    }
    registerRoutes_();
    REOS.Logger.info('CRM module initialized', {});
    return { ok: true, module: 'crm' };
  }

  function registerRoutes_() {
    if (!REOS.Router) return;

    REOS.Router.registerRoute({
      key: 'crm.clients.list',
      module: 'crm',
      name: 'List Clients',
      permission: 'crm:read',
      handler: function (payload) { return listClients(payload || {}); }
    });

    REOS.Router.registerRoute({
      key: 'crm.clients.create',
      module: 'crm',
      name: 'Create Client',
      permission: 'crm:write',
      handler: function (payload) { return createClient(payload || {}); }
    });

    REOS.Router.registerRoute({
      key: 'crm.leads.list',
      module: 'crm',
      name: 'List Leads',
      permission: 'leads:read',
      handler: function (payload) { return listLeads(payload || {}); }
    });

    REOS.Router.registerRoute({
      key: 'crm.leads.create',
      module: 'crm',
      name: 'Create Lead',
      permission: 'leads:write',
      handler: function (payload) { return createLead(payload || {}); }
    });
  }

  function normalizeClient_(client) {
    client = client || {};
    client.Email = REOS.normalizeEmail_(client.Email);
    client.Phone = REOS.normalizePhone_(client.Phone);
    client['Client Type'] = client['Client Type'] || 'Buyer';
    client.Status = client.Status || 'Active';
    client.Owner = client.Owner || REOS.Security.getCurrentUserEmail();
    client.Active = client.Active === false ? false : true;
    return client;
  }

  function createClient(client) {
    REOS.Security.requirePermission('crm:write');
    client = normalizeClient_(client);

    const validation = REOS.Validation.validateRecord(client, {
      required: ['First Name', 'Last Name'],
      emailField: 'Email',
      phoneField: 'Phone'
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    if (client.Email) {
      const duplicate = REOS.Validation.findDuplicate(CLIENT_SHEET, 'Email', client.Email);
      if (duplicate) throw new Error('Duplicate client email: ' + client.Email);
    }

    const created = REOS.Database.insert(CLIENT_SHEET, client, {
      idField: CLIENT_ID,
      idPrefix: REOS.CONFIG.IDS.CLIENT
    });

    logActivity('Client', created[CLIENT_ID], 'Created', 'Client created', created.Notes || '');
    REOS.Logger.audit('CRM client created', { clientId: created[CLIENT_ID] });
    return created;
  }

  function updateClient(clientId, changes) {
    REOS.Security.requirePermission('crm:write');
    changes = normalizeClient_(changes || {});

    const existing = getClient(clientId);
    if (!existing) throw new Error('Client not found: ' + clientId);

    if (changes.Email) {
      const duplicate = REOS.Validation.findDuplicate(CLIENT_SHEET, 'Email', changes.Email, CLIENT_ID, clientId);
      if (duplicate) throw new Error('Duplicate client email: ' + changes.Email);
    }

    const updated = REOS.Database.update(CLIENT_SHEET, CLIENT_ID, clientId, changes);
    logActivity('Client', clientId, 'Updated', 'Client updated', REOS.toJson_(changes));
    REOS.Logger.audit('CRM client updated', { clientId: clientId });
    return updated;
  }

  function getClient(clientId) {
    REOS.Security.requirePermission('crm:read');
    return REOS.Database.findById(CLIENT_SHEET, CLIENT_ID, clientId);
  }

  function listClients(options) {
    REOS.Security.requirePermission('crm:read');
    options = options || {};
    let clients = REOS.Database.getAll(CLIENT_SHEET);

    if (options.activeOnly !== false) {
      clients = clients.filter(function (client) { return client.Active !== false; });
    }

    if (options.status) {
      clients = clients.filter(function (client) { return String(client.Status || '') === String(options.status); });
    }

    return clients.slice(0, options.limit || 100);
  }

  function searchClients(query) {
    REOS.Security.requirePermission('crm:read');
    const q = String(query || '').trim().toLowerCase();
    if (!q) return listClients({ limit: 50 });

    return REOS.Database.query(CLIENT_SHEET, function (client) {
      return [
        client[CLIENT_ID], client['First Name'], client['Last Name'], client.Company,
        client.Email, client.Phone, client.Status, client.Source, client.Notes
      ].join(' ').toLowerCase().indexOf(q) !== -1;
    }).slice(0, 50);
  }

  function archiveClient(clientId) {
    REOS.Security.requirePermission('crm:write');
    const archived = REOS.Database.softDelete(CLIENT_SHEET, CLIENT_ID, clientId);
    logActivity('Client', clientId, 'Archived', 'Client archived', '');
    REOS.Logger.audit('CRM client archived', { clientId: clientId });
    return archived;
  }

  function normalizeLead_(lead) {
    lead = lead || {};
    lead.Status = lead.Status || 'New';
    lead.Priority = lead.Priority || 'Medium';
    lead.Source = lead.Source || 'Manual';
    lead['Assigned To'] = lead['Assigned To'] || REOS.Security.getCurrentUserEmail();
    lead.Active = lead.Active === false ? false : true;
    return lead;
  }

  function createLead(lead) {
    REOS.Security.requirePermission('leads:write');
    lead = normalizeLead_(lead);

    const validation = REOS.Validation.validateRecord(lead, {
      required: ['Lead Type', 'Status', 'Source']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(LEAD_SHEET, lead, {
      idField: LEAD_ID,
      idPrefix: REOS.CONFIG.IDS.LEAD
    });

    logActivity('Lead', created[LEAD_ID], 'Created', 'Lead created', created.Notes || '');
    REOS.Logger.audit('CRM lead created', { leadId: created[LEAD_ID] });
    return created;
  }

  function updateLead(leadId, changes) {
    REOS.Security.requirePermission('leads:write');
    const existing = getLead(leadId);
    if (!existing) throw new Error('Lead not found: ' + leadId);

    const updated = REOS.Database.update(LEAD_SHEET, LEAD_ID, leadId, normalizeLead_(changes || {}));
    logActivity('Lead', leadId, 'Updated', 'Lead updated', REOS.toJson_(changes));
    REOS.Logger.audit('CRM lead updated', { leadId: leadId });
    return updated;
  }

  function getLead(leadId) {
    REOS.Security.requirePermission('leads:read');
    return REOS.Database.findById(LEAD_SHEET, LEAD_ID, leadId);
  }

  function listLeads(options) {
    REOS.Security.requirePermission('leads:read');
    options = options || {};
    let leads = REOS.Database.getAll(LEAD_SHEET);

    if (options.activeOnly !== false) {
      leads = leads.filter(function (lead) { return lead.Active !== false; });
    }

    if (options.status) {
      leads = leads.filter(function (lead) { return String(lead.Status || '') === String(options.status); });
    }

    return leads.slice(0, options.limit || 100);
  }

  function createTask(task) {
    REOS.Security.requirePermission('tasks:write');
    task = task || {};
    task.Status = task.Status || 'Open';
    task.Priority = task.Priority || 'Medium';
    task['Assigned To'] = task['Assigned To'] || REOS.Security.getCurrentUserEmail();
    task.Active = task.Active === false ? false : true;

    const validation = REOS.Validation.validateRecord(task, { required: ['Title'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(TASK_SHEET, task, {
      idField: TASK_ID,
      idPrefix: REOS.CONFIG.IDS.TASK
    });

    REOS.Logger.audit('CRM task created', { taskId: created[TASK_ID], relatedId: created['Related ID'] });
    return created;
  }

  function logActivity(relatedType, relatedId, activityType, subject, notes) {
    const activity = {
      'Related Type': relatedType,
      'Related ID': relatedId,
      'Activity Type': activityType,
      'Subject': subject,
      'Notes': notes || '',
      'User': REOS.Security.getCurrentUserEmail(),
      'Activity Date': new Date()
    };

    return REOS.Database.insert(ACTIVITY_SHEET, activity, {
      idField: ACTIVITY_ID,
      idPrefix: REOS.CONFIG.IDS.ACTIVITY
    });
  }

  return {
    initialize: initialize,
    createClient: createClient,
    updateClient: updateClient,
    getClient: getClient,
    listClients: listClients,
    searchClients: searchClients,
    archiveClient: archiveClient,
    createLead: createLead,
    updateLead: updateLead,
    getLead: getLead,
    listLeads: listLeads,
    createTask: createTask,
    logActivity: logActivity,

    // Backward-compatible aliases.
    createContact: createClient,
    updateContact: updateClient,
    getContact: getClient,
    listContacts: listClients,
    searchContacts: searchClients,
    archiveContact: archiveClient
  };
})();

function reosInitializeCRM() {
  return REOS.CRM.initialize();
}

function showCRM() {
  const html = HtmlService.createHtmlOutputFromFile('CRMUI')
    .setWidth(1100)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS CRM');
}

function crmSearchContacts(query) {
  return REOS.CRM.searchClients(query);
}

function crmCreateContact(contact) {
  return REOS.CRM.createClient(contact);
}

function crmCreateLead(lead) {
  return REOS.CRM.createLead(lead);
}
