/**
 * REOS Enterprise v3.0 - External Data Integration Stubs
 *
 * Sprint 8.9 foundation for vendor-neutral external property data integrations.
 * Provides provider registry, config validation, request logging, response mapping,
 * safe dry-run behavior, and placeholders for MLS, ATTOM, BatchData, PropertyRadar,
 * county records, skip tracing, maps, and document/photo ingestion.
 */

var REOS = REOS || {};

REOS.ExternalIntegrations = (function () {
  const REQUESTS_SHEET = 'EXTERNAL_REQUESTS';
  const PROVIDERS_SHEET = 'EXTERNAL_PROVIDERS';
  const REQUEST_ID_FIELD = 'Request ID';
  const PROVIDER_ID_FIELD = 'Provider ID';

  const REQUEST_HEADERS = [
    'Request ID', 'Provider', 'Operation', 'Status', 'Record Type', 'Record ID',
    'Request JSON', 'Response JSON', 'Error', 'Started At', 'Finished At', 'Created At', 'Updated At'
  ];

  const PROVIDER_HEADERS = [
    'Provider ID', 'Provider', 'Category', 'Base URL', 'Enabled', 'Dry Run',
    'Auth Type', 'Secret Property', 'Daily Limit', 'Notes', 'Created At', 'Updated At'
  ];

  const PROVIDERS = [
    { key: 'mls', name: 'MLS / RESO Web API', category: 'Listings', authType: 'Bearer', secretProperty: 'REOS_MLS_API_KEY', operations: ['searchListings', 'getListing'] },
    { key: 'attom', name: 'ATTOM Property API', category: 'Property Data', authType: 'ApiKey', secretProperty: 'REOS_ATTOM_API_KEY', operations: ['propertyLookup', 'valuation', 'ownership'] },
    { key: 'batchdata', name: 'BatchData', category: 'Skip Trace / Lists', authType: 'ApiKey', secretProperty: 'REOS_BATCHDATA_API_KEY', operations: ['skipTrace', 'propertySearch'] },
    { key: 'propertyradar', name: 'PropertyRadar', category: 'Distressed Data', authType: 'ApiKey', secretProperty: 'REOS_PROPERTYRADAR_API_KEY', operations: ['distressSearch', 'ownerLookup'] },
    { key: 'county', name: 'County Records', category: 'Public Records', authType: 'None', secretProperty: '', operations: ['taxLookup', 'deedLookup', 'codeViolationLookup'] },
    { key: 'maps', name: 'Google Maps / Geocoding', category: 'Geography', authType: 'ApiKey', secretProperty: 'REOS_MAPS_API_KEY', operations: ['geocode', 'route', 'territory'] }
  ];

  function ensureSheets() {
    ensureTable_(PROVIDERS_SHEET, PROVIDER_HEADERS);
    ensureTable_(REQUESTS_SHEET, REQUEST_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setWrap(true);
      sheet.autoResizeColumns(1, headers.length);
    }
    return sheet;
  }

  function initialize() {
    REOS.Security.requireAdmin();
    ensureSheets();
    seedProviders();
    return getDashboard();
  }

  function seedProviders() {
    ensureSheets();
    const existing = REOS.Database.getAll(PROVIDERS_SHEET);
    const existingKeys = existing.map(function (row) { return String(row.Provider || '').toLowerCase(); });
    let created = 0;
    PROVIDERS.forEach(function (provider) {
      if (existingKeys.indexOf(provider.key) !== -1) return;
      REOS.Database.insert(PROVIDERS_SHEET, {
        Provider: provider.key,
        Category: provider.category,
        'Base URL': '',
        Enabled: false,
        'Dry Run': true,
        'Auth Type': provider.authType,
        'Secret Property': provider.secretProperty,
        'Daily Limit': 100,
        Notes: provider.name + ' integration stub. Configure endpoint and credentials before enabling live calls.'
      }, { idField: PROVIDER_ID_FIELD, idPrefix: 'EXTP' });
      created++;
    });
    if (created) REOS.Logger.audit('External integration providers seeded', { created: created });
    return { ok: true, created: created };
  }

  function getProviders() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const configured = REOS.Database.getAll(PROVIDERS_SHEET);
    return configured.map(function (row) {
      const meta = PROVIDERS.filter(function (provider) { return provider.key === row.Provider; })[0] || {};
      return Object.assign({}, row, { Name: meta.name || row.Provider, Operations: meta.operations || [] });
    });
  }

  function updateProvider(providerId, changes) {
    REOS.Security.requireAdmin();
    ensureSheets();
    if (!providerId) throw new Error('Provider ID is required.');
    const update = Object.assign({}, changes || {}, { 'Updated At': new Date() });
    const updated = REOS.Database.update(PROVIDERS_SHEET, PROVIDER_ID_FIELD, providerId, update);
    REOS.Logger.audit('External provider updated', { providerId: providerId, provider: updated.Provider });
    return updated;
  }

  function getRequests(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    let rows = REOS.Database.getAll(REQUESTS_SHEET);
    if (options.provider) rows = rows.filter(function (row) { return String(row.Provider || '') === String(options.provider); });
    if (options.status) rows = rows.filter(function (row) { return String(row.Status || '') === String(options.status); });
    return latest_(rows, 'Started At', Number(options.limit || 100));
  }

  function getDashboard() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const providers = getProviders();
    const requests = getRequests({ limit: 100 });
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        providers: providers.length,
        enabledProviders: providers.filter(function (p) { return p.Enabled === true; }).length,
        dryRunProviders: providers.filter(function (p) { return p['Dry Run'] !== false; }).length,
        recentRequests: requests.length,
        failedRequests: requests.filter(function (r) { return String(r.Status || '').toLowerCase() === 'error'; }).length
      },
      providers: providers,
      requests: requests,
      supportedProviders: PROVIDERS
    };
  }

  function invoke(providerKey, operation, payload, context) {
    REOS.Security.requireAdmin();
    ensureSheets();
    providerKey = String(providerKey || '').toLowerCase();
    operation = String(operation || '').trim();
    payload = payload || {};
    context = context || {};
    const provider = getProviderConfig_(providerKey);
    if (!provider) throw new Error('Unknown external provider: ' + providerKey);
    validateOperation_(providerKey, operation);

    const startedAt = new Date();
    let requestRow;
    try {
      requestRow = logRequest_(providerKey, operation, 'Started', context, payload, '', '');
      const dryRun = provider['Dry Run'] !== false || provider.Enabled !== true;
      const result = dryRun ? buildDryRunResponse_(providerKey, operation, payload, context) : executeLiveRequest_(provider, operation, payload);
      REOS.Database.update(REQUESTS_SHEET, REQUEST_ID_FIELD, requestRow[REQUEST_ID_FIELD], {
        Status: 'Success',
        'Response JSON': REOS.toJson_(result),
        'Finished At': new Date(),
        'Updated At': new Date()
      });
      return Object.assign({ ok: true, dryRun: dryRun, durationMs: new Date().getTime() - startedAt.getTime() }, result);
    } catch (error) {
      if (requestRow) {
        REOS.Database.update(REQUESTS_SHEET, REQUEST_ID_FIELD, requestRow[REQUEST_ID_FIELD], {
          Status: 'Error',
          Error: error.message,
          'Finished At': new Date(),
          'Updated At': new Date()
        });
      }
      REOS.handleError_('External integration ' + providerKey + '.' + operation, error);
      throw error;
    }
  }

  function propertyLookup(address, options) {
    return invoke((options && options.provider) || 'attom', 'propertyLookup', { address: address }, { recordType: 'Property', recordId: options && options.propertyId });
  }

  function skipTraceLead(leadId, options) {
    REOS.Security.requirePermission('leads:read');
    const lead = REOS.Acquisitions.getLead(leadId);
    return invoke((options && options.provider) || 'batchdata', 'skipTrace', { lead: lead }, { recordType: 'Lead', recordId: leadId });
  }

  function searchDistressedProperties(criteria) {
    return invoke('propertyradar', 'distressSearch', criteria || {}, { recordType: 'Lead', recordId: 'SEARCH' });
  }

  function geocodeAddress(address) {
    return invoke('maps', 'geocode', { address: address }, { recordType: 'Location', recordId: address });
  }

  function mapExternalProperty(providerKey, raw) {
    raw = raw || {};
    return {
      'Property Name': raw.propertyName || raw.address || '',
      Address: raw.address || raw.fullAddress || '',
      City: raw.city || '',
      State: raw.state || '',
      Zip: raw.zip || raw.postalCode || '',
      'Property Type': raw.propertyType || 'Single Family',
      Status: 'Prospect',
      'Occupancy Status': raw.occupancyStatus || 'Unknown',
      'Estimated Value': raw.estimatedValue || raw.avm || '',
      Notes: 'Mapped from external provider: ' + providerKey
    };
  }

  function mapExternalLead(providerKey, raw) {
    raw = raw || {};
    return {
      'Property Address': raw.address || raw.fullAddress || '',
      City: raw.city || '',
      State: raw.state || '',
      Zip: raw.zip || raw.postalCode || '',
      'Owner Name': raw.ownerName || '',
      'Distress Indicator': raw.distressIndicator || raw.distressType || '',
      Source: providerKey,
      Status: 'New',
      Priority: raw.priority || 'Medium',
      Notes: 'Mapped from external provider: ' + providerKey
    };
  }

  function executeLiveRequest_(provider, operation, payload) {
    const baseUrl = String(provider['Base URL'] || '').trim();
    if (!baseUrl) throw new Error('Provider base URL is required for live requests.');
    const authType = String(provider['Auth Type'] || 'None');
    const secretProperty = String(provider['Secret Property'] || '');
    const headers = { 'Content-Type': 'application/json' };
    if (authType !== 'None' && secretProperty) {
      const secret = REOS.getProperty_(secretProperty);
      if (!secret) throw new Error('Missing secret property: ' + secretProperty);
      if (authType === 'Bearer') headers.Authorization = 'Bearer ' + secret;
      if (authType === 'ApiKey') headers['x-api-key'] = secret;
    }
    const response = UrlFetchApp.fetch(baseUrl.replace(/\/$/, '') + '/' + encodeURIComponent(operation), {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: REOS.toJson_(payload || {}),
      muteHttpExceptions: true
    });
    const code = response.getResponseCode();
    const text = response.getContentText();
    if (code < 200 || code >= 300) throw new Error('External request failed with HTTP ' + code + ': ' + text.slice(0, 500));
    try { return JSON.parse(text || '{}'); } catch (error) { return { raw: text }; }
  }

  function buildDryRunResponse_(providerKey, operation, payload, context) {
    return {
      provider: providerKey,
      operation: operation,
      mappedProperty: operation === 'propertyLookup' || operation === 'geocode' ? mapExternalProperty(providerKey, payload) : null,
      mappedLead: operation === 'distressSearch' || operation === 'skipTrace' ? mapExternalLead(providerKey, payload.lead || payload) : null,
      message: 'Dry-run external integration response. Configure provider and disable Dry Run for live calls.',
      payload: payload,
      context: context
    };
  }

  function getProviderConfig_(providerKey) {
    const providers = REOS.Database.getAll(PROVIDERS_SHEET);
    return providers.filter(function (row) { return String(row.Provider || '').toLowerCase() === String(providerKey || '').toLowerCase(); })[0] || null;
  }

  function validateOperation_(providerKey, operation) {
    const provider = PROVIDERS.filter(function (item) { return item.key === providerKey; })[0];
    if (!provider) throw new Error('Provider not registered: ' + providerKey);
    if (provider.operations.indexOf(operation) === -1) throw new Error('Unsupported operation for ' + providerKey + ': ' + operation);
  }

  function logRequest_(provider, operation, status, context, request, response, error) {
    return REOS.Database.insert(REQUESTS_SHEET, {
      Provider: provider,
      Operation: operation,
      Status: status,
      'Record Type': context.recordType || '',
      'Record ID': context.recordId || '',
      'Request JSON': REOS.toJson_(request || {}),
      'Response JSON': response || '',
      Error: error || '',
      'Started At': new Date(),
      'Finished At': '',
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: REQUEST_ID_FIELD, idPrefix: 'EXTR' });
  }

  function latest_(records, dateField, limit) {
    return (records || []).slice().sort(function (a, b) {
      return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0);
    }).slice(0, limit || 100);
  }

  return {
    ensureSheets: ensureSheets,
    initialize: initialize,
    seedProviders: seedProviders,
    getProviders: getProviders,
    updateProvider: updateProvider,
    getRequests: getRequests,
    getDashboard: getDashboard,
    invoke: invoke,
    propertyLookup: propertyLookup,
    skipTraceLead: skipTraceLead,
    searchDistressedProperties: searchDistressedProperties,
    geocodeAddress: geocodeAddress,
    mapExternalProperty: mapExternalProperty,
    mapExternalLead: mapExternalLead
  };
})();

