/** REOS Enterprise v3.0 - DocuSign Integration Adapter */
var REOS = REOS || {};

REOS.DocuSign = (function () {
  function execute(action, options) {
    if (action === 'createEnvelope') return createEnvelope(options);
    if (action === 'getEnvelopeStatus') return getEnvelopeStatus(options);
    throw new Error('Unknown DocuSign action: ' + action);
  }

  function api_(path, method, payload) {
    const baseUrl = REOS.Integrations.getCredential('DOCUSIGN_BASE_URL');
    const token = REOS.Integrations.getCredential('DOCUSIGN_ACCESS_TOKEN');
    if (!baseUrl || !token) throw new Error('Missing DocuSign credentials.');
    const res = UrlFetchApp.fetch(baseUrl.replace(/\/$/, '') + '/' + path, {
      method: method || 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: payload ? JSON.stringify(payload) : undefined,
      muteHttpExceptions: true
    });
    return { statusCode: res.getResponseCode(), body: JSON.parse(res.getContentText() || '{}') };
  }

  function createEnvelope(options) {
    const result = api_('envelopes', 'post', options.envelope || {});
    if (options.signatureRequestId && result.body && result.body.envelopeId) {
      REOS.Esign.markSent(options.signatureRequestId, result.body.envelopeId);
    }
    return result;
  }

  function getEnvelopeStatus(options) {
    return api_('envelopes/' + options.envelopeId, 'get');
  }

  return { execute: execute, createEnvelope: createEnvelope, getEnvelopeStatus: getEnvelopeStatus };
})();
