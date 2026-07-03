/**
 * REOS Enterprise v3.0 - Users Framework
 */

var REOS = REOS || {};

REOS.Users = (function () {
  const SHEET = REOS.CONFIG.SHEETS.USERS;
  const ID_FIELD = 'User ID';

  const HEADERS = [
    'User ID',
    'Name',
    'Email',
    'Role',
    'Phone',
    'Status',
    'Permissions',
    'Created At',
    'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET);
    if (!sheet) sheet = ss.insertSheet(SHEET);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }

    return sheet;
  }

  function seedAdminIfEmpty() {
    ensureSheet();
    const records = REOS.Database.getAll(SHEET);
    if (records.length > 0) return null;

    const email = REOS.Security.getCurrentUserEmail();
    const admin = {
      'Name': email || 'Initial Admin',
      'Email': email,
      'Role': REOS.CONFIG.ROLES.ADMIN,
      'Phone': '',
      'Status': 'Active',
      'Permissions': '*'
    };

    return create(admin);
  }

  function create(user) {
    ensureSheet();

    const validation = REOS.Validation.validateRecord(user, {
      required: ['Email', 'Role', 'Status'],
      emailField: 'Email'
    });

    if (!validation.ok) {
      throw new Error(validation.errors.join(' '));
    }

    const duplicate = findByEmail(user.Email);
    if (duplicate) {
      throw new Error('User already exists for email: ' + user.Email);
    }

    user.Email = REOS.normalizeEmail_(user.Email);

    return REOS.Database.insert(SHEET, user, {
      idField: ID_FIELD,
      idPrefix: 'U'
    });
  }

  function update(userId, changes) {
    ensureSheet();
    if (changes.Email) changes.Email = REOS.normalizeEmail_(changes.Email);
    return REOS.Database.update(SHEET, ID_FIELD, userId, changes);
  }

  function deactivate(userId) {
    return update(userId, { Status: 'Inactive' });
  }

  function findByEmail(email) {
    ensureSheet();
    const normalized = REOS.normalizeEmail_(email);
    if (!normalized) return null;

    const users = REOS.Database.getAll(SHEET);
    return users.find(function (user) {
      return REOS.normalizeEmail_(user.Email) === normalized;
    }) || null;
  }

  function listActive() {
    ensureSheet();
    return REOS.Database.query(SHEET, function (user) {
      return String(user.Status || '').toLowerCase() === 'active';
    });
  }

  return {
    ensureSheet: ensureSheet,
    seedAdminIfEmpty: seedAdminIfEmpty,
    create: create,
    update: update,
    deactivate: deactivate,
    findByEmail: findByEmail,
    listActive: listActive
  };
})();
