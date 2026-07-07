/**
 * REOS Enterprise v3.3.2 - Plugin Permission Enforcement
 * Sprint 4 Increment 3
 *
 * Centralized authorization for plugin access, capabilities, roles,
 * menu visibility support, and access auditing.
 */

var REOS = REOS || {};

REOS.PluginSecurity = (function () {
  var USER_ROLES_SHEET = 'USER_ROLES';
  var ROLE_PERMISSIONS_SHEET = 'ROLE_PERMISSIONS';
  var PLUGIN_PERMISSIONS_SHEET = 'PLUGIN_PERMISSIONS';
  var ACCESS_AUDIT_SHEET = 'ACCESS_AUDIT';

  var USER_ROLE_HEADERS = ['User Role ID', 'Email', 'Role', 'Status', 'Created At', 'Updated At'];
  var ROLE_PERMISSION_HEADERS = ['Role Permission ID', 'Role', 'Permission Type', 'Permission Name', 'Allowed', 'Created At', 'Updated At'];
  var PLUGIN_PERMISSION_HEADERS = ['Plugin Permission ID', 'Plugin Key', 'Role', 'Allowed', 'Created At', 'Updated At'];
  var ACCESS_AUDIT_HEADERS = ['Access ID', 'Timestamp', 'Email', 'Plugin Key', 'Capability Type', 'Capability Name', 'Granted', 'Reason', 'Details JSON'];

  var ROLE_HIERARCHY = {
    Owner: ['Admin', 'Manager', 'Accountant', 'Agent', 'Vendor', 'Investor', 'Client', 'Lender', 'Inspector', 'Contractor', 'ReadOnly'],
    Admin: ['Manager', 'Accountant', 'Agent', 'Vendor', 'Investor', 'Client', 'Lender', 'Inspector', 'Contractor', 'ReadOnly'],
    Manager: ['Agent', 'Vendor', 'Investor', 'Client', 'Lender', 'Inspector', 'Contractor', 'ReadOnly'],
    Accountant: ['ReadOnly'],
    Agent: ['ReadOnly'],
    Vendor: ['ReadOnly'],
    Investor: ['ReadOnly'],
    Client: ['ReadOnly'],
    Lender: ['ReadOnly'],
    Inspector: ['ReadOnly'],
    Contractor: ['ReadOnly'],
    ReadOnly: []
  };

  function ensureSheets() {
    REOS.Database.ensureTable(USER_ROLES_SHEET, USER_ROLE_HEADERS);
    REOS.Database.ensureTable(ROLE_PERMISSIONS_SHEET, ROLE_PERMISSION_HEADERS);
    REOS.Database.ensureTable(PLUGIN_PERMISSIONS_SHEET, PLUGIN_PERMISSION_HEADERS);
    REOS.Database.ensureTable(ACCESS_AUDIT_SHEET, ACCESS_AUDIT_HEADERS);
  }

  function syncPermissions() {
    ensureSheets();
    seedCurrentUserOwner_();
    seedPluginPermissions_();
    seedRolePermissions_();
    return summary();
  }

  function getCurrentUser() {
    return REOS.getCurrentUser_ ? REOS.getCurrentUser_() : Session.getActiveUser().getEmail();
  }

  function getUserRoles(email) {
    ensureSheets();
    email = REOS.normalizeEmail_ ? REOS.normalizeEmail_(email || getCurrentUser()) : String(email || getCurrentUser()).toLowerCase();
    var explicitRoles = REOS.Database.getAll(USER_ROLES_SHEET).filter(function (row) {
      return String(row.Status || 'Active') === 'Active' && String(row.Email || '').toLowerCase() === email;
    }).map(function (row) { return row.Role; });
    if (!explicitRoles.length && isBootstrapAdmin_(email)) explicitRoles.push('Owner');
    return expandRoles_(unique_(explicitRoles));
  }

  function hasRole(role, email) {
    return getUserRoles(email).indexOf(role) !== -1;
  }

  function canAccessPlugin(pluginKey, email) {
    ensureSheets();
    if (!pluginKey) return false;
    if (hasRole('Owner', email) || hasRole('Admin', email)) return auditAccess({ email: email, pluginKey: pluginKey, granted: true, reason: 'Owner/Admin access.' }).granted;
    var roles = getUserRoles(email);
    var rows = REOS.Database.getAll(PLUGIN_PERMISSIONS_SHEET).filter(function (row) {
      return row['Plugin Key'] === pluginKey && (row.Allowed === true || String(row.Allowed).toLowerCase() === 'true');
    });
    var granted = rows.some(function (row) { return roles.indexOf(row.Role) !== -1; });
    auditAccess({ email: email, pluginKey: pluginKey, granted: granted, reason: granted ? 'Role allows plugin.' : 'No matching plugin permission.', details: { roles: roles } });
    return granted;
  }

  function canAccessCapability(type, name, email) {
    ensureSheets();
    var caps = REOS.PluginManager && typeof REOS.PluginManager.byCapability === 'function' ? REOS.PluginManager.byCapability(type, name) : [];
    if (!caps.length) {
      auditAccess({ email: email, capabilityType: type, capabilityName: name, granted: true, reason: 'Capability not registered; allowed for backward compatibility.' });
      return true;
    }
    return caps.some(function (cap) { return canAccessPlugin(cap.pluginKey, email); });
  }

  function requireRole(role, email) {
    if (!hasRole(role, email)) {
      auditAccess({ email: email, granted: false, reason: 'Missing required role: ' + role });
      throw new Error('Access denied. Required role: ' + role);
    }
    return true;
  }

  function requirePlugin(pluginKey, email) {
    if (!canAccessPlugin(pluginKey, email)) throw new Error('Access denied for plugin: ' + pluginKey);
    return true;
  }

  function requireCapability(type, name, email) {
    if (!canAccessCapability(type, name, email)) throw new Error('Access denied for capability: ' + type + ':' + name);
    return true;
  }

  function auditAccess(event) {
    ensureSheets();
    var email = REOS.normalizeEmail_ ? REOS.normalizeEmail_(event.email || getCurrentUser()) : String(event.email || getCurrentUser()).toLowerCase();
    var row = REOS.Database.insert(ACCESS_AUDIT_SHEET, {
      Timestamp: new Date(),
      Email: email,
      'Plugin Key': event.pluginKey || '',
      'Capability Type': event.capabilityType || '',
      'Capability Name': event.capabilityName || '',
      Granted: !!event.granted,
      Reason: event.reason || '',
      'Details JSON': REOS.toJson_(event.details || {})
    }, { idField: 'Access ID', idPrefix: 'ACC' });
    return { granted: !!event.granted, audit: row };
  }

  function filterMenuGroups(groups, email) {
    if (!groups || !groups.length) return [];
    if (hasRole('Owner', email) || hasRole('Admin', email)) return groups;
    var pluginByMenu = buildPluginByMenu_();
    return groups.map(function (group) {
      var pluginKey = pluginByMenu[group.key];
      if (!pluginKey || canAccessPlugin(pluginKey, email)) return group;
      return null;
    }).filter(Boolean);
  }

  function summary() {
    ensureSheets();
    var roles = REOS.Database.getAll(USER_ROLES_SHEET);
    var pluginPerms = REOS.Database.getAll(PLUGIN_PERMISSIONS_SHEET);
    var rolePerms = REOS.Database.getAll(ROLE_PERMISSIONS_SHEET);
    var audits = REOS.Database.getAll(ACCESS_AUDIT_SHEET);
    return {
      ok: true,
      currentUser: getCurrentUser(),
      currentRoles: getUserRoles(),
      userRoleCount: roles.length,
      pluginPermissionCount: pluginPerms.length,
      rolePermissionCount: rolePerms.length,
      accessAuditCount: audits.length
    };
  }

  function seedCurrentUserOwner_() {
    var email = REOS.normalizeEmail_ ? REOS.normalizeEmail_(getCurrentUser()) : String(getCurrentUser()).toLowerCase();
    if (!email || email === 'unknown') return;
    var exists = REOS.Database.getAll(USER_ROLES_SHEET).some(function (row) {
      return String(row.Email || '').toLowerCase() === email && row.Role === 'Owner';
    });
    if (!exists) {
      REOS.Database.insert(USER_ROLES_SHEET, { Email: email, Role: 'Owner', Status: 'Active', 'Created At': new Date(), 'Updated At': new Date() }, { idField: 'User Role ID', idPrefix: 'UR' });
    }
  }

  function seedPluginPermissions_() {
    if (!(REOS.PluginManager && typeof REOS.PluginManager.summary === 'function')) return;
    REOS.PluginManager.registerDefaults();
    var existing = REOS.Database.getAll(PLUGIN_PERMISSIONS_SHEET).reduce(function (map, row) {
      map[row['Plugin Key'] + '::' + row.Role] = true;
      return map;
    }, {});
    REOS.PluginManager.summary().plugins.forEach(function (plugin) {
      (plugin.permissions || []).forEach(function (role) {
        var key = plugin.key + '::' + role;
        if (!existing[key]) {
          REOS.Database.insert(PLUGIN_PERMISSIONS_SHEET, { 'Plugin Key': plugin.key, Role: role, Allowed: true, 'Created At': new Date(), 'Updated At': new Date() }, { idField: 'Plugin Permission ID', idPrefix: 'PPER' });
        }
      });
    });
  }

  function seedRolePermissions_() {
    var existing = REOS.Database.getAll(ROLE_PERMISSIONS_SHEET).reduce(function (map, row) {
      map[row.Role + '::' + row['Permission Type'] + '::' + row['Permission Name']] = true;
      return map;
    }, {});
    Object.keys(ROLE_HIERARCHY).forEach(function (role) {
      var key = role + '::role::' + role;
      if (!existing[key]) {
        REOS.Database.insert(ROLE_PERMISSIONS_SHEET, { Role: role, 'Permission Type': 'role', 'Permission Name': role, Allowed: true, 'Created At': new Date(), 'Updated At': new Date() }, { idField: 'Role Permission ID', idPrefix: 'RPER' });
      }
    });
  }

  function expandRoles_(roles) {
    var expanded = {};
    roles.forEach(function (role) {
      expanded[role] = true;
      (ROLE_HIERARCHY[role] || []).forEach(function (child) { expanded[child] = true; });
    });
    return Object.keys(expanded);
  }

  function unique_(items) {
    return Object.keys(items.reduce(function (map, item) { if (item) map[item] = true; return map; }, {}));
  }

  function isBootstrapAdmin_(email) {
    return !!email && email !== 'unknown';
  }

  function buildPluginByMenu_() {
    if (!(REOS.PluginManager && typeof REOS.PluginManager.summary === 'function')) return {};
    var map = {};
    REOS.PluginManager.summary().plugins.forEach(function (plugin) {
      if (plugin.menuGroup) map[plugin.menuGroup] = plugin.key;
    });
    return map;
  }

  return {
    ensureSheets: ensureSheets,
    syncPermissions: syncPermissions,
    getCurrentUser: getCurrentUser,
    getUserRoles: getUserRoles,
    hasRole: hasRole,
    canAccessPlugin: canAccessPlugin,
    canAccessCapability: canAccessCapability,
    requireRole: requireRole,
    requirePlugin: requirePlugin,
    requireCapability: requireCapability,
    auditAccess: auditAccess,
    filterMenuGroups: filterMenuGroups,
    summary: summary
  };
})();

function reosPluginSecuritySync() {
  var result = REOS.PluginSecurity.syncPermissions();
  SpreadsheetApp.getUi().alert('REOS Plugin Security Sync', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosPluginSecuritySummary() {
  var result = REOS.PluginSecurity.summary();
  SpreadsheetApp.getUi().alert('REOS Plugin Security Summary', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}

function reosPluginSecurityTest() {
  var result = {
    user: REOS.PluginSecurity.getCurrentUser(),
    roles: REOS.PluginSecurity.getUserRoles(),
    operations: REOS.PluginSecurity.canAccessPlugin('operations'),
    finance: REOS.PluginSecurity.canAccessPlugin('finance'),
    diagnostic: REOS.PluginSecurity.canAccessCapability('diagnostic', 'reosRunDiagnostics')
  };
  SpreadsheetApp.getUi().alert('REOS Plugin Security Test', JSON.stringify(result, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return result;
}
