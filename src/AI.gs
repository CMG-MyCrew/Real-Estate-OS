/**
 * REOS Enterprise v3.0 - AI Core Framework
 *
 * Sprint 1 foundation for provider-agnostic AI services, prompt building,
 * response parsing, usage tracking, configuration, and audit logging.
 */

var REOS = REOS || {};

REOS.AI = (function () {
  const CONFIG_PREFIX = 'REOS_AI_';
  const LOG_SHEET = 'AI_REQUESTS';
  const LOG_ID_FIELD = 'AI Request ID';

  const LOG_HEADERS = [
    'AI Request ID', 'Request Type', 'Provider', 'Model', 'Status', 'Prompt Tokens',
    'Completion Tokens', 'Total Tokens', 'Estimated Cost', 'Record Type', 'Record ID',
    'Prompt Preview', 'Response Preview', 'Error', 'User', 'Started At', 'Finished At',
    'Created At', 'Updated At'
  ];

  const DEFAULT_CONFIG = {
    provider: 'stub',
    model: 'reos-local-rules',
    temperature: 0.2,
    maxTokens: 1200,
    enabled: false
  };

  const PROVIDERS = {
    stub: { name: 'Stub / Rules Engine', invoke: invokeStub_ },
    openai: { name: 'OpenAI', invoke: invokeOpenAI_ },
    gemini: { name: 'Google Gemini', invoke: invokeNotImplemented_ },
    anthropic: { name: 'Anthropic Claude', invoke: invokeNotImplemented_ }
  };

  const PROMPTS = {
    leadQualification: {
      version: '1.0.0',
      system: [
        'You are REOS Enterprise, a disciplined real estate acquisition analyst.',
        'Analyze distressed and off-market real estate leads for investment potential.',
        'Return concise structured JSON only. Do not invent missing facts.',
        'When data is missing, lower confidence and explain what is needed.'
      ].join('\n'),
      userTemplate: [
        'Analyze this acquisition lead and return JSON with:',
        'score, confidence, motivationTags, distressSignals, riskFlags, nextBestAction, summary, recommendedStrategy.',
        '',
        'Lead JSON:',
        '{{leadJson}}'
      ].join('\n')
    },
    sellerPrep: {
      version: '1.0.0',
      system: 'You are a real estate acquisition assistant preparing a seller conversation.',
      userTemplate: 'Create seller call prep from this lead JSON:\n{{leadJson}}'
    },
    offerAnalysis: {
      version: '1.0.0',
      system: 'You are a conservative real estate investment underwriting assistant.',
      userTemplate: 'Review this lead and produce offer analysis JSON:\n{{leadJson}}'
    }
  };

  function initialize() {
    ensureSheets();
    seedDefaultConfig();
    REOS.Logger.info('AI core initialized', { provider: getConfig().provider });
    return { ok: true, module: 'ai' };
  }

  function ensureSheets() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(LOG_SHEET);
    if (!sheet) sheet = ss.insertSheet(LOG_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold').setWrap(true);
      sheet.autoResizeColumns(1, LOG_HEADERS.length);
    }
    return sheet;
  }

  function seedDefaultConfig() {
    const props = PropertiesService.getScriptProperties();
    Object.keys(DEFAULT_CONFIG).forEach(function (key) {
      const propKey = CONFIG_PREFIX + key.toUpperCase();
      if (props.getProperty(propKey) === null) props.setProperty(propKey, String(DEFAULT_CONFIG[key]));
    });
    return getConfig();
  }

  function getConfig() {
    const props = PropertiesService.getScriptProperties();
    return {
      provider: props.getProperty(CONFIG_PREFIX + 'PROVIDER') || DEFAULT_CONFIG.provider,
      model: props.getProperty(CONFIG_PREFIX + 'MODEL') || DEFAULT_CONFIG.model,
      temperature: Number(props.getProperty(CONFIG_PREFIX + 'TEMPERATURE') || DEFAULT_CONFIG.temperature),
      maxTokens: Number(props.getProperty(CONFIG_PREFIX + 'MAXTOKENS') || DEFAULT_CONFIG.maxTokens),
      enabled: String(props.getProperty(CONFIG_PREFIX + 'ENABLED') || DEFAULT_CONFIG.enabled) === 'true',
      hasOpenAIKey: !!props.getProperty(CONFIG_PREFIX + 'OPENAI_API_KEY')
    };
  }

  function updateConfig(config) {
    REOS.Security.requireAdmin();
    config = config || {};
    const props = PropertiesService.getScriptProperties();
    if (config.provider !== undefined) props.setProperty(CONFIG_PREFIX + 'PROVIDER', String(config.provider));
    if (config.model !== undefined) props.setProperty(CONFIG_PREFIX + 'MODEL', String(config.model));
    if (config.temperature !== undefined) props.setProperty(CONFIG_PREFIX + 'TEMPERATURE', String(config.temperature));
    if (config.maxTokens !== undefined) props.setProperty(CONFIG_PREFIX + 'MAXTOKENS', String(config.maxTokens));
    if (config.enabled !== undefined) props.setProperty(CONFIG_PREFIX + 'ENABLED', String(config.enabled === true));
    if (config.openaiApiKey) props.setProperty(CONFIG_PREFIX + 'OPENAI_API_KEY', String(config.openaiApiKey));
    REOS.Logger.audit('AI config updated', { provider: config.provider, model: config.model, enabled: config.enabled });
    return getConfig();
  }

  function getPromptTemplate(key) {
    const template = PROMPTS[key];
    if (!template) throw new Error('Unknown AI prompt template: ' + key);
    return template;
  }

  function buildPrompt(templateKey, data) {
    const template = getPromptTemplate(templateKey);
    data = data || {};
    let user = template.userTemplate;
    Object.keys(data).forEach(function (key) {
      user = user.replace(new RegExp('{{' + key + '}}', 'g'), String(data[key] || ''));
    });
    return { templateKey: templateKey, version: template.version, system: template.system, user: user };
  }

  function complete(request) {
    REOS.Security.requirePermission('ai:use');
    ensureSheets();
    request = request || {};
    const config = Object.assign({}, getConfig(), request.config || {});
    const provider = PROVIDERS[config.provider] || PROVIDERS.stub;
    const startedAt = new Date();
    let logId = null;

    try {
      const response = provider.invoke(request, config);
      const parsed = parseResponse(response.text || response.content || '');
      const usage = response.usage || estimateUsage_(request.prompt, response.text || '');
      const finishedAt = new Date();
      logId = logRequest_({
        requestType: request.requestType || 'completion', provider: config.provider, model: config.model,
        status: 'Success', usage: usage, estimatedCost: estimateCost_(config.provider, config.model, usage),
        recordType: request.recordType || '', recordId: request.recordId || '',
        promptPreview: preview_(request.prompt ? request.prompt.user || request.prompt : ''),
        responsePreview: preview_(response.text || ''), error: '', startedAt: startedAt, finishedAt: finishedAt
      });
      return { ok: true, logId: logId, provider: config.provider, model: config.model, text: response.text || '', parsed: parsed, usage: usage };
    } catch (error) {
      const finishedAt = new Date();
      logId = logRequest_({
        requestType: request.requestType || 'completion', provider: config.provider, model: config.model,
        status: 'Error', usage: {}, estimatedCost: 0, recordType: request.recordType || '', recordId: request.recordId || '',
        promptPreview: preview_(request.prompt ? request.prompt.user || request.prompt : ''), responsePreview: '',
        error: error.message, startedAt: startedAt, finishedAt: finishedAt
      });
      REOS.handleError_('AI complete', error);
      throw error;
    }
  }

  function qualifyLead(leadOrId) {
    REOS.Security.requirePermission('leads:read');
    const lead = typeof leadOrId === 'string' ? REOS.Acquisitions.getLead(leadOrId) : leadOrId;
    if (!lead) throw new Error('Lead not found for AI qualification.');
    const prompt = buildPrompt('leadQualification', { leadJson: REOS.toJson_(lead) });
    return complete({ requestType: 'leadQualification', recordType: 'Lead', recordId: lead['Lead ID'] || '', prompt: prompt });
  }

  function parseResponse(text) {
    text = String(text || '').trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch (ignore) {}
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (ignore2) {}
    }
    return { raw: text };
  }

  function invokeStub_(request, config) {
    if (request.requestType === 'leadQualification') {
      const lead = extractLeadFromPrompt_(request.prompt);
      const result = rulesBasedLeadQualification_(lead);
      return { text: REOS.toJson_(result), usage: estimateUsage_(request.prompt, REOS.toJson_(result)) };
    }
    const text = REOS.toJson_({ summary: 'AI provider is configured for stub mode.', nextBestAction: 'Configure provider before production AI calls.' });
    return { text: text, usage: estimateUsage_(request.prompt, text) };
  }

  function invokeOpenAI_(request, config) {
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty(CONFIG_PREFIX + 'OPENAI_API_KEY');
    if (!apiKey) throw new Error('Missing REOS_AI_OPENAI_API_KEY script property.');
    if (!config.enabled) throw new Error('AI external provider calls are disabled. Set REOS_AI_ENABLED to true.');

    const payload = {
      model: config.model || 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: request.prompt.system || '' },
        { role: 'user', content: request.prompt.user || String(request.prompt || '') }
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens
    };

    const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + apiKey },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code < 200 || code >= 300) throw new Error('OpenAI request failed: ' + code + ' ' + body);
    const json = JSON.parse(body);
    return { text: json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : '', usage: json.usage || {} };
  }

  function invokeNotImplemented_(request, config) {
    throw new Error('AI provider not implemented yet: ' + config.provider);
  }

  function extractLeadFromPrompt_(prompt) {
    const text = prompt && prompt.user ? prompt.user : String(prompt || '');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return JSON.parse(match[0]); } catch (error) { return {}; }
  }

  function rulesBasedLeadQualification_(lead) {
    let score = 0;
    const tags = [];
    const risks = [];
    const signals = [];
    const distress = String(lead['Distress Indicator'] || '').toLowerCase();
    const estimatedValue = Number(lead['Estimated Value'] || 0);
    const askingPrice = Number(lead['Asking Price'] || 0);

    if (distress.indexOf('probate') !== -1) { score += 20; tags.push('Probate motivation'); signals.push('Probate'); }
    if (distress.indexOf('tax') !== -1) { score += 20; tags.push('Tax pressure'); signals.push('Tax delinquent'); }
    if (distress.indexOf('vacant') !== -1) { score += 15; tags.push('Vacancy pressure'); signals.push('Vacant'); }
    if (distress.indexOf('code') !== -1) { score += 15; tags.push('Code violation pressure'); signals.push('Code violation'); }
    if (distress.indexOf('pre-foreclosure') !== -1) { score += 25; tags.push('Foreclosure urgency'); signals.push('Pre-foreclosure'); }
    if (distress.indexOf('absentee') !== -1) { score += 10; tags.push('Absentee owner'); signals.push('Absentee owner'); }
    if (lead['Owner Phone']) score += 5;
    if (lead['Owner Email']) score += 3;
    if (estimatedValue > 0 && askingPrice > 0 && askingPrice <= estimatedValue * 0.7) { score += 25; tags.push('Potential equity spread'); }
    if (!lead['Owner Phone']) risks.push('Missing owner phone');
    if (!estimatedValue) risks.push('Missing estimated value');
    if (!askingPrice) risks.push('Missing asking price');

    score = Math.min(100, score);
    const confidence = Math.max(35, Math.min(95, 50 + (lead['Owner Phone'] ? 10 : 0) + (estimatedValue ? 10 : 0) + (askingPrice ? 10 : 0) + (distress ? 10 : 0)));
    const nextBestAction = score >= 70 ? 'Call seller and prepare offer range' : score >= 45 ? 'Skip trace and schedule follow-up' : 'Collect missing data and monitor';

    return {
      score: score, confidence: confidence, motivationTags: tags, distressSignals: signals,
      riskFlags: risks, nextBestAction: nextBestAction,
      recommendedStrategy: score >= 70 ? 'High-touch acquisition follow-up' : score >= 45 ? 'Nurture and verify distress' : 'Research before outreach',
      summary: 'Rules-based AI foundation assessment generated from available lead fields.'
    };
  }

  function estimateUsage_(prompt, responseText) {
    const promptText = prompt && prompt.user ? prompt.system + '\n' + prompt.user : String(prompt || '');
    const promptTokens = Math.ceil(promptText.length / 4);
    const completionTokens = Math.ceil(String(responseText || '').length / 4);
    return { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens };
  }

  function estimateCost_(provider, model, usage) {
    if (provider === 'stub') return 0;
    return 0;
  }

  function logRequest_(entry) {
    ensureSheets();
    const record = {
      'Request Type': entry.requestType,
      Provider: entry.provider,
      Model: entry.model,
      Status: entry.status,
      'Prompt Tokens': entry.usage.prompt_tokens || 0,
      'Completion Tokens': entry.usage.completion_tokens || 0,
      'Total Tokens': entry.usage.total_tokens || 0,
      'Estimated Cost': entry.estimatedCost || 0,
      'Record Type': entry.recordType,
      'Record ID': entry.recordId,
      'Prompt Preview': entry.promptPreview,
      'Response Preview': entry.responsePreview,
      Error: entry.error,
      User: REOS.Security.getCurrentUserEmail(),
      'Started At': entry.startedAt,
      'Finished At': entry.finishedAt
    };
    const created = REOS.Database.insert(LOG_SHEET, record, { idField: LOG_ID_FIELD, idPrefix: 'AI' });
    REOS.Logger.info('AI request logged', { requestId: created[LOG_ID_FIELD], type: entry.requestType, status: entry.status });
    return created[LOG_ID_FIELD];
  }

  function preview_(value) { return String(value || '').replace(/\s+/g, ' ').slice(0, 500); }

  function getRequestLogs(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    let rows = REOS.Database.getAll(LOG_SHEET);
    if (options.status) rows = rows.filter(function (row) { return String(row.Status || '') === String(options.status); });
    return rows.slice().sort(function (a, b) {
      return (new Date(b['Started At'] || 0).getTime() || 0) - (new Date(a['Started At'] || 0).getTime() || 0);
    }).slice(0, options.limit || 100);
  }

  return {
    LOG_SHEET: LOG_SHEET, PROVIDERS: PROVIDERS, PROMPTS: PROMPTS,
    initialize: initialize, ensureSheets: ensureSheets, seedDefaultConfig: seedDefaultConfig,
    getConfig: getConfig, updateConfig: updateConfig, getPromptTemplate: getPromptTemplate,
    buildPrompt: buildPrompt, complete: complete, qualifyLead: qualifyLead,
    parseResponse: parseResponse, getRequestLogs: getRequestLogs
  };
})();

function reosInitializeAI() { return REOS.AI.initialize(); }
function reosAIGetConfig() { return REOS.AI.getConfig(); }
function reosAIUpdateConfig(config) { return REOS.AI.updateConfig(config || {}); }
function reosAIBuildPrompt(templateKey, data) { return REOS.AI.buildPrompt(templateKey, data || {}); }
function reosAIQualifyLead(leadOrId) { return REOS.AI.qualifyLead(leadOrId); }
function reosAIGetRequestLogs(options) { return REOS.AI.getRequestLogs(options || {}); }
