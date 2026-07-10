/**
 * REOS Enterprise v3.0.0 GA - Phase 5 Production Monitoring
 *
 * Initializes production monitoring snapshots, evaluates system health, tracks
 * trigger/API/AI/export/document/log signals, stores alerts, and supports a
 * dashboard for post-deployment monitoring.
 */

var REOS = REOS || {};

REOS.ProductionMonitoring = (function () {
  const SNAPSHOTS_SHEET = 'MONITORING_SNAPSHOTS';
  const ALERTS_SHEET = 'MONITORING_ALERTS';
  const METRICS_SHEET = 'MONITORING_METRICS';
  const SNAPSHOT_ID_FIELD = 'Snapshot ID';
  const ALERT_ID_FIELD = 'Alert ID';
  const METRIC_ID_FIELD = 'Metric ID';

  const SNAPSHOT_HEADERS = ['Snapshot ID', 'Environment', 'Status', 'Score', 'Critical Alerts', 'Warnings', 'Metrics JSON', 'Created At', 'Updated At'];
  const ALERT_HEADERS = ['Alert ID', 'Snapshot ID', 'Area', 'Severity', 'Status', 'Message', 'Details JSON', 'Created At', 'Updated At'];
  const METRIC_HEADERS = ['Metric ID', 'Snapshot ID', 'Area', 'Metric', 'Value', 'Threshold', 'Status', 'Created At', 'Updated At'];

  function ensureSheets() {
    ensureTable_(SNAPSHOTS_SHEET, SNAPSHOT_HEADERS);
    ensureTable_(ALERTS_SHEET, ALERT_HEADERS);
    ensureTable_(METRICS_SHEET, METRIC_HEADERS);
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

  function getDashboard() {
    REOS.Security.requireAdmin();
    ensureSheets();
    const snapshots = latest_(REOS.Database.getAll(SNAPSHOTS_SHEET), 'Created At', 25);
    const latest = snapshots[0] || null;
    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      kpis: {
        snapshots: snapshots.length,
        latestStatus: latest ? latest.Status : 'Not Run',
        latestScore: latest ? latest.Score : 0,
        criticalAlerts: latest ? latest['Critical Alerts'] : 0,
        warnings: latest ? latest.Warnings : 0
      },
      snapshots: snapshots,
      latestAlerts: latest ? getSnapshotAlerts(latest[SNAPSHOT_ID_FIELD]) : [],
      latestMetrics: latest ? getSnapshotMetrics(latest[SNAPSHOT_ID_FIELD]) : []
    };
  }

  function runSnapshot(options) {
    REOS.Security.requireAdmin();
    ensureSheets();
    options = options || {};
    const environment = options.environment || PropertiesService.getScriptProperties().getProperty('REOS_ENVIRONMENT') || 'Production';
    const metrics = collectMetrics_();
    const alerts = evaluateAlerts_(metrics);
    const critical = alerts.filter(function (a) { return a.Severity === 'Critical'; }).length;
    const warnings = alerts.filter(function (a) { return a.Severity !== 'Critical'; }).length;
    const score = Math.max(0, 100 - critical * 25 - warnings * 5);
    const status = critical ? 'Critical' : warnings ? 'Warning' : 'Healthy';

    const snapshot = REOS.Database.insert(SNAPSHOTS_SHEET, {
      Environment: environment,
      Status: status,
      Score: score,
      'Critical Alerts': critical,
      Warnings: warnings,
      'Metrics JSON': REOS.toJson_(metrics),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: SNAPSHOT_ID_FIELD, idPrefix: 'MON' });
    const snapshotId = snapshot[SNAPSHOT_ID_FIELD];

    metrics.forEach(function (m) { persistMetric_(snapshotId, m); });
    alerts.forEach(function (a) { persistAlert_(snapshotId, a); });
    REOS.Logger.audit('Production monitoring snapshot completed', { snapshotId: snapshotId, status: status, score: score });
    return { ok: true, snapshotId: snapshotId, environment: environment, status: status, score: score, criticalAlerts: critical, warnings: warnings, metrics: metrics, alerts: alerts, generatedAt: REOS.nowIso_() };
  }

  function getSnapshotAlerts(snapshotId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(ALERTS_SHEET).filter(function (row) { return row[SNAPSHOT_ID_FIELD] === snapshotId; });
  }

  function getSnapshotMetrics(snapshotId) {
    REOS.Security.requireAdmin();
    ensureSheets();
    return REOS.Database.getAll(METRICS_SHEET).filter(function (row) { return row[SNAPSHOT_ID_FIELD] === snapshotId; });
  }

  function collectMetrics_() {
    const metrics = [];
    metrics.push(metric_('Core', 'Required Sheet Health', safeBool_(function () { return REOS.healthCheck_().ok; }) ? 1 : 0, 1));
    metrics.push(metric_('Automation', 'Project Triggers', safeNumber_(function () { return ScriptApp.getProjectTriggers().length; }, 0), 20));
    metrics.push(metric_('Logs', 'System Log Rows', sheetRows_(safeSheetName_(function () { return REOS.CONFIG.SHEETS.SYSTEM_LOG; }, 'SYSTEM_LOG')), 50000));
    metrics.push(metric_('AI', 'AI Agent Count', sheetRows_('AI_AGENTS'), 1, 'min'));
    metrics.push(metric_('AI', 'Failed Agent Runs', countRows_('AI_AGENT_RUNS', function (r) { return String(r.Status || '') === 'Error'; }), 5));
    metrics.push(metric_('Documents', 'Document Records', sheetRows_('DOCUMENTS'), 100000));
    metrics.push(metric_('Exports', 'Dashboard Export Records', sheetRows_('DASHBOARD_EXPORTS'), 10000));
    metrics.push(metric_('Deployment', 'Deployment Runs', sheetRows_('DEPLOYMENT_RUNS'), 1, 'min'));
    metrics.push(metric_('Validation', 'Operational Validation Runs', sheetRows_('OPERATIONAL_VALIDATION_RUNS'), 1, 'min'));
    metrics.push(metric_('Hardening', 'Hardening Reports', sheetRows_('HARDENING_REPORTS'), 1, 'min'));
    return metrics;
  }

  function evaluateAlerts_(metrics) {
    return metrics.filter(function (m) { return m.Status !== 'Pass'; }).map(function (m) {
      const criticalAreas = ['Core', 'Security', 'Deployment'];
      return { Area: m.Area, Severity: criticalAreas.indexOf(m.Area) !== -1 ? 'Critical' : 'Warning', Status: 'Open', Message: m.Metric + ' is outside threshold. Value: ' + m.Value + ', Threshold: ' + m.Threshold, Details: m };
    });
  }

  function metric_(area, metric, value, threshold, mode) {
    mode = mode || 'max';
    const pass = mode === 'min' ? Number(value) >= Number(threshold) : Number(value) <= Number(threshold);
    return { Area: area, Metric: metric, Value: value, Threshold: threshold, Status: pass ? 'Pass' : 'Warn' };
  }

  function persistMetric_(snapshotId, metric) {
    return REOS.Database.insert(METRICS_SHEET, { [SNAPSHOT_ID_FIELD]: snapshotId, Area: metric.Area, Metric: metric.Metric, Value: metric.Value, Threshold: metric.Threshold, Status: metric.Status, 'Created At': new Date(), 'Updated At': new Date() }, { idField: METRIC_ID_FIELD, idPrefix: 'MMET' });
  }

  function persistAlert_(snapshotId, alert) {
    return REOS.Database.insert(ALERTS_SHEET, { [SNAPSHOT_ID_FIELD]: snapshotId, Area: alert.Area, Severity: alert.Severity, Status: alert.Status, Message: alert.Message, 'Details JSON': REOS.toJson_(alert.Details || {}), 'Created At': new Date(), 'Updated At': new Date() }, { idField: ALERT_ID_FIELD, idPrefix: 'MALT' });
  }

  function sheetRows_(sheetName) {
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
    } catch (error) { return 0; }
  }

  function countRows_(sheetName, predicate) {
    try { return REOS.Database.getAll(sheetName).filter(predicate).length; } catch (error) { return 0; }
  }

  function safeBool_(fn) { try { return !!fn(); } catch (error) { return false; } }
  function safeNumber_(fn, fallback) { try { return Number(fn()); } catch (error) { return fallback || 0; } }
  function safeSheetName_(fn, fallback) { try { return fn() || fallback; } catch (error) { return fallback; } }
  function latest_(records, dateField, limit) { return (records || []).slice().sort(function (a, b) { return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0); }).slice(0, limit || 25); }

  return { ensureSheets: ensureSheets, getDashboard: getDashboard, runSnapshot: runSnapshot, getSnapshotAlerts: getSnapshotAlerts, getSnapshotMetrics: getSnapshotMetrics };
})();

function reosProductionMonitoringEnsureSheets() { return REOS.ProductionMonitoring.ensureSheets(); }
function reosProductionMonitoringDashboard() { return REOS.ProductionMonitoring.getDashboard(); }
function reosProductionMonitoringRun(options) { return REOS.ProductionMonitoring.runSnapshot(options || {}); }
function reosProductionMonitoringAlerts(snapshotId) { return REOS.ProductionMonitoring.getSnapshotAlerts(snapshotId); }
function reosProductionMonitoringMetrics(snapshotId) { return REOS.ProductionMonitoring.getSnapshotMetrics(snapshotId); }
function showProductionMonitoring() {
  REOS.Security.requireAdmin();
  const html = HtmlService.createHtmlOutputFromFile('ProductionMonitoringUI').setTitle('REOS Production Monitoring').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Production Monitoring');
}
