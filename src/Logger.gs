/**
 * REOS Enterprise v3.2.7 - Logger Framework
 */

var REOS = REOS || {};

REOS.Logger = (function () {
  function ensureLogSheet_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const name = REOS.CONFIG && REOS.CONFIG.SHEETS ? REOS.CONFIG.SHEETS.SYSTEM_LOG : 'SYSTEM_LOG';
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Level', 'User', 'Action', 'Details']);
      sheet.setFrozenRows(1);
      sheet.getRange('A1:E1').setFontWeight('bold');
    }
    return sheet;
  }

  function write(level, action, details) {
    try {
      const user = REOS.getCurrentUser_ ? REOS.getCurrentUser_() : 'unknown';
      const detailsJson = REOS.toJson_ ? REOS.toJson_(details || {}) : JSON.stringify(details || {});
      ensureLogSheet_().appendRow([new Date(), String(level || 'INFO').toUpperCase(), user, action || '', detailsJson]);
    } catch (error) {
      console.error('Logger write failed: ' + error.message);
    }
  }

  function info(action, details) { write('INFO', action, details); }
  function warn(action, details) { write('WARN', action, details); }
  function debug(action, details) { write('DEBUG', action, details); }
  function audit(action, details) { write('AUDIT', action, details); }
  function error(action, err, details) {
    const payload = Object.assign({}, details || {}, {
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : ''
    });
    write('ERROR', action, payload);
  }
  function time(label) {
    const startedAt = Date.now();
    return { end: function (details) { info(label, Object.assign({}, details || {}, { elapsedMs: Date.now() - startedAt })); } };
  }

  return { write: write, info: info, warn: warn, debug: debug, error: error, audit: audit, time: time };
})();
