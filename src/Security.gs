/**
 * REOS Enterprise v3.0 - Security Framework
 *
 * Role-aware access helpers for Apps Script operations.
 * Note: Google Sheets permissions are still the ultimate access boundary.
 */

var REOS = REOS || {};

REOS.Security = (function () {
  const ROLE_PERMISSIONS = {};

  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.ADMIN] = ['*'];
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.AGENT] = [
    'crm:read', 'crm:write',
    'leads:read', 'leads:write',
    'tasks:read', 'tasks:write',
    'transactions:read'
  ];
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.COORDINATOR] = [
    'crm:read',
    'tasks:read', 'tasks:write',
    'transactions:read', 'transactions:write',
    'documents:read', 'documents:write'
  ];
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.ASSISTANT] = [
    'crm:read', 'crm:write',
    'leads:read', 'leads:write',
    'tasks:read', 'tasks:write'
  ];
  ROLE_PERMISSIONS[REOS.CONFIG.ROLES.ACCOUNTANT] = [
    'finance:read', 'finance:write',
    'reports:read'
  ];

  function getCurrentUserEmail() {
    return String(Session.getActiveUser().getEmail() || '').toLowerCase();
  }

  function getCurrentUser() {
    const email = getCurrentUserEmail();
    if (!email) {
      return {
        email: '',
        role: REOS.CONFIG.ROLES.AGENT,
        status: 'Unknown',
        permissions: []
      };
    }

    if (!REOS.Users || !REOS.Users.findByEmail) {
      return {
        email: email,
        role: REOS.CONFIG.ROLES.ADMIN,
        status: 'Active',
        permissions: ['*']
      };
    }

    const user = REOS.Users.findByEmail(email);
    if (!user) {
      return {
        email: email,
        role: REOS.CONFIG.ROLES.AGENT,
        status: 'Unregistered',
        permissions: []
      };
    }

    return user;
  }

  function hasPermission(permission) {
    const user = getCurrentUser();
    if (String(user.Status || user.status || '').toLowerCase() === 'inactive') return false;

    const role = user.Role || user.role || REOS.CONFIG.ROLES.AGENT;
    const rolePermissions = ROLE_PERMISSIONS[role] || [];
    const explicitPermissions = parsePermissions_(user.Permissions || user.permissions || '');
    const permissions = rolePermissions.concat(explicitPermissions);

    return permissions.indexOf('*') !== -1 || permissions.indexOf(permission) !== -1;
  }

  function requirePermission(permission) {
    if (!hasPermission(permission)) {
      REOS.Logger.warn('Permission denied', {
        permission: permission,
        user: getCurrentUserEmail()
      });
      throw new Error('Permission denied: ' + permission);
    }
    return true;
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

  return {
    getCurrentUserEmail: getCurrentUserEmail,
    getCurrentUser: getCurrentUser,
    hasPermission: hasPermission,
    requirePermission: requirePermission,
    getRolePermissions: getRolePermissions
  };
})();
