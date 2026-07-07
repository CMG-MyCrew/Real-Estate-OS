/**
 * REOS Enterprise v3.2.10 - Environment Validator
 * Sprint 3 Increment 3
 *
 * Validates Apps Script runtime services, spreadsheet metadata,
 * script properties, triggers, timezone alignment, and authorization access.
 */

var REOS = REOS || {};

REOS.EnvironmentValidator = (function () {
  const ENVIRONMENT_SHEET = 'SYSTEM_ENVIRONMENT';
  const HISTORY_SHEET = 'SYSTEM_ENVIRONMENT_HISTORY';

  const ENVIRONMENT_HEADERS = ['Key', 'Value', 'Status', 'Severity', 'Message', 'Details JSON', 'Updated At'];
  const HISTORY_HEADERS = ['Environment Run ID', 'Version', 'Environment', 'Status', 'Authorization', 'Warnings', 'Errors', 'Duration Ms', 'Summary JSON', 'Created At'];

  function ensureSheets() {
    REOS.Database.ensureTable(ENVIRONMENT_SHEET, ENVIRONMENT_HEADERS);
    REOS.Database.ensureTable(HISTORY_SHEET, HISTORY_HEADERS);
  }

  function run() {
    ensureSheets();
    const started = Date.now();
    const runId = REOS.generateId_('ENV');
    const warnings = [];
    const errors = [];

    const report = {
      ok: true,
      runId: runId,
      version: getVersion_(),
      environment: getEnvironment_(),
      authorization: 'Granted',
      generatedAt: new Date().toISOString(),
      scriptProperties: checkScriptProperties(warnings, errors),
      spreadsheet: checkSpreadsheet(warnings, errors),
      timezone: checkTimezone(warnings, errors),
      services: checkServices(warnings, errors),
      triggers: checkTriggers(warnings, errors),
      authorizationChecks: checkAuthorization(warnings, errors),
      warnings: warnings,
      errors: errors,
      durationMs: 0
    };

    report.ok = errors.length === 0;
    report.authorization = report.authorizationChecks.ok ? 'Granted' : 'Needs Authorization';
    report.durationMs = Date.now() - started;

    persistLatest_(report);
    persistHistory_(report);

    if (REOS.Logger && REOS.Logger.info) REOS.Logger.info('Environment validation completed', { ok: report.ok, warnings: warnings.length, errors: errors.length });
    return report;
  }

  function checkScriptProperties(warnings, errors) {
    const required = ['REOS_VERSION', 'REOS_CORE_VERSION', 'REOS_ENVIRONMENT', 'REOS_SELF_HEALING_ENABLED'];
    const props = PropertiesService.getScriptProperties();
    const values = {};
    required.forEach(function (key) {
      const value = props.getProperty(key);
      values[key] = value || '';
      if (!value) warnings.push({ category: 'ScriptProperties', key: key, message: 'Missing script property: ' + key });
    });
    return { ok: required.every(function (key) { return !!values[key]; }), required: required, values: values };
  }

  function checkSpreadsheet(warnings, errors) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheets = ss.getSheets().map(function (sheet) { return sheet.getName(); });
      const missing = [];
      Object.keys(REOS.CONFIG.SHEETS || {}).forEach(function (key) {
        const sheetName = REOS.CONFIG.SHEETS[key];
        if (sheets.indexOf(sheetName) === -1) missing.push(sheetName);
      });
      missing.forEach(function (sheetName) { warnings.push({ category: 'Spreadsheet', key: sheetName, message: 'Configured sheet is missing: ' + sheetName }); });
      return {
        ok: true,
        id: ss.getId(),
        name: ss.getName(),
        url: ss.getUrl(),
        locale: ss.getSpreadsheetLocale(),
        timezone: ss.getSpreadsheetTimeZone(),
        sheetCount: sheets.length,
        missingSheets: missing
      };
    } catch (error) {
      errors.push({ category: 'Spreadsheet', key: 'ActiveSpreadsheet', message: error.message });
      return { ok: false, error: error.message };
    }
  }

  function checkTimezone(warnings, errors) {
    try {
      const configured = REOS.CONFIG.APP.TIME_ZONE;
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
      const matches = configured === spreadsheet;
      if (!matches) warnings.push({ category: 'Timezone', key: 'Mismatch', message: 'Configured timezone does not match spreadsheet timezone.' });
      return { ok: matches, configured: configured, spreadsheet: spreadsheet, matches: matches };
    } catch (error) {
      errors.push({ category: 'Timezone', key: 'TimezoneCheck', message: error.message });
      return { ok: false, error: error.message };
    }
  }

  function checkServices(warnings, errors) {
    const services = {};
    services.Spreadsheet = probe_('SpreadsheetApp', function () { return !!SpreadsheetApp.getActiveSpreadsheet(); }, warnings, errors, 'Critical');
    services.Properties = probe_('PropertiesService', function () { return !!PropertiesService.getScriptProperties(); }, warnings, errors, 'Critical');
    services.Lock = probe_('LockService', function () { return !!LockService.getScriptLock(); }, warnings, errors, 'High');
    services.Cache = probe_('CacheService', function () { return !!CacheService.getScriptCache(); }, warnings, errors, 'Low');
    services.Html = probe_('HtmlService', function () { return !!HtmlService.createHtmlOutput('ok'); }, warnings, errors, 'Medium');
    services.UrlFetch = probe_('UrlFetchApp', function () { return typeof UrlFetchApp !== 'undefined'; }, warnings, errors, 'Medium');
    services.Drive = probe_('DriveApp', function () { return typeof DriveApp !== 'undefined'; }, warnings, errors, 'Medium');
    services.Gmail = probe_('GmailApp', function () { return typeof GmailApp !== 'undefined'; }, warnings, errors, 'Low');
    services.Calendar = probe_('CalendarApp', function () { return typeof CalendarApp !== 'undefined'; }, warnings, errors, 'Low');
    return services;
  }

  function checkTriggers(warnings, errors) {
    try {
      const triggers = ScriptApp.getProjectTriggers().map(function (trigger) {
        return {
          handlerFunction: trigger.getHandlerFunction(),
          eventType: String(trigger.getEventType()),
          triggerSource: String(trigger.getTriggerSource())
        };
      });
      if (!triggers.length) warnings.push({ category: 'Triggers', key: 'ProjectTriggers', message: 'No project triggers are installed yet.' });
      return { ok: true, count: triggers.length, triggers: triggers };
    } catch (error) {
      warnings.push({ category: 'Triggers', key: 'ProjectTriggers', message: 'Unable to inspect triggers: ' + error.message });
      return { ok: false, error: error.message, count: 0, triggers: [] };
    }
  }

  function checkAuthorization(warnings, errors) {
    const checks = [];
    checks.push(authProbe_('Spreadsheet access', function () { SpreadsheetApp.getActiveSpreadsheet().getId(); }));
    checks.push(authProbe_('Properties access', function () { PropertiesService.getScriptProperties().getKeys(); }));
    checks.push(authProbe_('Trigger access', function () { ScriptApp.getProjectTriggers(); }));
    checks.push(authProbe_('Cache access', function () { CacheService.getScriptCache().put('REOS_ENV_TEST', '1', 10); }));
    checks.push(authProbe_('Lock access', function () { const lock = LockService.getScriptLock(); lock.tryLock(100); if (lock.hasLock()) lock.releaseLock(); }));
    const failed = checks.filter(function (check) { return !check.ok; });
    failed.forEach(function (check) { warnings.push({ category: 'Authorization', key: check.name, message: check.message }); });
    return { ok: failed.length === 0, checks: checks };
  }

  function summary() {
    ensureSheets();
    const history = REOS.Database.getAll(HISTORY_SHEET);
    const latest = history.sort(function (a, b) { return new Date(b['Created At'] || 0).getTime() - new Date(a['Created At'] || 0).getTime(); })[0] || null;
    return { ok: !latest || latest.Status !== 'Fail', latestRun: latest, runCount: history.length };
  }

  function persistLatest_(report) {
    ensureSheets();
    const sheet = REOS.Database.getSheet(ENVIRONMENT_SHEET);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    const rows = [];
    rows.push(row_('Environment', report.environment, report.ok ? 'Pass' : 'Fail', report.ok ? 'Low' : 'Critical', 'Current REOS environment.', {}));
    rows.push(row_('Version', report.version, 'Pass', 'Low', 'Current REOS version.', {}));
    rows.push(row_('Authorization', report.authorization, report.authorization === 'Granted' ? 'Pass' : 'Warn', 'Medium', 'Authorization status.', report.authorizationChecks));
    rows.push(row_('Spreadsheet', report.spreadsheet.name || '', report.spreadsheet.ok ? 'Pass' : 'Fail', 'Critical', 'Spreadsheet status.', report.spreadsheet));
    rows.push(row_('Timezone', report.timezone.configured + ' / ' + report.timezone.spreadsheet, report.timezone.ok ? 'Pass' : 'Warn', 'Medium', 'Timezone alignment.', report.timezone));
    rows.push(row_('Warnings', String(report.warnings.length), report.warnings.length ? 'Warn' : 'Pass', 'Medium', 'Warning count.', report.warnings));
    rows.push(row_('Errors', String(report.errors.length), report.errors.length ? 'Fail' : 'Pass', 'Critical', 'Error count.', report.errors));
    sheet.getRange(2, 1, rows.length, ENVIRONMENT_HEADERS.length).setValues(rows);
  }

  function persistHistory_(report) {
    REOS.Database.insert(HISTORY_SHEET, {
      'Environment Run ID': report.runId,
      Version: report.version,
      Environment: report.environment,
      Status: report.ok ? 'Pass' : 'Fail',
      Authorization: report.authorization,
      Warnings: report.warnings.length,
      Errors: report.errors.length,
      'Duration Ms': report.durationMs,
      'Summary JSON': REOS.toJson_(report),
      'Created At': new Date()
    }, {});
  }

  function row_(key, value, status, severity, message, details) {
    return [key, value, status, severity, message, REOS.toJson_(details || {}), new Date()];
  }

  function probe_(name, fn, warnings, errors, severity) {
    try {
      const ok = !!fn();
      if (!ok) warnings.push({ category: 'Services', key: name, message: name + ' probe returned false.' });
      return ok;
    } catch (error) {
      const target = severity === 'Critical' ? errors : warnings;
      target.push({ category: 'Services', key: name, message: error.message });
      return false;
    }
  }

  function authProbe_(name, fn) {
    try {
      fn();
      return { name: name, ok: true, message: 'Access granted.' };
    } catch (error) {
      return { name: name, ok: false, message: error.message };
    }
  }

  function getEnvironment_() {
    return REOS.getProperty_('REOS_ENVIRONMENT') || 'Production';
  }

  function getVersion_() {
    return REOS.CONFIG && REOS.CONFIG.APP ? REOS.CONFIG.APP.VERSION : 'unknown';
  }

  return {
    ensureSheets: ensureSheets,
    run: run,
    checkScriptProperties: checkScriptProperties,
    checkSpreadsheet: checkSpreadsheet,
    checkTimezone: checkTimezone,
    checkServices: checkServices,
    checkTriggers: checkTriggers,
    checkAuthorization: checkAuthorization,
    summary: summary
  };
})();

function reosRunEnvironmentValidation() {
  const report = REOS.EnvironmentValidator.run();
  SpreadsheetApp.getUi().alert('REOS Environment Validation', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}

function reosEnvironmentSummary() {
  const report = REOS.EnvironmentValidator.summary();
  SpreadsheetApp.getUi().alert('REOS Environment Summary', JSON.stringify(report, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return report;
}
