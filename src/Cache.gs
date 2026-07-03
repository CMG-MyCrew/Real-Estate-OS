/**
 * REOS Enterprise v3.0 - Cache Optimization Framework
 *
 * Script cache, user cache, memoization, cache metrics, invalidation helpers,
 * and tenant-aware cache keys for performance optimization.
 */

var REOS = REOS || {};

REOS.Cache = (function () {
  const METRICS_SHEET = 'CACHE_METRICS';
  const DEFAULT_TTL = 300;

  const HEADERS = [
    'Cache Metric ID', 'Timestamp', 'Scope', 'Key', 'Action', 'Hit',
    'TTL Seconds', 'Tenant ID', 'Module', 'Created At', 'Updated At'
  ];

  function ensureSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(METRICS_SHEET);
    if (!sheet) sheet = ss.insertSheet(METRICS_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
    return sheet;
  }

  function get(key, scope, module) {
    const cache = cache_(scope);
    const cacheKey = key_(key);
    const value = cache.get(cacheKey);
    log_(scope || 'script', cacheKey, 'get', !!value, '', module || '');
    if (!value) return null;
    try { return JSON.parse(value); } catch (error) { return value; }
  }

  function put(key, value, ttlSeconds, scope, module) {
    const cache = cache_(scope);
    const cacheKey = key_(key);
    cache.put(cacheKey, JSON.stringify(value), Number(ttlSeconds || DEFAULT_TTL));
    log_(scope || 'script', cacheKey, 'put', true, ttlSeconds || DEFAULT_TTL, module || '');
    return true;
  }

  function remove(key, scope, module) {
    const cache = cache_(scope);
    const cacheKey = key_(key);
    cache.remove(cacheKey);
    log_(scope || 'script', cacheKey, 'remove', false, '', module || '');
    return true;
  }

  function remember(key, ttlSeconds, producer, scope, module) {
    const existing = get(key, scope, module);
    if (existing !== null && existing !== undefined) return existing;
    const value = producer();
    put(key, value, ttlSeconds || DEFAULT_TTL, scope, module);
    return value;
  }

  function dashboard() {
    ensureSheet();
    const rows = REOS.Database.getAll(METRICS_SHEET).slice(-500);
    const gets = rows.filter(function (r) { return r.Action === 'get'; });
    const hits = gets.filter(function (r) { return r.Hit === true || String(r.Hit).toLowerCase() === 'true'; });
    return {
      metricCount: rows.length,
      gets: gets.length,
      hits: hits.length,
      hitRate: gets.length ? Math.round(hits.length / gets.length * 100) : 0,
      recent: rows.slice(-50).reverse()
    };
  }

  function cache_(scope) {
    return String(scope || 'script').toLowerCase() === 'user' ? CacheService.getUserCache() : CacheService.getScriptCache();
  }

  function key_(key) {
    const tenantId = REOS.Tenants && REOS.Tenants.getCurrentTenantId ? REOS.Tenants.getCurrentTenantId() : '';
    return ['REOS', tenantId || 'global', String(key || '')].join(':').slice(0, 250);
  }

  function log_(scope, key, action, hit, ttl, module) {
    try {
      ensureSheet();
      REOS.Database.insert(METRICS_SHEET, {
        Timestamp: new Date(),
        Scope: scope,
        Key: key,
        Action: action,
        Hit: hit,
        'TTL Seconds': ttl || '',
        'Tenant ID': REOS.Tenants && REOS.Tenants.getCurrentTenantId ? REOS.Tenants.getCurrentTenantId() : '',
        Module: module || ''
      }, { idField: 'Cache Metric ID', idPrefix: 'CM' });
    } catch (ignore) {}
  }

  return { ensureSheet: ensureSheet, get: get, put: put, remove: remove, remember: remember, dashboard: dashboard };
})();

function cacheGet(key, scope, module) { return REOS.Cache.get(key, scope, module); }
function cachePut(key, value, ttlSeconds, scope, module) { return REOS.Cache.put(key, value, ttlSeconds, scope, module); }
function cacheDashboard() { return REOS.Cache.dashboard(); }
