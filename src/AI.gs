/**
 * REOS Enterprise v3.0 - AI Core + Lead Qualification + Next Best Action
 *
 * Sprint 1: provider abstraction, prompt building, response parsing, usage tracking,
 * configuration, and audit logging.
 * Sprint 2: rules-first lead qualification engine.
 * Sprint 3: next-best-action engine with recommended outreach actions,
 * reasoning, priority, due dates, and optional task creation.
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

  const DEFAULT_CONFIG = { provider: 'stub', model: 'reos-local-rules', temperature: 0.2, maxTokens: 1200, enabled: false };

  const NEXT_ACTIONS = {
    CALL_NOW: 'Call now',
    SEND_TEXT: 'Send text',
    SEND_EMAIL: 'Send email',
    SEND_DIRECT_MAIL: 'Send direct mail',
    SKIP_TRACE: 'Skip trace',
    SCHEDULE_INSPECTION: 'Schedule inspection',
    MAKE_OFFER: 'Make offer',
    FOLLOW_UP: 'Follow up',
    RESEARCH: 'Research',
    HOLD: 'Hold / monitor'
  };

  const PROVIDERS = {
    stub: { name: 'Stub / Rules Engine', invoke: invokeStub_ },
    openai: { name: 'OpenAI', invoke: invokeOpenAI_ },
    gemini: { name: 'Google Gemini', invoke: invokeNotImplemented_ },
    anthropic: { name: 'Anthropic Claude', invoke: invokeNotImplemented_ }
  };

  const PROMPTS = {
    leadQualification: {
      version: '2.0.0',
      system: [
        'You are REOS Enterprise, a disciplined real estate acquisition analyst.',
        'Analyze distressed and off-market real estate leads for investment potential.',
        'Return concise structured JSON only. Do not invent missing facts.',
        'When data is missing, lower confidence and explain what is needed.'
      ].join('\n'),
      userTemplate: [
        'Analyze this acquisition lead and return JSON with:',
        'score, confidence, grade, motivationTags, distressSignals, investmentSignals,',
        'riskFlags, nextBestAction, recommendedStrategy, suggestedFollowUpDays, summary.',
        '',
        'Lead JSON:',
        '{{leadJson}}'
      ].join('\n')
    },
    nextBestAction: {
      version: '1.0.0',
      system: [
        'You are REOS Enterprise, a real estate acquisitions workflow strategist.',
        'Recommend the single best next action and a short ranked action plan.',
        'Return structured JSON only. Do not invent missing facts.'
      ].join('\n'),
      userTemplate: [
        'Lead JSON:',
        '{{leadJson}}',
        '',
        'Qualification JSON:',
        '{{qualificationJson}}',
        '',
        'Return JSON with: primaryAction, priority, dueInDays, dueDate, reasoning, actionPlan, taskTitle, taskNotes.'
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

    try {
      const response = provider.invoke(request, config);
      const parsed = parseResponse(response.text || response.content || '');
      const usage = response.usage || estimateUsage_(request.prompt, response.text || '');
      const logId = logRequest_({
        requestType: request.requestType || 'completion', provider: config.provider, model: config.model,
        status: 'Success', usage: usage, estimatedCost: estimateCost_(config.provider, config.model, usage),
        recordType: request.recordType || '', recordId: request.recordId || '',
        promptPreview: preview_(request.prompt ? request.prompt.user || request.prompt : ''),
        responsePreview: preview_(response.text || ''), error: '', startedAt: startedAt, finishedAt: new Date()
      });
      return { ok: true, logId: logId, provider: config.provider, model: config.model, text: response.text || '', parsed: parsed, usage: usage };
    } catch (error) {
      logRequest_({
        requestType: request.requestType || 'completion', provider: config.provider, model: config.model,
        status: 'Error', usage: {}, estimatedCost: 0, recordType: request.recordType || '', recordId: request.recordId || '',
        promptPreview: preview_(request.prompt ? request.prompt.user || request.prompt : ''), responsePreview: '',
        error: error.message, startedAt: startedAt, finishedAt: new Date()
      });
      REOS.handleError_('AI complete', error);
      throw error;
    }
  }

  function qualifyLead(leadOrId) {
    REOS.Security.requirePermission('ai:use');
    REOS.Security.requirePermission('leads:read');
    const lead = resolveLead_(leadOrId);
    const config = getConfig();

    if (config.provider === 'stub' || !config.enabled) {
      const result = qualificationEngine_(lead);
      const text = REOS.toJson_(result);
      const prompt = buildPrompt('leadQualification', { leadJson: REOS.toJson_(lead) });
      const logId = logRequest_({
        requestType: 'leadQualification', provider: 'stub', model: 'reos-local-rules-v2', status: 'Success',
        usage: estimateUsage_(prompt, text), estimatedCost: 0, recordType: 'Lead', recordId: lead['Lead ID'] || '',
        promptPreview: preview_(prompt.user), responsePreview: preview_(text), error: '', startedAt: new Date(), finishedAt: new Date()
      });
      return { ok: true, logId: logId, provider: 'stub', model: 'reos-local-rules-v2', parsed: result, text: text };
    }

    const prompt = buildPrompt('leadQualification', { leadJson: REOS.toJson_(lead) });
    return complete({ requestType: 'leadQualification', recordType: 'Lead', recordId: lead['Lead ID'] || '', prompt: prompt });
  }

  function qualifyLeadRulesOnly(leadOrId) {
    REOS.Security.requirePermission('leads:read');
    const lead = resolveLead_(leadOrId);
    return { ok: true, parsed: qualificationEngine_(lead) };
  }

  function qualifyLeadBatch(options) {
    REOS.Security.requirePermission('ai:use');
    options = options || {};
    const leads = REOS.Acquisitions.listLeads({ limit: options.limit || 50 });
    return leads.map(function (lead) {
      const analysis = qualificationEngine_(lead);
      const action = nextBestActionEngine_(lead, analysis, {});
      return {
        'Lead ID': lead['Lead ID'],
        'Property Address': lead['Property Address'],
        'Owner Name': lead['Owner Name'],
        score: analysis.score,
        grade: analysis.grade,
        confidence: analysis.confidence,
        primaryAction: action.primaryAction,
        priority: action.priority,
        dueDate: action.dueDate,
        nextBestAction: action.nextBestAction,
        riskFlags: analysis.riskFlags,
        motivationTags: analysis.motivationTags
      };
    });
  }

  function recommendNextBestAction(leadOrId, options) {
    REOS.Security.requirePermission('ai:use');
    REOS.Security.requirePermission('leads:read');
    const lead = resolveLead_(leadOrId);
    const qualification = qualificationEngine_(lead);
    const result = nextBestActionEngine_(lead, qualification, options || {});
    const prompt = buildPrompt('nextBestAction', { leadJson: REOS.toJson_(lead), qualificationJson: REOS.toJson_(qualification) });
    const text = REOS.toJson_(result);
    const logId = logRequest_({
      requestType: 'nextBestAction', provider: 'stub', model: 'reos-action-rules-v1', status: 'Success',
      usage: estimateUsage_(prompt, text), estimatedCost: 0, recordType: 'Lead', recordId: lead['Lead ID'] || '',
      promptPreview: preview_(prompt.user), responsePreview: preview_(text), error: '', startedAt: new Date(), finishedAt: new Date()
    });
    return { ok: true, logId: logId, lead: lead, qualification: qualification, action: result };
  }

  function recommendNextBestActionsBatch(options) {
    REOS.Security.requirePermission('ai:use');
    options = options || {};
    const leads = REOS.Acquisitions.listLeads({ limit: options.limit || 50 });
    return leads.map(function (lead) {
      const qualification = qualificationEngine_(lead);
      const action = nextBestActionEngine_(lead, qualification, options);
      return {
        'Lead ID': lead['Lead ID'],
        'Property Address': lead['Property Address'],
        'Owner Name': lead['Owner Name'],
        score: qualification.score,
        grade: qualification.grade,
        confidence: qualification.confidence,
        primaryAction: action.primaryAction,
        priority: action.priority,
        dueInDays: action.dueInDays,
        dueDate: action.dueDate,
        reasoning: action.reasoning,
        taskTitle: action.taskTitle
      };
    }).sort(function (a, b) {
      const priorityWeight = { Critical: 4, High: 3, Medium: 2, Low: 1 };
      return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0) || Number(b.score || 0) - Number(a.score || 0);
    });
  }

  function createNextBestActionTask(leadOrId) {
    REOS.Security.requirePermission('ai:use');
    REOS.Security.requirePermission('tasks:write');
    const recommendation = recommendNextBestAction(leadOrId, {});
    const lead = recommendation.lead;
    const action = recommendation.action;
    if (!REOS.CRM || typeof REOS.CRM.createTask !== 'function') throw new Error('CRM task service unavailable.');

    const task = REOS.CRM.createTask({
      Title: action.taskTitle,
      'Related Type': 'Lead',
      'Related ID': lead['Lead ID'],
      'Assigned To': lead['Assigned To'] || REOS.Security.getCurrentUserEmail(),
      Priority: action.priority,
      Status: 'Open',
      'Due Date': action.dueDate,
      Notes: action.taskNotes
    });
    REOS.Logger.audit('AI next-best-action task created', { leadId: lead['Lead ID'], taskId: task['Task ID'], action: action.primaryAction });
    return { ok: true, recommendation: recommendation, task: task };
  }

  function nextBestActionEngine_(lead, qualification, options) {
    options = options || {};
    const hasPhone = hasValue_(lead['Owner Phone']);
    const hasEmail = hasValue_(lead['Owner Email']);
    const score = Number(qualification.score || 0);
    const confidence = Number(qualification.confidence || 0);
    const riskCount = (qualification.riskFlags || []).length;
    const missing = qualification.missingData || [];
    const actions = [];

    if (!hasPhone && !hasEmail) {
      actions.push(action_(NEXT_ACTIONS.SKIP_TRACE, 'Critical', 0, 98, 'No usable owner contact information is available.'));
      actions.push(action_(NEXT_ACTIONS.SEND_DIRECT_MAIL, 'High', 1, 70, 'Direct mail can start while contact data is being enriched.'));
    } else if (score >= 80 && confidence >= 65 && hasPhone) {
      actions.push(action_(NEXT_ACTIONS.CALL_NOW, 'Critical', 0, 100, 'High score and sufficient confidence justify immediate seller outreach.'));
      actions.push(action_(NEXT_ACTIONS.MAKE_OFFER, 'High', 1, 80, 'Prepare offer range after confirming seller motivation and property condition.'));
    } else if (score >= 65 && hasPhone) {
      actions.push(action_(NEXT_ACTIONS.CALL_NOW, 'High', 1, 90, 'Strong opportunity with phone contact available.'));
      actions.push(action_(NEXT_ACTIONS.SCHEDULE_INSPECTION, 'Medium', 3, 65, 'Property review may be needed before offer.'));
    } else if (score >= 55 && hasEmail) {
      actions.push(action_(NEXT_ACTIONS.SEND_EMAIL, 'Medium', 2, 75, 'Moderate opportunity with email available.'));
      actions.push(action_(NEXT_ACTIONS.FOLLOW_UP, 'Medium', 5, 60, 'Lead should remain in nurture sequence.'));
    } else if (score >= 45) {
      actions.push(action_(NEXT_ACTIONS.SEND_DIRECT_MAIL, 'Medium', 3, 70, 'Motivation exists but direct contact or confidence may be limited.'));
      actions.push(action_(NEXT_ACTIONS.RESEARCH, 'Medium', 3, 65, 'Verify value, ownership, and distress before stronger outreach.'));
    } else {
      actions.push(action_(NEXT_ACTIONS.RESEARCH, 'Low', 7, 60, 'Lead needs more data before active pursuit.'));
      actions.push(action_(NEXT_ACTIONS.HOLD, 'Low', 14, 45, 'Low score; monitor until new distress or contact data appears.'));
    }

    if (riskCount >= 2) actions.unshift(action_(NEXT_ACTIONS.RESEARCH, 'High', 1, 95, 'Multiple risk flags require review before aggressive acquisition action.'));
    if (missing.indexOf('Estimated value') !== -1 || missing.indexOf('Asking price') !== -1) actions.push(action_(NEXT_ACTIONS.RESEARCH, 'Medium', 2, 72, 'Pricing data is incomplete.'));
    if (hasPhone && score >= 55) actions.push(action_(NEXT_ACTIONS.SEND_TEXT, actions[0].priority, actions[0].dueInDays, 68, 'Text can support call outreach without replacing it.'));

    const ranked = rankActions_(actions);
    const primary = ranked[0];
    const dueDate = addDays_(new Date(), primary.dueInDays);
    const owner = lead['Owner Name'] || 'seller';
    const address = lead['Property Address'] || 'property';

    return {
      primaryAction: primary.name,
      nextBestAction: primary.name,
      priority: primary.priority,
      dueInDays: primary.dueInDays,
      dueDate: formatDate_(dueDate),
      confidence: primary.confidence,
      reasoning: primary.reason,
      actionPlan: ranked.slice(0, 5),
      taskTitle: primary.name + ': ' + address,
      taskNotes: buildActionTaskNotes_(owner, address, qualification, primary, ranked),
      recommendedChannel: getChannelForAction_(primary.name),
      automationEligible: ['Follow up', 'Send direct mail', 'Research', 'Skip trace'].indexOf(primary.name) !== -1
    };
  }

  function action_(name, priority, dueInDays, confidence, reason) {
    return { name: name, priority: priority, dueInDays: dueInDays, confidence: confidence, reason: reason };
  }

  function rankActions_(actions) {
    const priorityWeight = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    const seen = {};
    return (actions || []).filter(function (action) {
      const key = action.name + '|' + action.priority;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function (a, b) {
      return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0) ||
        Number(b.confidence || 0) - Number(a.confidence || 0) ||
        Number(a.dueInDays || 0) - Number(b.dueInDays || 0);
    });
  }

  function buildActionTaskNotes_(owner, address, qualification, primary, ranked) {
    return [
      'AI next-best-action recommendation.',
      'Owner: ' + owner,
      'Property: ' + address,
      'Primary action: ' + primary.name,
      'Reason: ' + primary.reason,
      'Lead score: ' + qualification.score + ' / Grade: ' + qualification.grade + ' / Confidence: ' + qualification.confidence,
      'Motivation tags: ' + (qualification.motivationTags || []).join(', '),
      'Risk flags: ' + (qualification.riskFlags || []).join(', '),
      'Ranked plan: ' + ranked.slice(0, 3).map(function (item, index) { return (index + 1) + '. ' + item.name + ' (' + item.priority + ')'; }).join(' | ')
    ].join('\n');
  }

  function getChannelForAction_(actionName) {
    if (actionName === NEXT_ACTIONS.CALL_NOW) return 'Phone';
    if (actionName === NEXT_ACTIONS.SEND_TEXT) return 'SMS';
    if (actionName === NEXT_ACTIONS.SEND_EMAIL) return 'Email';
    if (actionName === NEXT_ACTIONS.SEND_DIRECT_MAIL) return 'Direct Mail';
    return 'Internal Workflow';
  }

  function qualificationEngine_(lead) {
    lead = lead || {};
    const factors = [];
    const motivationTags = [];
    const distressSignals = [];
    const investmentSignals = [];
    const riskFlags = [];
    const missingData = [];
    let score = 0;
    let confidence = 45;

    score += addDistressScore_(lead, factors, motivationTags, distressSignals);
    score += addContactScore_(lead, factors, missingData);
    score += addPricingScore_(lead, factors, investmentSignals, riskFlags, missingData);
    score += addTimingScore_(lead, factors, motivationTags);
    score += addPropertyScore_(lead, factors, investmentSignals, riskFlags);

    if (hasValue_(lead['Owner Phone'])) confidence += 10; else missingData.push('Owner phone');
    if (hasValue_(lead['Owner Email'])) confidence += 5;
    if (hasValue_(lead['Estimated Value'])) confidence += 10;
    if (hasValue_(lead['Asking Price']) || hasValue_(lead['Mortgage Balance'])) confidence += 10;
    if (hasValue_(lead['Distress Indicator'])) confidence += 10;
    if (hasValue_(lead['Property Address'])) confidence += 5; else missingData.push('Property address');

    score = clamp_(score, 0, 100);
    confidence = clamp_(confidence - Math.max(0, missingData.length - 2) * 5, 20, 95);

    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
    const urgency = score >= 75 ? 'High' : score >= 55 ? 'Medium' : 'Low';
    const fallbackAction = score >= 70 ? 'Call seller and prepare offer range' : score >= 45 ? 'Skip trace and schedule follow-up' : 'Collect missing data and monitor';
    const recommendedStrategy = getStrategy_(score, confidence, riskFlags);
    const suggestedFollowUpDays = score >= 75 ? 1 : score >= 55 ? 3 : score >= 40 ? 7 : 14;

    return {
      score: score,
      grade: grade,
      confidence: confidence,
      urgency: urgency,
      motivationTags: unique_(motivationTags),
      distressSignals: unique_(distressSignals),
      investmentSignals: unique_(investmentSignals),
      riskFlags: unique_(riskFlags),
      missingData: unique_(missingData),
      scoreFactors: factors,
      nextBestAction: fallbackAction,
      recommendedStrategy: recommendedStrategy,
      suggestedFollowUpDays: suggestedFollowUpDays,
      summary: buildQualificationSummary_(lead, score, grade, urgency, fallbackAction)
    };
  }

  function addDistressScore_(lead, factors, motivationTags, distressSignals) {
    const text = [lead['Distress Indicator'], lead.Notes, lead.Status].join(' ').toLowerCase();
    let points = 0;
    const rules = [
      ['pre-foreclosure', 25, 'Foreclosure urgency', 'Pre-foreclosure'],
      ['tax', 20, 'Tax pressure', 'Tax delinquent'],
      ['probate', 20, 'Probate motivation', 'Probate'],
      ['code', 15, 'Compliance pressure', 'Code violation'],
      ['vacant', 15, 'Vacancy pressure', 'Vacant'],
      ['eviction', 12, 'Tenant/occupancy stress', 'Eviction'],
      ['absentee', 10, 'Absentee owner', 'Absentee owner'],
      ['tired landlord', 12, 'Tired landlord', 'Landlord fatigue'],
      ['inherited', 10, 'Inherited property', 'Inherited']
    ];
    rules.forEach(function (rule) {
      if (text.indexOf(rule[0]) !== -1) {
        points += rule[1];
        motivationTags.push(rule[2]);
        distressSignals.push(rule[3]);
        factors.push({ factor: rule[3], points: rule[1], reason: rule[2] });
      }
    });
    return Math.min(points, 40);
  }

  function addContactScore_(lead, factors, missingData) {
    let points = 0;
    if (hasValue_(lead['Owner Phone'])) { points += 8; factors.push({ factor: 'Owner phone available', points: 8, reason: 'Direct outreach possible' }); }
    if (hasValue_(lead['Owner Email'])) { points += 4; factors.push({ factor: 'Owner email available', points: 4, reason: 'Secondary contact channel available' }); }
    if (!hasValue_(lead['Owner Phone']) && !hasValue_(lead['Owner Email'])) missingData.push('Owner contact information');
    return points;
  }

  function addPricingScore_(lead, factors, investmentSignals, riskFlags, missingData) {
    const estimatedValue = number_(lead['Estimated Value']);
    const askingPrice = number_(lead['Asking Price']);
    const mortgageBalance = number_(lead['Mortgage Balance']);
    let points = 0;

    if (estimatedValue && askingPrice) {
      const discount = (estimatedValue - askingPrice) / estimatedValue;
      if (discount >= 0.35) { points += 25; investmentSignals.push('Strong discount to estimated value'); factors.push({ factor: 'Strong spread', points: 25, reason: 'Asking price is at least 35% below estimated value' }); }
      else if (discount >= 0.2) { points += 15; investmentSignals.push('Moderate discount to estimated value'); factors.push({ factor: 'Moderate spread', points: 15, reason: 'Asking price is at least 20% below estimated value' }); }
      else if (discount < 0.05) riskFlags.push('Limited apparent equity spread');
    } else {
      if (!estimatedValue) missingData.push('Estimated value');
      if (!askingPrice) missingData.push('Asking price');
    }

    if (estimatedValue && mortgageBalance) {
      const equity = estimatedValue - mortgageBalance;
      if (equity > estimatedValue * 0.25) { points += 10; investmentSignals.push('Likely equity available'); }
      if (equity <= 0) riskFlags.push('Potential negative equity');
    }
    return points;
  }

  function addTimingScore_(lead, factors, motivationTags) {
    let points = 0;
    const followUp = lead['Next Follow Up'] ? new Date(lead['Next Follow Up']) : null;
    if (followUp && !isNaN(followUp.getTime())) {
      const today = new Date();
      const diffDays = Math.floor((followUp.getTime() - today.getTime()) / 86400000);
      if (diffDays <= 0) { points += 8; motivationTags.push('Follow-up due now'); factors.push({ factor: 'Follow-up due', points: 8, reason: 'Immediate action required' }); }
      else if (diffDays <= 3) { points += 4; factors.push({ factor: 'Follow-up approaching', points: 4, reason: 'Lead needs near-term attention' }); }
    }
    return points;
  }

  function addPropertyScore_(lead, factors, investmentSignals, riskFlags) {
    let points = 0;
    const bedrooms = number_(lead.Bedrooms);
    const bathrooms = number_(lead.Bathrooms);
    const address = String(lead['Property Address'] || '');
    if (address) { points += 3; factors.push({ factor: 'Address available', points: 3, reason: 'Property can be researched' }); }
    if (bedrooms >= 2 && bathrooms >= 1) { points += 5; investmentSignals.push('Standard residential layout'); }
    if (String(lead['Property Type'] || '').toLowerCase().indexOf('land') !== -1) riskFlags.push('Land requires separate underwriting model');
    return points;
  }

  function getStrategy_(score, confidence, riskFlags) {
    if (score >= 80 && confidence >= 70) return 'Aggressive acquisition pursuit';
    if (score >= 65) return 'High-touch follow-up with valuation check';
    if (score >= 50) return 'Nurture sequence and distress verification';
    if (riskFlags.length) return 'Research-first approach';
    return 'Low-priority nurture';
  }

  function buildQualificationSummary_(lead, score, grade, urgency, action) {
    const address = lead['Property Address'] || 'Unknown property';
    return address + ' scored ' + score + ' (' + grade + ') with ' + urgency + ' urgency. Recommended action: ' + action + '.';
  }

  function parseResponse(text) {
    text = String(text || '').trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch (ignore) {}
    const match = text.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch (ignore2) {} }
    return { raw: text };
  }

  function invokeStub_(request, config) {
    if (request.requestType === 'leadQualification') {
      const lead = extractLeadFromPrompt_(request.prompt);
      const result = qualificationEngine_(lead);
      return { text: REOS.toJson_(result), usage: estimateUsage_(request.prompt, REOS.toJson_(result)) };
    }
    if (request.requestType === 'nextBestAction') {
      const lead = extractLeadFromPrompt_(request.prompt);
      const qualification = qualificationEngine_(lead);
      const result = nextBestActionEngine_(lead, qualification, {});
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

  function invokeNotImplemented_(request, config) { throw new Error('AI provider not implemented yet: ' + config.provider); }

  function extractLeadFromPrompt_(prompt) {
    const text = prompt && prompt.user ? prompt.user : String(prompt || '');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return JSON.parse(match[0]); } catch (error) { return {}; }
  }

  function estimateUsage_(prompt, responseText) {
    const promptText = prompt && prompt.user ? prompt.system + '\n' + prompt.user : String(prompt || '');
    const promptTokens = Math.ceil(promptText.length / 4);
    const completionTokens = Math.ceil(String(responseText || '').length / 4);
    return { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens };
  }

  function estimateCost_(provider, model, usage) { return provider === 'stub' ? 0 : 0; }

  function logRequest_(entry) {
    ensureSheets();
    const record = {
      'Request Type': entry.requestType, Provider: entry.provider, Model: entry.model, Status: entry.status,
      'Prompt Tokens': entry.usage.prompt_tokens || 0, 'Completion Tokens': entry.usage.completion_tokens || 0,
      'Total Tokens': entry.usage.total_tokens || 0, 'Estimated Cost': entry.estimatedCost || 0,
      'Record Type': entry.recordType, 'Record ID': entry.recordId, 'Prompt Preview': entry.promptPreview,
      'Response Preview': entry.responsePreview, Error: entry.error, User: REOS.Security.getCurrentUserEmail(),
      'Started At': entry.startedAt, 'Finished At': entry.finishedAt
    };
    const created = REOS.Database.insert(LOG_SHEET, record, { idField: LOG_ID_FIELD, idPrefix: 'AI' });
    REOS.Logger.info('AI request logged', { requestId: created[LOG_ID_FIELD], type: entry.requestType, status: entry.status });
    return created[LOG_ID_FIELD];
  }

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

  function resolveLead_(leadOrId) {
    const lead = typeof leadOrId === 'string' ? REOS.Acquisitions.getLead(leadOrId) : leadOrId;
    if (!lead) throw new Error('Lead not found.');
    return lead;
  }
  function number_(value) { const n = Number(value || 0); return isNaN(n) ? 0 : n; }
  function hasValue_(value) { return value !== null && value !== undefined && String(value).trim() !== ''; }
  function clamp_(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function unique_(items) { return items.filter(function (item, index) { return item && items.indexOf(item) === index; }); }
  function preview_(value) { return String(value || '').replace(/\s+/g, ' ').slice(0, 500); }
  function addDays_(date, days) { const result = new Date(date); result.setDate(result.getDate() + Number(days || 0)); return result; }
  function formatDate_(date) { return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

  return {
    LOG_SHEET: LOG_SHEET, PROVIDERS: PROVIDERS, PROMPTS: PROMPTS, NEXT_ACTIONS: NEXT_ACTIONS,
    initialize: initialize, ensureSheets: ensureSheets, seedDefaultConfig: seedDefaultConfig,
    getConfig: getConfig, updateConfig: updateConfig, getPromptTemplate: getPromptTemplate,
    buildPrompt: buildPrompt, complete: complete, qualifyLead: qualifyLead,
    qualifyLeadRulesOnly: qualifyLeadRulesOnly, qualifyLeadBatch: qualifyLeadBatch,
    recommendNextBestAction: recommendNextBestAction,
    recommendNextBestActionsBatch: recommendNextBestActionsBatch,
    createNextBestActionTask: createNextBestActionTask,
    parseResponse: parseResponse, getRequestLogs: getRequestLogs
  };
})();

function reosInitializeAI() { return REOS.AI.initialize(); }
function reosAIGetConfig() { return REOS.AI.getConfig(); }
function reosAIUpdateConfig(config) { return REOS.AI.updateConfig(config || {}); }
function reosAIBuildPrompt(templateKey, data) { return REOS.AI.buildPrompt(templateKey, data || {}); }
function reosAIQualifyLead(leadOrId) { return REOS.AI.qualifyLead(leadOrId); }
function reosAIQualifyLeadRulesOnly(leadOrId) { return REOS.AI.qualifyLeadRulesOnly(leadOrId); }
function reosAIQualifyLeadBatch(options) { return REOS.AI.qualifyLeadBatch(options || {}); }
function reosAIRecommendNextBestAction(leadOrId, options) { return REOS.AI.recommendNextBestAction(leadOrId, options || {}); }
function reosAIRecommendNextBestActionsBatch(options) { return REOS.AI.recommendNextBestActionsBatch(options || {}); }
function reosAICreateNextBestActionTask(leadOrId) { return REOS.AI.createNextBestActionTask(leadOrId); }
function reosAIGetRequestLogs(options) { return REOS.AI.getRequestLogs(options || {}); }
