/**
 * REOS Enterprise v3.0 - Predictive Analytics Framework
 *
 * Lightweight forecasting and risk scoring using REOS historical snapshots and
 * current operational data. Designed to be upgraded later with external ML.
 */

var REOS = REOS || {};

REOS.PredictiveAnalytics = (function () {
  function forecastRevenue(monthsAhead) {
    monthsAhead = Number(monthsAhead || 3);
    const snapshots = REOS.BI.listSnapshots(24);
    const y = snapshots.map(function (s) { return Number(s['Monthly Income'] || 0) || 0; });
    const forecast = linearForecast_(y, monthsAhead);
    return {
      metric: 'Monthly Income',
      monthsAhead: monthsAhead,
      historical: y,
      forecast: forecast,
      confidence: confidence_(y)
    };
  }

  function forecastCashFlow(monthsAhead) {
    monthsAhead = Number(monthsAhead || 3);
    const snapshots = REOS.BI.listSnapshots(24);
    const y = snapshots.map(function (s) { return Number(s['Monthly Cash Flow'] || 0) || 0; });
    return {
      metric: 'Monthly Cash Flow',
      monthsAhead: monthsAhead,
      historical: y,
      forecast: linearForecast_(y, monthsAhead),
      confidence: confidence_(y)
    };
  }

  function leadConversionRisk() {
    const leads = REOS.CRM.listLeads ? REOS.CRM.listLeads() : [];
    return leads.filter(function (lead) { return lead.Active !== false; }).map(function (lead) {
      const score = Number(lead['Lead Score'] || 0) || 0;
      const priority = String(lead.Priority || '').toLowerCase();
      const status = String(lead.Status || '').toLowerCase();
      let risk = 50;
      if (score >= 90 || priority === 'hot') risk -= 25;
      if (score < 50) risk += 25;
      if (status === 'new') risk += 10;
      if (status === 'nurture') risk += 15;
      return {
        leadId: lead['Lead ID'],
        clientId: lead['Client ID'],
        status: lead.Status,
        priority: lead.Priority,
        leadScore: score,
        conversionRisk: clamp_(risk),
        recommendation: risk > 65 ? 'Immediate follow-up recommended.' : 'Continue standard nurture.'
      };
    }).sort(function (a, b) { return b.conversionRisk - a.conversionRisk; });
  }

  function transactionRiskScores() {
    let tx = [];
    try { tx = REOS.Transactions.listActive(); } catch (error) { tx = []; }
    return tx.map(function (t) {
      const days = Number(t['Days Remaining'] || 0) || 0;
      let missingDocs = 0;
      try { missingDocs = REOS.Documents.missingForRecord(t['Transaction ID']).length; } catch (ignore) {}
      let risk = 30;
      if (days <= 7) risk += 30;
      if (days <= 3) risk += 20;
      risk += missingDocs * 10;
      if (String(t.Status || '').toLowerCase() === 'at risk') risk += 25;
      return {
        transactionId: t['Transaction ID'],
        address: t.Address,
        status: t.Status,
        daysRemaining: days,
        missingDocuments: missingDocs,
        riskScore: clamp_(risk),
        recommendation: risk >= 70 ? 'Escalate closing review today.' : 'Monitor normally.'
      };
    }).sort(function (a, b) { return b.riskScore - a.riskScore; });
  }

  function rentalRiskScores() {
    const rentals = safe_(function () { return REOS.Rentals.listActive(); }) || [];
    const leases = safe_(function () { return REOS.Leases.expiringWithin(120); }) || [];
    const maintenance = safe_(function () { return REOS.Maintenance.listOpen(); }) || [];
    return rentals.map(function (r) {
      const leaseExpiring = leases.some(function (l) { return String(l['Rental ID'] || '') === String(r['Rental ID'] || ''); });
      const openWorkOrders = maintenance.filter(function (m) { return String(m['Rental ID'] || '') === String(r['Rental ID'] || ''); }).length;
      let risk = 20;
      if (String(r['Occupancy Status'] || '').toLowerCase() === 'vacant') risk += 35;
      if (Number(r['Net Monthly Cash Flow'] || 0) < 0) risk += 25;
      if (leaseExpiring) risk += 20;
      risk += openWorkOrders * 8;
      return {
        rentalId: r['Rental ID'],
        address: r.Address,
        occupancyStatus: r['Occupancy Status'],
        monthlyCashFlow: r['Net Monthly Cash Flow'],
        openWorkOrders: openWorkOrders,
        leaseExpiring: leaseExpiring,
        riskScore: clamp_(risk),
        recommendation: risk >= 70 ? 'Review rent, vacancy, lease, and maintenance plan.' : 'Portfolio risk acceptable.'
      };
    }).sort(function (a, b) { return b.riskScore - a.riskScore; });
  }

  function predictiveDashboard() {
    return {
      generatedAt: new Date(),
      revenueForecast: forecastRevenue(3),
      cashFlowForecast: forecastCashFlow(3),
      leadRisks: leadConversionRisk().slice(0, 10),
      transactionRisks: transactionRiskScores().slice(0, 10),
      rentalRisks: rentalRiskScores().slice(0, 10)
    };
  }

  function linearForecast_(values, periods) {
    values = values || [];
    if (!values.length) return [];
    if (values.length === 1) return Array(periods).fill(values[0]);
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce(function (a, b) { return a + b; }, 0) / n;
    let num = 0;
    let den = 0;
    values.forEach(function (y, x) {
      num += (x - xMean) * (y - yMean);
      den += Math.pow(x - xMean, 2);
    });
    const slope = den ? num / den : 0;
    const intercept = yMean - slope * xMean;
    const out = [];
    for (let i = 0; i < periods; i++) out.push(Math.max(0, intercept + slope * (n + i)));
    return out;
  }

  function confidence_(values) {
    if (!values || values.length < 4) return 'Low';
    const avg = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    if (!avg) return 'Low';
    const variance = values.reduce(function (total, v) { return total + Math.pow(v - avg, 2); }, 0) / values.length;
    const cv = Math.sqrt(variance) / Math.abs(avg);
    if (cv < 0.25) return 'High';
    if (cv < 0.60) return 'Medium';
    return 'Low';
  }

  function clamp_(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
  }

  function safe_(fn) {
    try { return fn(); } catch (error) { return null; }
  }

  return {
    forecastRevenue: forecastRevenue,
    forecastCashFlow: forecastCashFlow,
    leadConversionRisk: leadConversionRisk,
    transactionRiskScores: transactionRiskScores,
    rentalRiskScores: rentalRiskScores,
    predictiveDashboard: predictiveDashboard
  };
})();

function predictiveRevenue(monthsAhead) { return REOS.PredictiveAnalytics.forecastRevenue(monthsAhead); }
function predictiveCashFlow(monthsAhead) { return REOS.PredictiveAnalytics.forecastCashFlow(monthsAhead); }
function predictiveLeadRisk() { return REOS.PredictiveAnalytics.leadConversionRisk(); }
function predictiveTransactionRisk() { return REOS.PredictiveAnalytics.transactionRiskScores(); }
function predictiveRentalRisk() { return REOS.PredictiveAnalytics.rentalRiskScores(); }
function predictiveDashboard() { return REOS.PredictiveAnalytics.predictiveDashboard(); }
