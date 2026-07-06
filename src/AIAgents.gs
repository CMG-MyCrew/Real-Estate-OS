/**
 * REOS Enterprise v3.0 - Sprint 20 AI Automation Agents & Orchestration
 *
 * Production-release foundation for cross-module AI agents, agent runs,
 * autonomous task queues, workflow recommendations, and release orchestration.
 */

var REOS = REOS || {};

REOS.AIAgents = (function () {
  const AGENTS_SHEET = 'AI_AGENTS';
  const RUNS_SHEET = 'AI_AGENT_RUNS';
  const TASKS_SHEET = 'AI_AGENT_TASKS';
  const AGENT_ID_FIELD = 'Agent ID';
  const RUN_ID_FIELD = 'Agent Run ID';
  const TASK_ID_FIELD = 'Agent Task ID';

  const AGENT_HEADERS = ['Agent ID', 'Name', 'Type', 'Module', 'Status', 'Goal', 'Trigger', 'Config JSON', 'Last Run At', 'Created At', 'Updated At'];
  const RUN_HEADERS = ['Agent Run ID', 'Agent ID', 'Agent Name', 'Status', 'Input JSON', 'Output JSON', 'Recommendations JSON', 'Error', 'Started At', 'Finished At', 'Created At', 'Updated At'];
  const TASK_HEADERS = ['Agent Task ID', 'Agent ID', 'Source Run ID', 'Module', 'Task Type', 'Priority', 'Status', 'Title', 'Description', 'Related Record Type', 'Related Record ID', 'Due Date', 'Created At', 'Updated At'];

  const DEFAULT_AGENTS = [
    { Name: 'Lead Qualification Agent', Type: 'Analysis', Module: 'Acquisitions', Goal: 'Qualify hot distressed/off-market leads and recommend next action.', Trigger: 'manual.or.daily', Config: { limit: 25, createTasks: false } },
    { Name: 'Follow-up Recovery Agent', Type: 'Workflow', Module: 'CRM', Goal: 'Find stale leads and overdue follow-ups requiring action.', Trigger: 'daily.run', Config: { staleDays: 3, priority: 'High' } },
    { Name: 'Property Operations Agent', Type: 'Operations', Module: 'Properties', Goal: 'Identify maintenance, vacancy, inspection, and document gaps.', Trigger: 'daily.run', Config: { reviewOpenMaintenance: true, reviewVacancy: true } },
    { Name: 'Vendor Performance Agent', Type: 'Operations', Module: 'Vendors', Goal: 'Review open work orders, SLA risk, and vendor workload.', Trigger: 'daily.run', Config: { reviewOpenWorkOrders: true, slaDays: 2 } },
    { Name: 'Release Readiness Agent', Type: 'Governance', Module: 'Production', Goal: 'Summarize production hardening, QA status, and release blockers.', Trigger: 'manual.run', Config: { includeHardening: true, includeQa: true } }
  ];

  function ensureSheets() {
    ensureTable_(AGENTS_SHEET, AGENT_HEADERS);
    ensureTable_(RUNS_SHEET, RUN_HEADERS);
    ensureTable_(TASKS_SHEET, TASK_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setWrap(true);
      sheet.autoResizeColumns(1, headers.length);
    }
  }

  function seedAgents() {
    REOS.Security.requirePermission('ai:use');
    ensureSheets();
    const existing = REOS.Database.getAll(AGENTS_SHEET).map(function (row) { return String(row.Name || '').toLowerCase(); });
    let created = 0;
    DEFAULT_AGENTS.forEach(function (agent) {
      if (existing.indexOf(String(agent.Name).toLowerCase()) !== -1) return;
      REOS.Database.insert(AGENTS_SHEET, {
        Name: agent.Name,
        Type: agent.Type,
        Module: agent.Module,
        Status: 'Active',
        Goal: agent.Goal,
        Trigger: agent.Trigger,
        'Config JSON': REOS.toJson_(agent.Config || {}),
        'Last Run At': '',
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: AGENT_ID_FIELD, idPrefix: 'AAGT' });
      created++;
    });
    return { ok: true, created: created, agents: listAgents() };
  }

  function listAgents() {
    REOS.Security.requirePermission('ai:use');
    ensureSheets();
    return REOS.Database.getAll(AGENTS_SHEET);
  }

  function getDashboard() {
    REOS.Security.requirePermission('ai:use');
    ensureSheets();
    const agents = listAgents();
    const runs = latest_(REOS.Database.getAll(RUNS_SHEET), 'Started At', 50);
    const tasks = latest_(REOS.Database.getAll(TASKS_SHEET), 'Created At', 50);
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        agents: agents.length,
        activeAgents: agents.filter(function (a) { return String(a.Status || '') === 'Active'; }).length,
        runs: runs.length,
        openAgentTasks: tasks.filter(function (t) { return String(t.Status || 'Open') !== 'Completed'; }).length,
        failedRuns: runs.filter(function (r) { return String(r.Status || '') === 'Error'; }).length
      },
      agents: agents,
      runs: runs,
      tasks: tasks
    };
  }

  function runAgent(agentId, input) {
    REOS.Security.requirePermission('ai:use');
    ensureSheets();
    const agent = REOS.Database.findById(AGENTS_SHEET, AGENT_ID_FIELD, agentId);
    if (!agent) throw new Error('AI agent not found: ' + agentId);
    const started = new Date();
    let run;
    try {
      run = REOS.Database.insert(RUNS_SHEET, {
        'Agent ID': agentId,
        'Agent Name': agent.Name,
        Status: 'Running',
        'Input JSON': REOS.toJson_(input || {}),
        'Output JSON': '',
        'Recommendations JSON': '',
        Error: '',
        'Started At': started,
        'Finished At': '',
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: RUN_ID_FIELD, idPrefix: 'ARUN' });
      const result = executeAgent_(agent, input || {});
      REOS.Database.update(RUNS_SHEET, RUN_ID_FIELD, run[RUN_ID_FIELD], {
        Status: 'Success',
        'Output JSON': REOS.toJson_(result.output || {}),
        'Recommendations JSON': REOS.toJson_(result.recommendations || []),
        'Finished At': new Date(),
        'Updated At': new Date()
      });
      REOS.Database.update(AGENTS_SHEET, AGENT_ID_FIELD, agentId, { 'Last Run At': new Date(), 'Updated At': new Date() });
      createAgentTasks_(agent, run[RUN_ID_FIELD], result.recommendations || []);
      return { ok: true, runId: run[RUN_ID_FIELD], agent: agent.Name, result: result };
    } catch (error) {
      if (run) REOS.Database.update(RUNS_SHEET, RUN_ID_FIELD, run[RUN_ID_FIELD], { Status: 'Error', Error: error.message, 'Finished At': new Date(), 'Updated At': new Date() });
      REOS.handleError_('AIAgents.runAgent', error);
      throw error;
    }
  }

  function runAllActive() {
    REOS.Security.requirePermission('ai:use');
    const agents = listAgents().filter(function (a) { return String(a.Status || '') === 'Active'; });
    return agents.map(function (agent) {
      try { return runAgent(agent[AGENT_ID_FIELD], {}); } catch (error) { return { ok: false, agent: agent.Name, error: error.message }; }
    });
  }

  function executeAgent_(agent, input) {
    const module = String(agent.Module || 'General');
    const config = safeJson_(agent['Config JSON']);
    const overview = safeCall_(function () { return REOS.Dashboard.getOverview(); }, { kpis: {} });
    const hardening = safeCall_(function () { return REOS.ProductionHardening.getLatestReport(); }, null);
    const leads = safeCall_(function () { return REOS.Acquisitions.searchLeads({ limit: config.limit || 25 }); }, []);
    const recommendations = [];

    if (module === 'Acquisitions' && REOS.AI && typeof REOS.AI.qualifyLeadBatch === 'function') {
      const qualified = safeCall_(function () { return REOS.AI.qualifyLeadBatch(leads.slice(0, config.limit || 25)); }, []);
      qualified.slice(0, 10).forEach(function (item) {
        recommendations.push({ module: 'Acquisitions', type: 'Follow Up', priority: item.priority || 'High', title: 'AI follow-up: ' + (item['Property Address'] || item['Lead ID'] || 'Lead'), relatedType: 'Lead', relatedId: item['Lead ID'] || '', description: item.nextBestAction || 'Review AI-qualified lead.' });
      });
      return { output: { qualified: qualified.length }, recommendations: recommendations };
    }

    if (module === 'Production') {
      const summary = hardening && hardening['Summary JSON'] ? safeJson_(hardening['Summary JSON']) : {};
      if (summary.status && summary.status !== 'Ready') recommendations.push({ module: 'Production', type: 'Release Blocker Review', priority: summary.criticalIssues ? 'Critical' : 'High', title: 'Review release readiness: ' + summary.status, relatedType: 'Hardening Report', relatedId: hardening['Report ID'] || '', description: 'Production hardening requires review before release.' });
      return { output: { hardening: summary, kpis: overview.kpis || {} }, recommendations: recommendations };
    }

    ['followUpsDue', 'openWorkOrders', 'openMaintenance'].forEach(function (key) {
      if (Number((overview.kpis || {})[key] || 0) > 0) recommendations.push({ module: module, type: 'Operational Review', priority: 'High', title: 'Review ' + key, relatedType: 'Dashboard KPI', relatedId: key, description: key + ' requires operational attention.' });
    });
    return { output: { module: module, kpis: overview.kpis || {} }, recommendations: recommendations };
  }

  function createAgentTasks_(agent, runId, recommendations) {
    (recommendations || []).forEach(function (rec) {
      REOS.Database.insert(TASKS_SHEET, {
        'Agent ID': agent[AGENT_ID_FIELD],
        'Source Run ID': runId,
        Module: rec.module || agent.Module,
        'Task Type': rec.type || 'Review',
        Priority: rec.priority || 'Medium',
        Status: 'Open',
        Title: rec.title || 'Agent recommendation',
        Description: rec.description || '',
        'Related Record Type': rec.relatedType || '',
        'Related Record ID': rec.relatedId || '',
        'Due Date': dueDate_(rec.priority || 'Medium'),
        'Created At': new Date(),
        'Updated At': new Date()
      }, { idField: TASK_ID_FIELD, idPrefix: 'ATSK' });
    });
  }

  function updateTask(taskId, changes) {
    REOS.Security.requirePermission('ai:use');
    ensureSheets();
    return REOS.Database.update(TASKS_SHEET, TASK_ID_FIELD, taskId, Object.assign({}, changes || {}, { 'Updated At': new Date() }));
  }

  function generateProductionReleaseSummary() {
    REOS.Security.requirePermission('ai:use');
    const dashboard = getDashboard();
    const hardening = safeCall_(function () { return REOS.ProductionHardening.getLatestReport(); }, null);
    return {
      ok: true,
      title: 'REOS Enterprise v3.0 Production Release Summary',
      generatedAt: REOS.nowIso_(),
      agentStatus: dashboard.kpis,
      readiness: hardening,
      recommendation: dashboard.kpis.failedRuns > 0 ? 'Review failed agent runs before production release.' : 'AI orchestration layer ready for RC review.'
    };
  }

  function dueDate_(priority) {
    const date = new Date();
    date.setDate(date.getDate() + (priority === 'Critical' ? 0 : priority === 'High' ? 1 : 3));
    return date;
  }
  function safeJson_(value) { try { return JSON.parse(String(value || '{}')); } catch (error) { return {}; } }
  function safeCall_(fn, fallback) { try { return fn(); } catch (error) { return fallback; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 50); }

  return { ensureSheets: ensureSheets, seedAgents: seedAgents, listAgents: listAgents, getDashboard: getDashboard, runAgent: runAgent, runAllActive: runAllActive, updateTask: updateTask, generateProductionReleaseSummary: generateProductionReleaseSummary };
})();

function reosAIAgentsEnsureSheets() { return REOS.AIAgents.ensureSheets(); }
function reosAIAgentsSeed() { return REOS.AIAgents.seedAgents(); }
function reosAIAgentsDashboard() { return REOS.AIAgents.getDashboard(); }
function reosAIAgentsRun(agentId, input) { return REOS.AIAgents.runAgent(agentId, input || {}); }
function reosAIAgentsRunAll() { return REOS.AIAgents.runAllActive(); }
function reosAIAgentsUpdateTask(taskId, changes) { return REOS.AIAgents.updateTask(taskId, changes || {}); }
function reosAIAgentsReleaseSummary() { return REOS.AIAgents.generateProductionReleaseSummary(); }
function showAIAgents() {
  REOS.Security.requirePermission('ai:use');
  const html = HtmlService.createHtmlOutputFromFile('AIAgents').setTitle('REOS AI Agents').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS AI Agents');
}
