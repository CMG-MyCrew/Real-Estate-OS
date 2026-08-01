var REOS = REOS || {};
REOS.CountyAdapters = REOS.CountyAdapters || {};

REOS.CountyAdapters.Socrata = (function () {
  function fetch(options) {
    options = options || {};

    var context = options.context || {};
    var limit = Math.min(
      Math.max(Number(context.limit || 500), 1),
      Number(options.maxLimit || 5000)
    );
    var offset = Math.max(Number(context.cursor || 0), 0);

    var parameters = {
      '$limit': limit,
      '$offset': offset
    };

    if (options.where) {
      parameters['$where'] = options.where;
    }

    if (options.select) {
      parameters['$select'] = options.select;
    }

    if (options.order) {
      parameters['$order'] = options.order;
    }

    var url = REOS.CountyAdapters.Http.appendQuery(
      String(options.endpoint || ''),
      parameters
    );

    var headers = Object.assign(
      { Accept: 'application/json' },
      options.headers || {}
    );

    if (options.appToken) {
      headers['X-App-Token'] = options.appToken;
    }

    var response = REOS.CountyAdapters.Http.request({
      url: url,
      method: 'get',
      headers: headers
    });

    var payload = REOS.CountyAdapters.Http.parseJson(response);
    var records = Array.isArray(payload) ? payload : [];

    return {
      records: records,
      nextCursor:
        records.length >= limit
          ? String(offset + records.length)
          : '',
      message:
        'Socrata fetched ' + records.length + ' records.',
      metadata: {
        adapter: 'socrata',
        status: response.status,
        durationMs: response.durationMs
      }
    };
  }

  function health(options) {
    var endpoint = String((options || {}).endpoint || '');
    var url = REOS.CountyAdapters.Http.appendQuery(
      endpoint,
      { '$limit': 1 }
    );

    var response = REOS.CountyAdapters.Http.request({
      url: url,
      method: 'get',
      headers: { Accept: 'application/json' }
    });

    REOS.CountyAdapters.Http.parseJson(response);

    return {
      ok: true,
      adapter: 'socrata',
      status: response.status,
      durationMs: response.durationMs
    };
  }

  return {
    version: '1.0.0',
    description: 'Socrata Open Data API adapter.',
    fetch: fetch,
    health: health
  };
})();

