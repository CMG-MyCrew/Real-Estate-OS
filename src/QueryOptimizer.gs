/**
 * REOS Enterprise v3.0 - Query Optimizer Framework
 *
 * Cached table queries, filtering, projection, sorting, and pagination helpers.
 */

var REOS = REOS || {};

REOS.QueryOptimizer = (function () {
  function query(sheetName, options) {
    REOS.Security.requirePermission('reports:read');
    const started = Date.now();
    options = options || {};
    const cacheKey = 'query:' + sheetName + ':' + JSON.stringify(options);

    if (options.cache !== false) {
      const cached = REOS.Cache.get(cacheKey, 'script', 'QueryOptimizer');
      if (cached) return cached;
    }

    let rows = REOS.BatchDatabase.readTable(sheetName);
    if (options.tenantScoped !== false && REOS.TenantSecurity) rows = REOS.TenantSecurity.filterRows(rows);
    if (options.where) rows = applyWhere_(rows, options.where);
    if (options.search) rows = applySearch_(rows, options.search, options.searchFields || []);
    if (options.sortBy) rows = applySort_(rows, options.sortBy, options.sortDir || 'asc');

    const total = rows.length;
    if (options.fields && options.fields.length) rows = applyProjection_(rows, options.fields);
    rows = applyPagination_(rows, options.page || 1, options.pageSize || total || 1000);

    const result = { rows: rows, total: total, page: options.page || 1, pageSize: options.pageSize || total || 1000 };
    if (options.cache !== false) REOS.Cache.put(cacheKey, result, options.ttl || 120, 'script', 'QueryOptimizer');
    REOS.Performance.log('QueryOptimizer', 'query', Date.now() - started, { sheetName: sheetName, total: total });
    return result;
  }

  function applyWhere_(rows, where) {
    return rows.filter(function (row) {
      return Object.keys(where || {}).every(function (field) {
        const expected = where[field];
        if (Array.isArray(expected)) return expected.indexOf(row[field]) !== -1;
        return String(row[field] || '') === String(expected || '');
      });
    });
  }

  function applySearch_(rows, term, fields) {
    term = String(term || '').toLowerCase();
    return rows.filter(function (row) {
      const keys = fields.length ? fields : Object.keys(row);
      const text = keys.map(function (f) { return row[f] || ''; }).join(' ').toLowerCase();
      return text.indexOf(term) !== -1;
    });
  }

  function applySort_(rows, field, dir) {
    const mult = String(dir).toLowerCase() === 'desc' ? -1 : 1;
    return rows.sort(function (a, b) {
      const av = a[field] || '';
      const bv = b[field] || '';
      if (av === bv) return 0;
      return av > bv ? mult : -mult;
    });
  }

  function applyProjection_(rows, fields) {
    return rows.map(function (row) {
      const out = {};
      fields.forEach(function (f) { out[f] = row[f]; });
      return out;
    });
  }

  function applyPagination_(rows, page, pageSize) {
    page = Math.max(1, Number(page || 1));
    pageSize = Math.max(1, Number(pageSize || 100));
    return rows.slice((page - 1) * pageSize, page * pageSize);
  }

  return { query: query };
})();

function queryOptimized(sheetName, options) { return REOS.QueryOptimizer.query(sheetName, options || {}); }