function reosExternalInitialize() { return REOS.ExternalIntegrations.initialize(); }
function reosExternalGetDashboard() { return REOS.ExternalIntegrations.getDashboard(); }
function reosExternalGetProviders() { return REOS.ExternalIntegrations.getProviders(); }
function reosExternalUpdateProvider(providerId, changes) { return REOS.ExternalIntegrations.updateProvider(providerId, changes || {}); }
function reosExternalGetRequests(options) { return REOS.ExternalIntegrations.getRequests(options || {}); }
function reosExternalInvoke(providerKey, operation, payload, context) { return REOS.ExternalIntegrations.invoke(providerKey, operation, payload || {}, context || {}); }
function reosExternalPropertyLookup(address, options) { return REOS.ExternalIntegrations.propertyLookup(address, options || {}); }
function reosExternalSkipTraceLead(leadId, options) { return REOS.ExternalIntegrations.skipTraceLead(leadId, options || {}); }
function reosExternalSearchDistressedProperties(criteria) { return REOS.ExternalIntegrations.searchDistressedProperties(criteria || {}); }
function reosExternalGeocodeAddress(address) { return REOS.ExternalIntegrations.geocodeAddress(address); }
function showExternalIntegrations() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('ExternalIntegrations').setTitle('REOS External Integrations').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS External Integrations');
}
