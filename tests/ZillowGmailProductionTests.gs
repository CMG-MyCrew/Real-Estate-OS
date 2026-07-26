/**
 * REOS Zillow Gmail Production Runtime smoke tests.
 * These tests are safe: they do not send email or create leads.
 */
function reosTestZillowGmailProductionReadiness() {
  var checks = [];
  function check(name, pass, details) {
    checks.push({ name: name, pass: !!pass, details: details || '' });
  }

  check('Production module loaded', !!REOS.ZillowGmailProduction, 'Expected REOS.ZillowGmailProduction');
  check('Base connector loaded', !!REOS.ZillowGmailConnector, 'Expected REOS.ZillowGmailConnector');
  check('Production sync installed', !!REOS.ZillowGmailConnector && typeof REOS.ZillowGmailConnector.sync === 'function');
  check('Parser available', !!REOS.ZillowGmailConnector && typeof REOS.ZillowGmailConnector.parseMessage_ === 'function');
  check('Connector registry available', !!REOS.ConnectorRegistry);
  check('Database available', !!REOS.Database);
  check('Ingestion orchestrator available', !!REOS.AcquisitionIngestionOrchestrator);

  var sheetResult = null;
  try {
    sheetResult = REOS.ZillowGmailProduction.ensureSheets();
    check('Production sheets ensured', !!sheetResult && sheetResult.ok === true, JSON.stringify(sheetResult));
  } catch (error) {
    check('Production sheets ensured', false, error.message || String(error));
  }

  var statusResult = null;
  try {
    statusResult = REOS.ZillowGmailProduction.status();
    check('Production status readable', !!statusResult && statusResult.version === '4.5.1', JSON.stringify(statusResult));
  } catch (error2) {
    check('Production status readable', false, error2.message || String(error2));
  }

  var failed = checks.filter(function (item) { return !item.pass; });
  return {
    ok: failed.length === 0,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks: checks,
    status: statusResult
  };
}
