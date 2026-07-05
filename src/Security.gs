/**
 * REOS Enterprise v3.0 - Security Framework
 *
 * Handles users, roles, permission checks, audit reporting, and access control.
 * Google Sheets sharing permissions remain the final access boundary.
 */

var REOS = REOS || {};

REOS.Security = (function () {
  const STATUS_ACTIVE = 'Active';
  const STATUS_INACTIVE = 'Inactive';

  const ROLE_PERMISSIONS = {};
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.ADMIN] = ['*'];
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.AGENT] = [
    'crm:read', 'crm:write',
    'leads:read', 'leads:write',
    'tasks:read', 'tasks:write',
    'activities:read', 'activities:write',
    'vendors:read', 'vendors:write',
    'workorders:read', 'workorders:write'
  ];
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.COORDINATOR] = [
    'crm:read', 'leads:read',
    'tasks:read', 'tasks:write',
    'activities:read', 'activities:write',
    'documents:read', 'documents:write',
    'vendors:read', 'vendors:write',
    'workorders:read', 'workorders:write'
  ];
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.ASSISTANT] = [
    'crm:read', 'leads:read', 'tasks:read',
    'activities:read', 'activities:write',
    'vendors:read', 'workorders:read'
  ];
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.ACCOUNTANT] = [
    'reports:read', 'settings:read', 'vendors:read', 'workorders:read'
  ];

  function getCurrentUserEmail() {
    return REOS.normalizeEmail_(REOS.getCurrentUser_());
  }

  function getAllUsers() {
    return REOS.Database.getAll(REOS.CONFIG.SHEETS.USERS);
  }

  function findByEmail(email) {
    const normalized = REOS.normalizeEmail_(email);
    return getAllUsers().find(function (user) {
      return REOS.normalizeEmail_(user.Email) === normalized;
    }) || null;
  }

  function getCurrentUser() {
    const email = getCurrentUserEmail();
    const user = findByEmail(email);
    if (!user) {
      return { Email: email, Role: REOS.CONFIG.ROLES.AGENT, Status: 'Unregistered', Permissions: '' };
    }
    return user;
  }

  function seedAdminIfEmpty() {
    const users = getAllUsers();
    if (users.length > 0) return null;

    const email = getCurrentUserEmail();
    const record = {
      'User ID': REOS.generateId_(REOS.CONFIG.IDS.USER || 'U'),
      'Name': email === 'unknown' ? 'Initial Admin' : email,
      'Email': email,
      'Role': REOS.CONFIG.ROLES.ADMIN,
      'Status': STATUS_ACTIVE,
      'Created At': new Date(),
      'Updated At': new Date()
    };

    const sheet = REOS.Database.getSheet(REOS.CONFIG.SHEETS.USERS);
    sheet.appendRow(REOS.Database.objectToRow(REOS.Schema.USERS, record));
    REOS.Logger.info('Initial admin seeded', { email: email });
    return record;
  }

  function getAvailableRoles() {
    return Object.keys(ROLE_PERMISSIONS).map(function (role) {
      return { role: role, permissions: ROLE_PERMISSIONS[role] };
    });
  }

  function createUser(user) {
    requireAdmin();
    user = user || {};
    if (!user.Email || !REOS.isValidEmail_(user.Email)) throw new Error('Valid user email is required.');
    if (findByEmail(user.Email)) throw new Error('User already exists: ' + user.Email);

    const created = REOS.Database.insert(REOS.CONFIG.SHEETS.USERS, {
      'User ID': user['User ID'] || REOS.generateId_(REOS.CONFIG.IDS.USER || 'U'),
      'Name': user.Name || user.Email,
      'Email': REOS.normalizeEmail_(user.Email),
      'Role': user.Role || REOS.CONFIG.ROLES.ASSISTANT,
      'Status': user.Status || STATUS_ACTIVE,
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'User ID', idPrefix: REOS.CONFIG.IDS.USER || 'U' });

    audit('User created', { email: created.Email, role: created.Role });
    return created;
  }

  function updateUser(email, changes) {
    requireAdmin();
    const user = findByEmail(email);
    if (!user) throw new Error('User not found: ' + email);
    changes = changes || {};
    changes['Updated At'] = new Date();
    const updated = REOS.Database.update(REOS.CONFIG.SHEETS.USERS, 'User ID', user['User ID'], changes);
    audit('User updated', { email: email, changes: changes });
    return updated;
  }

  function setUserRole(email, role) {
    if (!ROLE_PERMISSIONS[role]) throw new Error('Invalid role: ' + role);
    return updateUser(email, { Role: role });
  }

  function deactivateUser(email) {
    return updateUser(email, { Status: STATUS_INACTIVE });
  }

  function activateUser(email) {
    return updateUser(email, { Status: STATUS_ACTIVE });
  }

  function isActiveUser(user) {
    return !!user && String(user.Status || '').trim() === STATUS_ACTIVE;
  }

  function parsePermissions_(value) {
    if (Array.isArray(value)) return value;
    return String(value || '').split(',').map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function getRolePermissions(role) {
    return ROLE_PERMISSIONS[role] || [];
  }

  function getUserPermissions(user) {
    user = user || getCurrentUser();
    return getRolePermissions(user.Role).concat(parsePermissions_(user.Permissions || ''));
  }

  function hasPermission(permission, user) {
    user = user || getCurrentUser();
    if (!isActiveUser(user)) return false;
    const permissions = getUserPermissions(user);
    return permissions.indexOf('*') !== -1 || permissions.indexOf(permission) !== -1;
  }

  function requirePermission(permission) {
    const user = getCurrentUser();
    if (!hasPermission(permission, user)) {
      REOS.Logger.warn('Permission denied', {
        permission: permission,
        user: user.Email || getCurrentUserEmail(),
        role: user.Role || 'Unknown'
      });
      throw new Error('Permission denied: ' + permission);
    }
    return true;
  }

  function requireAdmin() {
    const user = getCurrentUser();
    if (!hasPermission('*', user)) {
      REOS.Logger.warn('Admin permission denied', { user: user.Email || getCurrentUserEmail(), role: user.Role || 'Unknown' });
      throw new Error('Admin permission required.');
    }
    return true;
  }

  function audit(action, details) {
    REOS.Logger.info('SECURITY: ' + action, details || {});
  }

  function getAuditReport(options) {
    requireAdmin();
    options = options || {};
    const limit = Number(options.limit || 100);
    const logs = getSystemLogs_();
    const securityLogs = logs.filter(function (log) {
      const action = String(log.Action || '');
      const level = String(log.Level || '');
      return action.indexOf('SECURITY:') === 0 || action.indexOf('Permission denied') !== -1 || action.indexOf('Admin permission denied') !== -1 || level === 'AUDIT';
    });
    const permissionDenied = logs.filter(function (log) {
      return String(log.Action || '').indexOf('Permission denied') !== -1 || String(log.Action || '').indexOf('Admin permission denied') !== -1 || String(log.Details || '').indexOf('Permission denied') !== -1;
    });
    const byUser = groupCount_(securityLogs, 'User');
    const byAction = groupCount_(securityLogs, 'Action');
    const users = getAllUsers();

    return {
      ok: true,
      generatedAt: REOS.nowIso_(),
      summary: {
        users: users.length,
        activeUsers: users.filter(function (user) { return user.Status === STATUS_ACTIVE; }).length,
        inactiveUsers: users.filter(function (user) { return user.Status === STATUS_INACTIVE; }).length,
        securityEvents: securityLogs.length,
        permissionDenied: permissionDenied.length
      },
      byUser: byUser,
      byAction: byAction,
      recentSecurityEvents: latest_(securityLogs, 'Timestamp', limit),
      permissionDeniedEvents: latest_(permissionDenied, 'Timestamp', limit),
      users: users.map(function (user) {
        return {
          'User ID': user['User ID'],
          Name: user.Name,
          Email: user.Email,
          Role: user.Role,
          Status: user.Status,
          Permissions: getUserPermissions(user).join(', '),
          'Created At': user['Created At'],
          'Updated At': user['Updated At']
        };
      })
    };
  }

  function getUserAudit(email, limit) {
    requireAdmin();
    const normalized = REOS.normalizeEmail_(email);
    const logs = getSystemLogs_().filter(function (log) {
      return REOS.normalizeEmail_(log.User) === normalized || String(log.Details || '').toLowerCase().indexOf(normalized) !== -1;
    });
    return { ok: true, email: normalized, events: latest_(logs, 'Timestamp', Number(limit || 100)) };
  }

  function getSystemLogs_() {
    try {
      return REOS.Database.getAll(REOS.CONFIG.SHEETS.SYSTEM_LOG);
    } catch (error) {
      return [];
    }
  }

  function groupCount_(records, field) {
    return (records || []).reduce(function (map, record) {
      const key = String(record[field] || 'Unknown');
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
  }

  function latest_(records, dateField, limit) {
    return (records || []).slice().sort(function (a, b) {
      return (new Date(b[dateField] || 0).getTime() || 0) - (new Date(a[dateField] || 0).getTime() || 0);
    }).slice(0, limit || 100);
  }

  return {
    STATUS_ACTIVE: STATUS_ACTIVE,
    STATUS_INACTIVE: STATUS_INACTIVE,
    ROLE_PERMISSIONS: ROLE_PERMISSIONS,
    getCurrentUserEmail: getCurrentUserEmail,
    getCurrentUser: getCurrentUser,
    getAllUsers: getAllUsers,
    findByEmail: findByEmail,
    seedAdminIfEmpty: seedAdminIfEmpty,
    getAvailableRoles: getAvailableRoles,
    createUser: createUser,
    updateUser: updateUser,
    setUserRole: setUserRole,
    deactivateUser: deactivateUser,
    activateUser: activateUser,
    isActiveUser: isActiveUser,
    getRolePermissions: getRolePermissions,
    getUserPermissions: getUserPermissions,
    hasPermission: hasPermission,
    requirePermission: requirePermission,
    requireAdmin: requireAdmin,
    audit: audit,
    getAuditReport: getAuditReport,
    getUserAudit: getUserAudit
  };
})();

REOS.Users = REOS.Security;

function reosWhoAmI() { return REOS.Security.getCurrentUser(); }
function reosRequireAdmin() { return REOS.Security.requireAdmin(); }

function reosAdminGetUsers() {
  REOS.Security.requireAdmin();
  return { users: REOS.Security.getAllUsers(), roles: REOS.Security.getAvailableRoles(), currentUser: REOS.Security.getCurrentUser() };
}

function reosAdminCreateUser(user) { return REOS.Security.createUser(user || {}); }
function reosAdminSetUserRole(email, role) { return REOS.Security.setUserRole(email, role); }
function reosAdminDeactivateUser(email) { return REOS.Security.deactivateUser(email); }
function reosAdminActivateUser(email) { return REOS.Security.activateUser(email); }
function reosAdminGetAuditReport(options) { return REOS.Security.getAuditReport(options || {}); }
function reosAdminGetUserAudit(email, limit) { return REOS.Security.getUserAudit(email, limit || 100); }
