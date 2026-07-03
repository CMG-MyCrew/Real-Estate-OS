/** REOS Enterprise v3.0 - QuickBooks Integration Adapter */
var REOS = REOS || {};

REOS.QuickBooks = (function () {
  function execute(action, options) {
    if (action === 'createCustomer') return createCustomer(options);
    if (action === 'createInvoice') return createInvoice(options);
    if (action === 'syncFinance') return syncFinance(options);
    throw new Error('Unknown QuickBooks action: ' + action);
  }

  function api_(path, method, payload) {
    const realmId = REOS.Integrations.getCredential('QBO_REALM_ID');
    const token = REOS.Integrations.getCredential('QBO_ACCESS_TOKEN');
    if (!realmId || !token) throw new Error('Missing QuickBooks credentials.');
    const url = 'https://quickbooks.api.intuit.com/v3/company/' + realmId + '/' + path;
    const res = UrlFetchApp.fetch(url, {
      method: method || 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      payload: payload ? JSON.stringify(payload) : undefined,
      muteHttpExceptions: true
    });
    return { statusCode: res.getResponseCode(), body: JSON.parse(res.getContentText() || '{}') };
  }

  function createCustomer(options) {
    return api_('customer', 'post', { DisplayName: options.displayName, PrimaryEmailAddr: { Address: options.email || '' } });
  }

  function createInvoice(options) {
    return api_('invoice', 'post', options.invoice || {});
  }

  function syncFinance(options) {
    const entries = REOS.Finance.listActive().slice(-(options.limit || 50));
    return { queued: entries.length, entries: entries };
  }

  function handleWebhook(eventType, payload) {
    return { received: true, eventType: eventType, payload: payload };
  }

  return { execute: execute, createCustomer: createCustomer, createInvoice: createInvoice, syncFinance: syncFinance, handleWebhook: handleWebhook };
})();
