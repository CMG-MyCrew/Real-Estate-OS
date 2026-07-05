/**
 * REOS Enterprise v3.0 - Router Framework
 *
 * Provides a centralized routing and module registry layer for UI actions,
 * server calls, and future web app navigation.
 */

var REOS = REOS || {};

REOS.Router = (function () {
  const modules_ = {};
  const routes_ = {};

  function registerModule(moduleConfig) {
    moduleConfig = moduleConfig || {};
    if (!moduleConfig.key) throw new Error('Module key is required.');

    const key = String(moduleConfig.key).trim();
    modules_[key] = {
      key: key,
      name: moduleConfig.name || key,
      description: moduleConfig.description || '',
      permission: moduleConfig.permission || null,
      order: moduleConfig.order || 999,
      active: moduleConfig.active !== false,
      routes: moduleConfig.routes || []
    };

    modules_[key].routes.forEach(function (route) {
      registerRoute(Object.assign({}, route, { module: key }));
    });

    REOS.Logger.info('Module registered', { module: key });
    return modules_[key];
  }

  function registerRoute(routeConfig) {
    routeConfig = routeConfig || {};
    if (!routeConfig.key) throw new Error('Route key is required.');
    if (typeof routeConfig.handler !== 'function') throw new Error('Route handler is required: ' + routeConfig.key);

    const key = String(routeConfig.key).trim();
    routes_[key] = {
      key: key,
      module: routeConfig.module || null,
      name: routeConfig.name || key,
      permission: routeConfig.permission || null,
      handler: routeConfig.handler,
      active: routeConfig.active !== false
    };

    return routes_[key];
  }

  function dispatch(routeKey, payload) {
    const route = routes_[routeKey];
    if (!route || !route.active) throw new Error('Route not found or inactive: ' + routeKey);

    if (route.permission) REOS.Security.requirePermission(route.permission);

    REOS.Logger.info('Route dispatched', { route: routeKey, module: route.module });
    return route.handler(payload || {});
  }

  function getModule(key) {
    return modules_[key] || null;
  }

  function getModules() {
    return Object.keys(modules_)
      .map(function (key) { return modules_[key]; })
      .filter(function (module) { return module.active; })
      .sort(function (a, b) { return a.order - b.order; });
  }

  function getRoutes() {
    return Object.keys(routes_).map(function (key) {
      const route = routes_[key];
      return {
        key: route.key,
        module: route.module,
        name: route.name,
        permission: route.permission,
        active: route.active
      };
    });
  }

  function buildNavigation() {
    const currentUser = REOS.Security.getCurrentUser();
    return getModules().filter(function (module) {
      if (!module.permission) return true;
      return REOS.Security.hasPermission(module.permission, currentUser);
    }).map(function (module) {
      return {
        key: module.key,
        name: module.name,
        description: module.description,
        order: module.order
      };
    });
  }

  function initializeDefaultModules() {
    registerModule({
      key: 'home',
      name: 'Home',
      description: 'REOS command center and system status.',
      order: 1,
      routes: [
        {
          key: 'home.open',
          name: 'Open Home',
          handler: function () {
            return { ok: true, view: 'home', navigation: buildNavigation() };
          }
        }
      ]
    });

    registerModule({
      key: 'crm',
      name: 'CRM',
      description: 'Clients, contacts, tasks, and activities.',
      permission: 'crm:read',
      order: 10,
      routes: [
        {
          key: 'crm.open',
          name: 'Open CRM',
          permission: 'crm:read',
          handler: function () {
            return { ok: true, view: 'crm' };
          }
        }
      ]
    });

    registerModule({
      key: 'leads',
      name: 'Acquisitions',
      description: 'Distressed properties and off-market opportunities.',
      permission: 'leads:read',
      order: 20,
      routes: [
        {
          key: 'leads.open',
          name: 'Open Acquisitions',
          permission: 'leads:read',
          handler: function () {
            return { ok: true, view: 'leads' };
          }
        }
      ]
    });

    registerModule({
      key: 'tasks',
      name: 'Tasks',
      description: 'Operational tasks and follow-up workflows.',
      permission: 'tasks:read',
      order: 30,
      routes: [
        {
          key: 'tasks.open',
          name: 'Open Tasks',
          permission: 'tasks:read',
          handler: function () {
            return { ok: true, view: 'tasks' };
          }
        }
      ]
    });

    registerModule({
      key: 'admin',
      name: 'Admin',
      description: 'Settings, security, setup, and system tools.',
      permission: '*',
      order: 100,
      routes: [
        {
          key: 'admin.health',
          name: 'Health Check',
          permission: '*',
          handler: function () {
            return REOS.healthCheck_();
          }
        },
        {
          key: 'admin.setup',
          name: 'Initialize Workbook',
          permission: '*',
          handler: function () {
            return REOS.Setup.initializeWorkbook();
          }
        }
      ]
    });

    return getModules();
  }

  return {
    registerModule: registerModule,
    registerRoute: registerRoute,
    dispatch: dispatch,
    getModule: getModule,
    getModules: getModules,
    getRoutes: getRoutes,
    buildNavigation: buildNavigation,
    initializeDefaultModules: initializeDefaultModules
  };
})();

function reosInitializeRouter() {
  return REOS.Router.initializeDefaultModules();
}

function reosDispatch(routeKey, payload) {
  return REOS.Router.dispatch(routeKey, payload || {});
}

function reosGetNavigation() {
  return REOS.Router.buildNavigation();
}
