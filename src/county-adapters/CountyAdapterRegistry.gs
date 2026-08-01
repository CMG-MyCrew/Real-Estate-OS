/**
 * REOS Enterprise - County Adapter Registry
 * Registers reusable source adapters for county connectors.
 */
var REOS = REOS || {};

REOS.CountyAdapters = REOS.CountyAdapters || {};

REOS.CountyAdapters.Registry = (function () {
  var ADAPTERS = {};

  function register(name, adapter) {
    var id = String(name || '').trim().toLowerCase();

    if (!id) {
      throw new Error('County adapter name is required.');
    }

    if (!adapter || typeof adapter.fetch !== 'function') {
      throw new Error(
        'County adapter "' + id + '" must implement fetch(options).'
      );
    }

    ADAPTERS[id] = adapter;
    return id;
  }

  function get(name) {
    return ADAPTERS[String(name || '').trim().toLowerCase()] || null;
  }

  function list() {
    return Object.keys(ADAPTERS).sort().map(function (name) {
      var adapter = ADAPTERS[name];

      return {
        name: name,
        version: adapter.version || '1.0.0',
        description: adapter.description || '',
        supportsHealthCheck:
          typeof adapter.health === 'function'
      };
    });
  }

  function fetch(name, options) {
    var adapter = get(name);

    if (!adapter) {
      throw new Error('County adapter not registered: ' + name);
    }

    return adapter.fetch(options || {});
  }

  function health(name, options) {
    var adapter = get(name);

    if (!adapter) {
      throw new Error('County adapter not registered: ' + name);
    }

    if (typeof adapter.health !== 'function') {
      throw new Error(
        'County adapter does not support health checks: ' + name
      );
    }

    return adapter.health(options || {});
  }

  return {
    register: register,
    get: get,
    list: list,
    fetch: fetch,
    health: health
  };
})();
