var REOS = REOS || {};
REOS.CountyAdapters = REOS.CountyAdapters || {};

REOS.CountyAdapters.JSONAPI = (function () {
  function fetch(options) {
    options = options || {};

    var context = options.context || {};
    var limit = Number(context.limit || options.limit || 100);
    var offset = Number(context.cursor || options.offset || 0);

    var url = REOS.CountyAdapters.Http.appendQuery(
      String(options.endpoint || ''),
      Object.assign(
        {},
        options.parameters || {},
        options.limitParameter
          ? (function () {
              var result = {};
              result[options.limitParameter] = limit;
              result[options.offsetParameter || 'offset'] = offset;
              return result;
            })()
          : {}
      )
    );

    var response = REOS.CountyAdapters.Http.request({
      url: url,
      method: options.method || 'get',
      headers: Object.assign(
        { Accept: 'application/json' },
        options.headers || {}
      )
    });

    var payload = REOS.CountyAdapters.Http.parseJson(response);
    var records;

    if (typeof options.extractRecords === 'function') {
      records = options.extractRecords(payload);
    } else if (Array.isArray(payload)) {
      records = payload;
    } else {
      records =
        payload.records ||
        payload.results ||
        payload.data ||
        [];
    }

    records = Array.isArray(records) ? records : [];

    return {
      records: records,
      nextCursor:
        records.length >= limit
          ? String(offset + records.length)
          : '',
      message:
        'JSON API fetched ' + records.length + ' records.',
      metadata: {
        adapter: 'json-api',
        status: response.status,
        durationMs: response.durationMs
      }
    };
  }

  function health(options) {
    var response = REOS.CountyAdapters.Http.request({
      url: String((options || {}).endpoint || ''),
      method: 'get',
      headers: { Accept: 'application/json' }
    });

    REOS.CountyAdapters.Http.parseJson(response);

    return {
      ok: true,
      adapter: 'json-api',
      status: response.status,
      durationMs: response.durationMs
    };
  }

  return {
    version: '1.0.0',
    description: 'Generic JSON REST API adapter.',
    fetch: fetch,
    health: health
  };
})();

