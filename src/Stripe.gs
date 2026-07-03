/** REOS Enterprise v3.0 - Stripe Integration Adapter */
var REOS = REOS || {};

REOS.Stripe = (function () {
  function execute(action, options) {
    if (action === 'createPaymentLink') return createPaymentLink(options);
    if (action === 'createCustomer') return createCustomer(options);
    throw new Error('Unknown Stripe action: ' + action);
  }

  function api_(path, payload) {
    const key = REOS.Integrations.getCredential('STRIPE_SECRET_KEY');
    if (!key) throw new Error('Missing Stripe secret key.');
    const res = UrlFetchApp.fetch('https://api.stripe.com/v1/' + path, {
      method: 'post',
      headers: { Authorization: 'Bearer ' + key },
      payload: payload || {},
      muteHttpExceptions: true
    });
    return { statusCode: res.getResponseCode(), body: JSON.parse(res.getContentText() || '{}') };
  }

  function createCustomer(options) {
    return api_('customers', { email: options.email, name: options.name, phone: options.phone || '' });
  }

  function createPaymentLink(options) {
    return api_('payment_links', {
      'line_items[0][price]': options.priceId,
      'line_items[0][quantity]': options.quantity || 1,
      'metadata[recordId]': options.recordId || '',
      'metadata[recordType]': options.recordType || ''
    });
  }

  function handleWebhook(eventType, payload) {
    if (eventType === 'checkout.session.completed') {
      return REOS.Finance.create({
        Date: new Date(),
        Type: 'Income',
        Category: 'Stripe Payment',
        Amount: payload.amount_total ? Number(payload.amount_total) / 100 : 0,
        'Payment Method': 'Stripe',
        'Record ID': payload.metadata && payload.metadata.recordId || '',
        'Record Type': payload.metadata && payload.metadata.recordType || '',
        Notes: JSON.stringify(payload)
      });
    }
    return { ignored: true, eventType: eventType };
  }

  return { execute: execute, createCustomer: createCustomer, createPaymentLink: createPaymentLink, handleWebhook: handleWebhook };
})();
