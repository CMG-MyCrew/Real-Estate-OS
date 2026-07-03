/** REOS Enterprise v3.0 - Public API Framework */
var REOS = REOS || {};

REOS.API = (function () {
  function handle(method, resource, payload) {
    authorize_(payload && payload.apiKey);
    method = String(method || 'GET').toUpperCase();
    resource = String(resource || '').replace(/^\//, '').toLowerCase();

    if (method === 'GET') return get_(resource, payload || {});
    if (method === 'POST') return post_(resource, payload || {});
    throw new Error('Unsupported API method: ' + method);
  }

  function get_(resource, payload) {
    if (resource === 'clients') return REOS.CRM.listContacts();
    if (resource === 'leads') return REOS.CRM.listLeads();
    if (resource === 'transactions') return REOS.Transactions.listActive();
    if (resource === 'properties') return REOS.Properties.listActive();
    if (resource === 'rentals') return REOS.Rentals.listActive();
    if (resource === 'tasks') return REOS.Tasks.listActive();
    if (resource === 'documents') return REOS.Documents.search(payload.query || '');
    if (resource === 'dashboard') return REOS.Dashboard.getExecutiveDashboard();
    throw new Error('Unknown API resource: ' + resource);
  }

  function post_(resource, payload) {
    if (resource === 'webhooks') return REOS.Webhooks.receive(payload.source, payload.eventType, payload.payload || {});
    if (resource === 'automation') return REOS.Automation.dispatch(payload.eventName, payload.moduleName, payload.payload || {});
    if (resource === 'tasks') return REOS.Tasks.create(payload.record || {});
    if (resource === 'leads') return REOS.CRM.createLead(payload.record || {});
    throw new Error('Unknown API resource: ' + resource);
  }

  function authorize_(apiKey) {
    const expected = REOS.getProperty_('REOS_API_KEY');
    if (expected && apiKey !== expected) throw new Error('Invalid API key.');
    return true;
  }

  return { handle: handle };
})();

function apiHandle(method, resource, payload) { return REOS.API.handle(method, resource, payload || {}); }
