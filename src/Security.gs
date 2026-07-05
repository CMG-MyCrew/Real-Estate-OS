/**
 * REOS Enterprise v3.0 - Security Framework
 *
 * Handles users, roles, permission checks, and audit-friendly access control.
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
    'crm:read',
    'leads:read',
    'tasks:read', 'tasks:write',
    'activities:read', 'activities:write',
    'documents:read', 'documents:write',
    'vendors:read', 'vendors:write',
    'workorders:read', 'workorders:write'
  ];
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.ASSISTANT] = [
    'crm:read',
    'leads:read',
    'tasks:read',
    'activities:read', 'activities:write',
    'vendors:read',
    'workorders:read'
  ];
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.ACCOUNTANT] = [
    'reports:read',
    'settings:read',
    'vendors:read',
    'workorders:read'
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
      return {
        Email: email,
        Role: REOS.CONFIG.ROLES.AGENT,
        Status: 'Unregistered',
        Permissions: ''
      };
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
      return {
        role: role,
        permissions: ROLE_PERMISSIONS[role]
      };
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
    return String(value || '')
      .split(',')
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function getRolePermissions(role) {
    return ROLE_PERMISSIONS[role] || [];
  }

  function getUserPermissions(user) {
    user = user || getCurrentUser();
    const rolePermissions = getRolePermissions(user.Role);
    const explicitPermissions = parsePermissions_(user.Permissions || '');
    return rolePermissions.concat(explicitPermissions);
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
    audit: audit
  };
})();

REOS.Users = REOS.Security;

function reosWhoAmI() {
  return REOS.Security.getCurrentUser();
}

function reosRequireAdmin() {
  return REOS.Security.requireAdmin();
}

function reosAdminGetUsers() {
  REOS.Security.requireAdmin();
  return {
    users: REOS.Security.getAllUsers(),
    roles: REOS.Security.getAvailableRoles(),
    currentUser: REOS.Security.getCurrentUser()
  };
}

function reosAdminCreateUser(user) {
  return REOS.Security.createUser(user || {});
}

function reosAdminSetUserRole(email, role) {
  return REOS.Security.setUserRole(email, role);
}

function reosAdminDeactivateUser(email) {
  return REOS.Security.deactivateUser(email);
}

function reosAdminActivateUser(email) {
  return REOS.Security.activateUser(email);
}
