var REOS = REOS || {};
REOS.CountyAdapters = REOS.CountyAdapters || {};

REOS.CountyAdapters.CSV = (function () {
  function fetch(options) {
    options = options || {};

    var response = REOS.CountyAdapters.Http.request({
      url: String(options.endpoint || ''),
      method: 'get',
      headers: Object.assign(
        { Accept: 'text/csv' },
        options.headers || {}
      )
    });

    var rows = Utilities.parseCsv(
      response.body,
      options.delimiter || ','
    );

    if (!rows.length) {
      return {
        records: [],
        nextCursor: '',
        message: 'CSV endpoint returned no records.'
      };
    }

    var headers = rows.shift().map(function (header) {
      return String(header || '').trim();
    });

    var allRecords = rows.map(function (row) {
      var record = {};

      headers.forEach(function (header, index) {
        record[header] =
          typeof row[index] === 'undefined'
            ? ''
            : row[index];
      });

      return record;
    });

    var context = options.context || {};
    var offset = Math.max(Number(context.cursor || 0), 0);
    var limit = Math.max(Number(context.limit || 100), 1);

    var records = allRecords.slice(offset, offset + limit);

    return {
      records: records,
      nextCursor:
        offset + records.length < allRecords.length
          ? String(offset + records.length)
          : '',
      message:
        'CSV fetched ' +
        records.length +
        ' of ' +
        allRecords.length +
        ' records.',
      metadata: {
        adapter: 'csv',
        status: response.status,
        durationMs: response.durationMs
      }
    };
  }

  function health(options) {
    var response = REOS.CountyAdapters.Http.request({
      url: String((options || {}).endpoint || ''),
      method: 'get',
      headers: { Accept: 'text/csv' }
    });

    return {
      ok: true,
      adapter: 'csv',
      status: response.status,
      durationMs: response.durationMs,
      contentLength: String(response.body || '').length
    };
  }

  return {
    version: '1.0.0',
    description: 'CSV download and header mapping adapter.',
    fetch: fetch,
    health: health
  };
})();

