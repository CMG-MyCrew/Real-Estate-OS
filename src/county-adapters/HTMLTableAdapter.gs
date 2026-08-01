/**
 * REOS Enterprise - HTML Table County Adapter
 */
var REOS = REOS || {};

REOS.CountyAdapters = REOS.CountyAdapters || {};

REOS.CountyAdapters.HTMLTable = (function () {
  var VERSION = '1.0.0';

  function fetch(options) {
    options = options || {};

    var endpoint = String(options.endpoint || '').trim();

    if (!endpoint) {
      throw new Error('HTML table endpoint is required.');
    }

    if (typeof options.parser !== 'function') {
      throw new Error(
        'HTML table adapter requires parser(html, options).'
      );
    }

    var result = REOS.CountyAdapters.Http.request({
      url: endpoint,
      method: 'get',
      headers: Object.assign(
        {
          Accept: 'text/html,application/xhtml+xml'
        },
        options.headers || {}
      )
    });

    var html = result.body;

    if (
      !html ||
      (
        html.toLowerCase().indexOf('<html') === -1 &&
        html.toLowerCase().indexOf('<table') === -1
      )
    ) {
      throw new Error(
        'HTML adapter endpoint did not return an HTML document. ' +
        'URL: ' +
        endpoint +
        '. Response: ' +
        String(html || '').slice(0, 500)
      );
    }

    var allRecords = options.parser(html, options) || [];

    if (!Array.isArray(allRecords)) {
      throw new Error(
        'HTML adapter parser must return an array.'
      );
    }

    var context = options.context || {};

    var offset = Math.max(
      Number(context.cursor || options.offset || 0),
      0
    );

    var limit = Math.min(
      Math.max(Number(context.limit || options.limit || 100), 1),
      Number(options.maxLimit || 2000)
    );

    var records = allRecords.slice(
      offset,
      offset + limit
    );

    return {
      records: records,
      nextCursor:
        offset + records.length < allRecords.length
          ? String(offset + records.length)
          : '',
      message:
        'HTML adapter fetched ' +
        records.length +
        ' of ' +
        allRecords.length +
        ' records in ' +
        result.durationMs +
        ' ms.',
      metadata: {
        adapter: 'html-table',
        totalRecords: allRecords.length,
        durationMs: result.durationMs,
        status: result.status
      }
    };
  }

  function health(options) {
    var endpoint = String(
      (options || {}).endpoint || ''
    ).trim();

    if (!endpoint) {
      throw new Error('HTML health endpoint is required.');
    }

    var result = REOS.CountyAdapters.Http.request({
      url: endpoint,
      method: 'get',
      headers: {
        Accept: 'text/html,application/xhtml+xml'
      }
    });

    return {
      ok: true,
      adapter: 'html-table',
      status: result.status,
      durationMs: result.durationMs,
      contentLength: String(result.body || '').length
    };
  }

  return {
    version: VERSION,
    description:
      'Reusable HTML page and table parsing adapter.',
    fetch: fetch,
    health: health
  };
})();

