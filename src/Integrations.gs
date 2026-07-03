/**
 * REOS Enterprise v3.0 - Enterprise Integration Hub
 *
 * Central registry, credential storage, sync logging, and provider dispatch.
 */

var REOS = REOS || {};

REOS.Integrations = (function () {
  const REGISTRY_SHEET = 'INTEGRATIONS';
  const LOG_SHEET = 'INTEGRATION_LOG';
  const ID_FIELD = 'Integration ID';

  const REGISTRY_HEADERS = [
    'Integration ID', 'Provider', 'Category', 'Status', 'Base URL', 'Auth Type',
    'Credential Key', 'Last Sync At', 'Sync Direction', 'Notes', 'Active',
    'Created At', 'Updated At'
  ];

  const LOG_HEADERS = [
    'Log ID', 'Integration ID', 'Provider', 'Action', 'Direction', 'Status',
    'Message', 'Request JSON', 'Response JSON', 'Started At', 'Finished At',
    'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(REGISTRY_SHEET, REGISTRY_HEADERS);
    ensureTable_(LOG_SHEET, LOG_HEADERS);
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
    return sheet;
  }

  function register(config) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    config = config || {};
    config.Status = config.Status || 'Configured';
    config.Active = config.Active === false ? false : true;
    const validation = REOS.Validation.validateRecord(config, { required: ['Provider', 'Category'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const created = REOS.Database.insert(REGISTRY_SHEET, config, { idField: ID_FIELD, idPrefix: 'INT' });
    REOS.Logger.audit('Integration registered', { integrationId: created[ID_FIELD], provider: created.Provider });
    return created;
  }

  function listActive() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.query(REGISTRY_SHEET, function (row) { return row.Active !== false; });
  }

  function getByProvider(provider) {
    ensureSheets();
    return REOS.Database.query(REGISTRY_SHEET, function (row) {
      return String(row.Provider || '').toLowerCase() === String(provider || '').toLowerCase() && row.Active !== false;
    })[0] || null;
  }

  function setCredential(key, value) {
    REOS.Security.requirePermission('finance:write');
    PropertiesService.getScriptProperties().setProperty('REOS_INT_' + key, value);
    return true;
  }

  function getCredential(key) {
    return PropertiesService.getScriptProperties().getProperty('REOS_INT_' + key);
  }

  function request(provider, action, options) {
    ensureSheets();
    const integration = getByProvider(provider) || { Provider: provider, 'Integration ID': '' };
    const startedAt = new Date();
    options = options || {};
    try {
      const response = dispatch_(provider, action, options);
      log_(integration, action, options.direction || 'Outbound', 'Success', 'Completed', options, response, startedAt);
      return response;
    } catch (error) {
      log_(integration, action, options.direction || 'Outbound', 'Error', error.message, options, {}, startedAt);
      throw error;
    }
  }

  function dispatch_(provider, action, options) {
    provider = String(provider || '').toLowerCase();
    if (provider === 'twilio') return REOS.Twilio.execute(action, options);
    if (provider === 'stripe') return REOS.Stripe.execute(action, options);
    if (provider === 'quickbooks') return REOS.QuickBooks.execute(action, options);
    if (provider === 'docusign') return REOS.DocuSign.execute(action, options);
    if (provider === 'mls') return REOS.MLS.execute(action, options);
    if (provider === 'zapier') return REOS.Zapier.execute(action, options);
    if (provider === 'googleworkspace') return REOS.GoogleWorkspace.execute(action, options);
    throw new Error('No integration adapter found for provider: ' + provider);
  }

  function log_(integration, action, direction, status, message, req, res, startedAt) {
    return REOS.Database.insert(LOG_SHEET, {
      'Integration ID': integration[ID_FIELD] || '',
      Provider: integration.Provider || '',
      Action: action || '',
      Direction: direction || '',
      Status: status || '',
      Message: message || '',
      'Request JSON': JSON.stringify(req || {}),
      'Response JSON': JSON.stringify(res || {}),
      'Started At': startedAt || new Date(),
      'Finished At': new Date()
    }, { idField: 'Log ID', idPrefix: 'IL' });
  }

  return {
    ensureSheets: ensureSheets,
    register: register,
    listActive: listActive,
    getByProvider: getByProvider,
    setCredential: setCredential,
    getCredential: getCredential,
    request: request
  };
})();

function integrationsRegister(config) { return REOS.Integrations.register(config); }
function integrationsListActive() { return REOS.Integrations.listActive(); }
function integrationsSetCredential(key, value) { return REOS.Integrations.setCredential(key, value); }
function integrationsRequest(provider, action, options) { return REOS.Integrations.request(provider, action, options || {}); }
