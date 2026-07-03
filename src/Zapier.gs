/** REOS Enterprise v3.0 - Zapier / Make Integration Adapter */
var REOS = REOS || {};

REOS.Zapier = (function () {
  function execute(action, options) {
    if (action === 'sendHook') return sendHook(options);
    if (action === 'leadCreated') return leadCreated(options);
    throw new Error('Unknown Zapier action: ' + action);
  }

  function sendHook(options) {
    options = options || {};
    const url = options.url || REOS.Integrations.getCredential('ZAPIER_WEBHOOK_URL');
    if (!url) throw new Error('Missing Zapier webhook URL.');
    return REOS.Webhooks.send(url, options.payload || {}, options.headers || {});
  }

  function leadCreated(options) {
    return sendHook({ payload: { event: 'lead.created', lead: options.lead || {} } });
  }

  return { execute: execute, sendHook: sendHook, leadCreated: leadCreated };
})();
