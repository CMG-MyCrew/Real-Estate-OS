/** REOS Enterprise v3.0 - Twilio Integration Adapter */
var REOS = REOS || {};

REOS.Twilio = (function () {
  function execute(action, options) {
    if (action === 'sendSms') return sendSms(options);
    if (action === 'sendWhatsApp') return sendWhatsApp(options);
    throw new Error('Unknown Twilio action: ' + action);
  }

  function sendSms(options) {
    options = options || {};
    const sid = REOS.Integrations.getCredential('TWILIO_ACCOUNT_SID');
    const token = REOS.Integrations.getCredential('TWILIO_AUTH_TOKEN');
    const from = options.from || REOS.Integrations.getCredential('TWILIO_FROM_NUMBER');
    if (!sid || !token || !from) throw new Error('Missing Twilio credentials.');
    const url = 'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json';
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + token) },
      payload: { To: options.to, From: from, Body: options.body || '' },
      muteHttpExceptions: true
    });
    return { statusCode: res.getResponseCode(), body: res.getContentText() };
  }

  function sendWhatsApp(options) {
    options = options || {};
    options.from = options.from || 'whatsapp:' + REOS.Integrations.getCredential('TWILIO_WHATSAPP_FROM');
    options.to = String(options.to || '').indexOf('whatsapp:') === 0 ? options.to : 'whatsapp:' + options.to;
    return sendSms(options);
  }

  return { execute: execute, sendSms: sendSms, sendWhatsApp: sendWhatsApp };
})();
