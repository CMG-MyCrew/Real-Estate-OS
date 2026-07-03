/** REOS Enterprise v3.0 - RingCentral Integration Adapter */
var REOS = REOS || {};

REOS.RingCentral = (function () {
  function execute(action, options) {
    if (action === 'sendSms') return sendSms(options);
    if (action === 'logCall') return logCall(options);
    throw new Error('Unknown RingCentral action: ' + action);
  }

  function sendSms(options) {
    const baseUrl = REOS.Integrations.getCredential('RINGCENTRAL_BASE_URL') || 'https://platform.ringcentral.com/restapi/v1.0';
    const token = REOS.Integrations.getCredential('RINGCENTRAL_ACCESS_TOKEN');
    if (!token) throw new Error('Missing RingCentral access token.');
    const res = UrlFetchApp.fetch(baseUrl + '/account/~/extension/~/sms', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ from: { phoneNumber: options.from }, to: [{ phoneNumber: options.to }], text: options.body || '' }),
      muteHttpExceptions: true
    });
    return { statusCode: res.getResponseCode(), body: res.getContentText() };
  }

  function logCall(options) {
    return REOS.Activities.create({
      'Client ID': options.clientId || '',
      'Activity Type': 'Call',
      Subject: options.subject || 'RingCentral call',
      Notes: options.notes || '',
      Outcome: options.outcome || ''
    });
  }

  return { execute: execute, sendSms: sendSms, logCall: logCall };
})();
