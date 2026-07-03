/**
 * REOS Enterprise v3.0 - Brokerage Reporting Framework
 *
 * Office, team, agent, compliance, and recruiting rollups.
 */

var REOS = REOS || {};

REOS.BrokerageReports = (function () {
  function productionByOffice() {
    const dashboard = REOS.Brokerage.dashboard();
    const offices = dashboard.offices || [];
    const agents = dashboard.agents || [];
    return offices.map(function (office) {
      const officeAgents = agents.filter(function (a) { return String(a['Office ID'] || '') === String(office['Office ID'] || ''); });
      return {
        officeId: office['Office ID'],
        officeName: office['Office Name'],
        market: office.Market,
        agentCount: officeAgents.length,
        ytdGci: sum_(officeAgents, 'YTD GCI'),
        ytdNetCommission: sum_(officeAgents, 'YTD Net Commission'),
        transactionsClosed: sum_(officeAgents, 'Transactions Closed')
      };
    });
  }

  function productionByTeam() {
    const dashboard = REOS.Brokerage.dashboard();
    const teams = dashboard.teams || [];
    const agents = dashboard.agents || [];
    return teams.map(function (team) {
      const teamAgents = agents.filter(function (a) { return String(a['Team ID'] || '') === String(team['Team ID'] || ''); });
      return {
        teamId: team['Team ID'],
        teamName: team['Team Name'],
        officeId: team['Office ID'],
        agentCount: teamAgents.length,
        ytdGci: sum_(teamAgents, 'YTD GCI'),
        ytdNetCommission: sum_(teamAgents, 'YTD Net Commission'),
        transactionsClosed: sum_(teamAgents, 'Transactions Closed')
      };
    });
  }

  function complianceWatch(days) {
    days = Number(days || 60);
    const agents = REOS.Brokerage.listAgents();
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + days);
    return agents.filter(function (agent) {
      const exp = toDate_(agent['License Expiration']);
      return exp && exp.getTime() <= end.getTime();
    }).map(function (agent) {
      return {
        agentId: agent['Agent ID'],
        agentName: agent['Agent Name'],
        email: agent.Email,
        officeId: agent['Office ID'],
        licenseNumber: agent['License Number'],
        licenseExpiration: agent['License Expiration'],
        daysRemaining: daysUntil_(agent['License Expiration'])
      };
    });
  }

  function executiveBrokerageReport() {
    return {
      dashboard: REOS.Brokerage.dashboard(),
      officeProduction: productionByOffice(),
      teamProduction: productionByTeam(),
      complianceWatch: complianceWatch(60)
    };
  }

  function toDate_(value) {
    if (!value) return null;
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function daysUntil_(value) {
    const d = toDate_(value);
    if (!d) return '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.ceil((target.getTime() - today.getTime()) / 86400000);
  }

  function sum_(records, field) {
    return records.reduce(function (total, row) { return total + (Number(row[field] || 0) || 0); }, 0);
  }

  return {
    productionByOffice: productionByOffice,
    productionByTeam: productionByTeam,
    complianceWatch: complianceWatch,
    executiveBrokerageReport: executiveBrokerageReport
  };
})();

function brokerageProductionByOffice() { return REOS.BrokerageReports.productionByOffice(); }
function brokerageProductionByTeam() { return REOS.BrokerageReports.productionByTeam(); }
function brokerageComplianceWatch(days) { return REOS.BrokerageReports.complianceWatch(days); }
function brokerageExecutiveReport() { return REOS.BrokerageReports.executiveBrokerageReport(); }
