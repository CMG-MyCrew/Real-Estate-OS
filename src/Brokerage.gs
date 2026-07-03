/**
 * REOS Enterprise v3.0 - Multi-Office / Brokerage Management Framework
 *
 * Adds brokerage, office, team, roster, production, recruiting, and compliance
 * management for multi-office real estate operations.
 */

var REOS = REOS || {};

REOS.Brokerage = (function () {
  const BROKERAGE_SHEET = 'BROKERAGE';
  const OFFICES_SHEET = 'OFFICES';
  const TEAMS_SHEET = 'TEAMS';
  const ROSTER_SHEET = 'AGENT_ROSTER';

  const BROKERAGE_HEADERS = [
    'Brokerage ID', 'Brokerage Name', 'License Number', 'Broker of Record',
    'Main Office ID', 'Status', 'Notes', 'Active', 'Created At', 'Updated At'
  ];

  const OFFICE_HEADERS = [
    'Office ID', 'Brokerage ID', 'Office Name', 'Market', 'Address', 'City',
    'State', 'ZIP', 'Managing Broker', 'Phone', 'Email', 'Status', 'Notes',
    'Active', 'Created At', 'Updated At'
  ];

  const TEAM_HEADERS = [
    'Team ID', 'Office ID', 'Team Name', 'Team Lead', 'Market', 'Status',
    'Notes', 'Active', 'Created At', 'Updated At'
  ];

  const ROSTER_HEADERS = [
    'Agent ID', 'Office ID', 'Team ID', 'Agent Name', 'Email', 'Phone',
    'Role', 'License Number', 'License Expiration', 'Split %', 'Cap Amount',
    'YTD GCI', 'YTD Net Commission', 'Transactions Closed', 'Status',
    'Notes', 'Active', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(BROKERAGE_SHEET, BROKERAGE_HEADERS);
    ensureTable_(OFFICES_SHEET, OFFICE_HEADERS);
    ensureTable_(TEAMS_SHEET, TEAM_HEADERS);
    ensureTable_(ROSTER_SHEET, ROSTER_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    return sheet;
  }

  function createBrokerage(record) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    record = record || {};
    record.Status = record.Status || 'Active';
    record.Active = record.Active === false ? false : true;
    const validation = REOS.Validation.validateRecord(record, { required: ['Brokerage Name'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const created = REOS.Database.insert(BROKERAGE_SHEET, record, { idField: 'Brokerage ID', idPrefix: 'BRK' });
    REOS.Logger.audit('Brokerage created', { brokerageId: created['Brokerage ID'] });
    return created;
  }

  function createOffice(record) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    record = record || {};
    record.Email = REOS.normalizeEmail_(record.Email);
    record.Phone = REOS.normalizePhone_(record.Phone);
    record.Status = record.Status || 'Active';
    record.Active = record.Active === false ? false : true;
    const validation = REOS.Validation.validateRecord(record, { required: ['Brokerage ID', 'Office Name', 'Market'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const created = REOS.Database.insert(OFFICES_SHEET, record, { idField: 'Office ID', idPrefix: 'OFF' });
    REOS.Logger.audit('Office created', { officeId: created['Office ID'], brokerageId: created['Brokerage ID'] });
    return created;
  }

  function createTeam(record) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    record = record || {};
    record.Status = record.Status || 'Active';
    record.Active = record.Active === false ? false : true;
    const validation = REOS.Validation.validateRecord(record, { required: ['Office ID', 'Team Name'] });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const created = REOS.Database.insert(TEAMS_SHEET, record, { idField: 'Team ID', idPrefix: 'TEAM' });
    REOS.Logger.audit('Team created', { teamId: created['Team ID'], officeId: created['Office ID'] });
    return created;
  }

  function addAgent(record) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    record = record || {};
    record.Email = REOS.normalizeEmail_(record.Email);
    record.Phone = REOS.normalizePhone_(record.Phone);
    record.Role = record.Role || 'Agent';
    record.Status = record.Status || 'Active';
    record.Active = record.Active === false ? false : true;
    record['Split %'] = Number(record['Split %'] || 0.8);
    record['YTD GCI'] = Number(record['YTD GCI'] || 0);
    record['YTD Net Commission'] = Number(record['YTD Net Commission'] || 0);
    record['Transactions Closed'] = Number(record['Transactions Closed'] || 0);
    const validation = REOS.Validation.validateRecord(record, {
      required: ['Office ID', 'Agent Name', 'Email'],
      emailField: 'Email',
      phoneField: 'Phone',
      dateFields: ['License Expiration']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));
    const created = REOS.Database.insert(ROSTER_SHEET, record, { idField: 'Agent ID', idPrefix: 'AGT' });
    REOS.Logger.audit('Agent added to roster', { agentId: created['Agent ID'], officeId: created['Office ID'] });
    return created;
  }

  function listOffices() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.query(OFFICES_SHEET, function (r) { return r.Active !== false; });
  }

  function listTeams() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.query(TEAMS_SHEET, function (r) { return r.Active !== false; });
  }

  function listAgents() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    return REOS.Database.query(ROSTER_SHEET, function (r) { return r.Active !== false; });
  }

  function updateAgentProduction(agentId, gci, netCommission, closedCount) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const agent = REOS.Database.findById(ROSTER_SHEET, 'Agent ID', agentId);
    if (!agent) throw new Error('Agent not found: ' + agentId);
    return REOS.Database.update(ROSTER_SHEET, 'Agent ID', agentId, {
      'YTD GCI': Number(agent['YTD GCI'] || 0) + Number(gci || 0),
      'YTD Net Commission': Number(agent['YTD Net Commission'] || 0) + Number(netCommission || 0),
      'Transactions Closed': Number(agent['Transactions Closed'] || 0) + Number(closedCount || 0)
    });
  }

  function dashboard() {
    ensureSheets();
    const offices = listOffices();
    const teams = listTeams();
    const agents = listAgents();
    const activeAgents = agents.filter(function (a) { return String(a.Status || '').toLowerCase() === 'active'; });
    return {
      officeCount: offices.length,
      teamCount: teams.length,
      agentCount: agents.length,
      activeAgentCount: activeAgents.length,
      ytdGci: sum_(agents, 'YTD GCI'),
      ytdNetCommission: sum_(agents, 'YTD Net Commission'),
      transactionsClosed: sum_(agents, 'Transactions Closed'),
      topAgents: agents.sort(function (a, b) { return Number(b['YTD GCI'] || 0) - Number(a['YTD GCI'] || 0); }).slice(0, 10),
      offices: offices,
      teams: teams,
      agents: agents.slice(0, 100)
    };
  }

  function sum_(records, field) {
    return records.reduce(function (total, row) { return total + (Number(row[field] || 0) || 0); }, 0);
  }

  return {
    ensureSheets: ensureSheets,
    createBrokerage: createBrokerage,
    createOffice: createOffice,
    createTeam: createTeam,
    addAgent: addAgent,
    listOffices: listOffices,
    listTeams: listTeams,
    listAgents: listAgents,
    updateAgentProduction: updateAgentProduction,
    dashboard: dashboard
  };
})();

function brokerageCreateBrokerage(record) { return REOS.Brokerage.createBrokerage(record); }
function brokerageCreateOffice(record) { return REOS.Brokerage.createOffice(record); }
function brokerageCreateTeam(record) { return REOS.Brokerage.createTeam(record); }
function brokerageAddAgent(record) { return REOS.Brokerage.addAgent(record); }
function brokerageDashboard() { return REOS.Brokerage.dashboard(); }
