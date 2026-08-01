/**
 * REOS Enterprise - County HTTP Adapter Utility
 */
var REOS = REOS || {};

REOS.CountyAdapters = REOS.CountyAdapters || {};

REOS.CountyAdapters.Http = (function () {
  function request(options) {
    options = options || {};

    var url = String(options.url || '').trim();

    if (!url) {
      throw new Error('HTTP adapter URL is required.');
    }

    var started = new Date();

    var response = UrlFetchApp.fetch(url, {
      method: String(options.method || 'get').toLowerCase(),
      headers: options.headers || {},
      payload: options.payload,
      contentType: options.contentType,
      muteHttpExceptions: true,
      followRedirects: options.followRedirects !== false
    });

    var completed = new Date();
    var status = response.getResponseCode();
    var body = response.getContentText();
    var headers = response.getHeaders();

    var contentType = String(
      headers['Content-Type'] ||
      headers['content-type'] ||
      ''
    );

    if (status < 200 || status >= 300) {
      throw new Error(
        'County adapter request returned HTTP ' +
        status +
        '. URL: ' +
        url +
        '. Response: ' +
        body.slice(0, 500)
      );
    }

    return {
      ok: true,
      url: url,
      status: status,
      body: body,
      headers: headers,
      contentType: contentType,
      durationMs: completed.getTime() - started.getTime()
    };
  }

  function appendQuery(url, parameters) {
    var query = [];

    Object.keys(parameters || {}).forEach(function (key) {
      var value = parameters[key];

      if (
        value === null ||
        typeof value === 'undefined' ||
        value === ''
      ) {
        return;
      }

      query.push(
        encodeURIComponent(key) +
        '=' +
        encodeURIComponent(value)
      );
    });

    if (!query.length) {
      return url;
    }

    return (
      url +
      (url.indexOf('?') === -1 ? '?' : '&') +
      query.join('&')
    );
  }

  function parseJson(result) {
    var body = String(result.body || '');

    if (
      body.trim().charAt(0) === '<' ||
      String(result.contentType)
        .toLowerCase()
        .indexOf('text/html') !== -1
    ) {
      throw new Error(
        'County endpoint returned HTML instead of JSON. URL: ' +
        result.url +
        '. Response: ' +
        body.slice(0, 500)
      );
    }

    try {
      return JSON.parse(body || '{}');
    } catch (error) {
      throw new Error(
        'County endpoint returned invalid JSON. URL: ' +
        result.url +
        '. Response: ' +
        body.slice(0, 500)
      );
    }
  }

  return {
    request: request,
    appendQuery: appendQuery,
    parseJson: parseJson
  };
})();
