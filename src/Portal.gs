/**
 * REOS Enterprise v3.0 - Portal Core Framework
 *
 * Shared portal access-token, session, and access-log foundation for
 * client-facing and future agent/vendor portals.
 */

var REOS = REOS || {};

REOS.Portal = (function () {
  const ACCESS_SHEET = 'PORTAL_ACCESS';
  const LOG_SHEET = 'PORTAL_ACCESS_LOG';
  const ID_FIELD = 'Portal Access ID';

  const ACCESS_HEADERS = [
    'Portal Access ID', 'Record ID', 'Record Type', 'Client ID', 'Client Email',
    'Portal Role', 'Access Token', 'Status', 'Expires At', 'Last Login At',
    'Notes', 'Created At', 'Updated At'
  ];

  const LOG_HEADERS = [
    'Log ID', 'Access Token', 'Client Email', 'Action', 'Record ID',
    'Record Type', 'Status', 'Message', 'Timestamp', 'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(ACCESS_SHEET, ACCESS_HEADERS);
    ensureTable_(LOG_SHEET, LOG_HEADERS);
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

  function createAccess(access) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();

    access = access || {};
    access['Client Email'] = REOS.normalizeEmail_(access['Client Email']);
    access['Portal Role'] = access['Portal Role'] || 'Client';
    access.Status = access.Status || 'Active';
    access['Access Token'] = access['Access Token'] || generateToken_();
    access['Expires At'] = access['Expires At'] || defaultExpiration_();

    const validation = REOS.Validation.validateRecord(access, {
      required: ['Record ID', 'Record Type', 'Client Email'],
      emailField: 'Client Email',
      dateFields: ['Expires At', 'Last Login At']
    });
    if (!validation.ok) throw new Error(validation.errors.join(' '));

    const created = REOS.Database.insert(ACCESS_SHEET, access, {
      idField: ID_FIELD,
      idPrefix: 'PA'
    });

    REOS.Logger.audit('Portal access created', { portalAccessId: created[ID_FIELD], recordId: created['Record ID'] });
    return created;
  }

  function authenticate(token, email) {
    ensureSheets();
    token = String(token || '').trim();
    email = REOS.normalizeEmail_(email);

    const access = REOS.Database.query(ACCESS_SHEET, function (row) {
      return String(row['Access Token'] || '') === token &&
        REOS.normalizeEmail_(row['Client Email']) === email &&
        String(row.Status || '').toLowerCase() === 'active';
    })[0];

    if (!access) {
      logAccess_(token, email, 'login', '', '', 'Denied', 'Invalid portal credentials.');
      throw new Error('Invalid portal credentials.');
    }

    if (isExpired_(access['Expires At'])) {
      logAccess_(token, email, 'login', access['Record ID'], access['Record Type'], 'Denied', 'Portal access expired.');
      throw new Error('Portal access expired.');
    }

    REOS.Database.update(ACCESS_SHEET, ID_FIELD, access[ID_FIELD], { 'Last Login At': new Date() });
    logAccess_(token, email, 'login', access['Record ID'], access['Record Type'], 'Success', 'Portal login successful.');
    return access;
  }

  function validateAccess(token, email) {
    return authenticate(token, email);
  }

  function revokeAccess(portalAccessId) {
    REOS.Security.requirePermission('documents:write');
    ensureSheets();
    return REOS.Database.update(ACCESS_SHEET, ID_FIELD, portalAccessId, { Status: 'Revoked' });
  }

  function listActiveAccess() {
    REOS.Security.requirePermission('documents:read');
    ensureSheets();
    return REOS.Database.query(ACCESS_SHEET, function (row) {
      return String(row.Status || '').toLowerCase() === 'active';
    });
  }

  function logAccess_(token, email, action, recordId, recordType, status, message) {
    try {
      REOS.Database.insert(LOG_SHEET, {
        'Access Token': token || '',
        'Client Email': email || '',
        Action: action || '',
        'Record ID': recordId || '',
        'Record Type': recordType || '',
        Status: status || '',
        Message: message || '',
        Timestamp: new Date()
      }, {
        idField: 'Log ID',
        idPrefix: 'PL'
      });
    } catch (error) {
      REOS.Logger.warn('Portal access log failed', { error: error.message });
    }
  }

  function generateToken_() {
    return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  }

  function defaultExpiration_() {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return date;
  }

  function isExpired_(value) {
    if (!value) return false;
    const date = value instanceof Date ? value : new Date(value);
    return !isNaN(date.getTime()) && date.getTime() < Date.now();
  }

  return {
    ensureSheets: ensureSheets,
    createAccess: createAccess,
    authenticate: authenticate,
    validateAccess: validateAccess,
    revokeAccess: revokeAccess,
    listActiveAccess: listActiveAccess
  };
})();

function portalCreateAccess(access) { return REOS.Portal.createAccess(access); }
function portalListActiveAccess() { return REOS.Portal.listActiveAccess(); }
