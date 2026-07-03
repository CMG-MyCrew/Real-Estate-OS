/**
 * REOS Enterprise v3.0 - AI Assistant Core Framework
 *
 * Provider-ready AI layer for CRM insights, property analysis, document summaries,
 * email drafting, and operational recommendations.
 *
 * Set script properties before use:
 * - REOS_AI_PROVIDER=openai
 * - REOS_AI_API_KEY=your_api_key
 * - REOS_AI_MODEL=gpt-4o-mini or preferred model
 */

var REOS = REOS || {};

REOS.AI = (function () {
  const LOG_SHEET = 'AI_LOG';
  const ID_FIELD = 'AI Request ID';

  const HEADERS = [
    'AI Request ID', 'Timestamp', 'User', 'Feature', 'Prompt', 'Context JSON',
    'Response', 'Status', 'Error', 'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(LOG_SHEET);
    if (!sheet) sheet = ss.insertSheet(LOG_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function ask(feature, prompt, context) {
    REOS.Security.requirePermission('reports:read');
    ensureSheet();

    const request = REOS.Database.insert(LOG_SHEET, {
      Timestamp: new Date(),
      User: REOS.Security.getCurrentUserEmail(),
      Feature: feature || 'General',
      Prompt: prompt || '',
      'Context JSON': JSON.stringify(context || {}),
      Status: 'Started'
    }, { idField: ID_FIELD, idPrefix: 'AI' });

    try {
      const response = callProvider_(buildSystemPrompt_(), prompt || '', context || {});
      const updated = REOS.Database.update(LOG_SHEET, ID_FIELD, request[ID_FIELD], {
        Response: response,
        Status: 'Completed'
      });
      REOS.Logger.audit('AI request completed', { requestId: request[ID_FIELD], feature: feature });
      return updated;
    } catch (error) {
      REOS.Database.update(LOG_SHEET, ID_FIELD, request[ID_FIELD], {
        Status: 'Error',
        Error: error.message
      });
      REOS.Logger.error('AI request failed', error, { requestId: request[ID_FIELD], feature: feature });
      throw error;
    }
  }

  function callProvider_(systemPrompt, userPrompt, context) {
    const provider = String(REOS.getProperty_('REOS_AI_PROVIDER') || '').toLowerCase();
    if (!provider) {
      return offlineResponse_(userPrompt, context);
    }
    if (provider === 'openai') return callOpenAI_(systemPrompt, userPrompt, context);
    throw new Error('Unsupported AI provider: ' + provider);
  }

  function callOpenAI_(systemPrompt, userPrompt, context) {
    const apiKey = REOS.getProperty_('REOS_AI_API_KEY');
    if (!apiKey) throw new Error('Missing REOS_AI_API_KEY script property.');

    const model = REOS.getProperty_('REOS_AI_MODEL') || 'gpt-4o-mini';
    const payload = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt + '\n\nContext JSON:\n' + JSON.stringify(context || {}, null, 2) }
      ],
      temperature: 0.2
    };

    const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const body = res.getContentText();
    if (code < 200 || code >= 300) throw new Error('OpenAI API error ' + code + ': ' + body);

    const json = JSON.parse(body);
    return json.choices && json.choices.length ? json.choices[0].message.content : '';
  }

  function offlineResponse_(prompt, context) {
    return [
      'AI provider is not configured yet.',
      '',
      'Prompt received:',
      prompt || '',
      '',
      'Available context keys: ' + Object.keys(context || {}).join(', '),
      '',
      'Set REOS_AI_PROVIDER, REOS_AI_API_KEY, and REOS_AI_MODEL in Script Properties to enable live AI responses.'
    ].join('\n');
  }

  function buildSystemPrompt_() {
    return [
      'You are REOS AI Assistant, an internal real estate operating assistant.',
      'Use the provided REOS context only. Do not invent facts.',
      'Prioritize practical next actions, risks, deadlines, and financial impact.',
      'Keep recommendations concise, professional, and compliant.'
    ].join(' ');
  }

  return {
    ensureSheet: ensureSheet,
    ask: ask
  };
})();

function aiAsk(feature, prompt, context) {
  return REOS.AI.ask(feature, prompt, context || {});
}
