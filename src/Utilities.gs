/**
 * REOS Enterprise v3.0 - Shared Utilities
 */

var REOS = REOS || {};

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

REOS.getSheet_ = function (sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Required sheet not found: ' + sheetName);
  return sheet;
};

REOS.generateId_ = function (prefix) {
  const timestamp = Utilities.formatDate(new Date(), REOS.CONFIG.APP.TIME_ZONE, 'yyyyMMddHHmmss');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return prefix + '-' + timestamp + '-' + random;
};

REOS.normalizeEmail_ = function (email) {
  return String(email || '').trim().toLowerCase();
};

REOS.normalizePhone_ = function (phone) {
  return String(phone || '').replace(/\D/g, '');
};

REOS.isValidEmail_ = function (email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(REOS.normalizeEmail_(email));
};

REOS.nowIso_ = function () {
  return new Date().toISOString();
};

REOS.getCurrentUser_ = function () {
  try {
    return Session.getActiveUser().getEmail() || 'unknown';
  } catch (error) {
    return 'unknown';
  }
};

REOS.toJson_ = function (value) {
  try {
    return JSON.stringify(value || {});
  } catch (error) {
    return JSON.stringify({ serializationError: error.message });
  }
};

REOS.handleError_ = function (source, error) {
  console.error(source + ': ' + error.message, error);
  REOS.log_('ERROR', source, { message: error.message, stack: error.stack || '' });
};

REOS.log_ = function (level, action, details) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(REOS.CONFIG.SHEETS.SYSTEM_LOG);
    if (!sheet) return;
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Level', 'User', 'Action', 'Details']);
      REOS.applyDefaultSheetStyle_(sheet);
    }
    sheet.appendRow([REOS.nowIso_(), level, REOS.getCurrentUser_(), action, REOS.toJson_(details)]);
  } catch (e) {
    console.error('Logging failed: ' + e.message);
  }
};

REOS.Logger = {
  debug: function (action, details) {
    REOS.log_('DEBUG', action, details);
  },
  info: function (action, details) {
    REOS.log_('INFO', action, details);
  },
  warn: function (action, details) {
    REOS.log_('WARN', action, details);
  },
  error: function (action, details) {
    REOS.log_('ERROR', action, details);
  },
  audit: function (action, details) {
    REOS.log_('AUDIT', action, details);
  }
};
