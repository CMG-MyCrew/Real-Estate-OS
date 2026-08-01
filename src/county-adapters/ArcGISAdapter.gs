/**
 * REOS Enterprise - ArcGIS County Adapter
 */
var REOS = REOS || {};

REOS.CountyAdapters = REOS.CountyAdapters || {};

REOS.CountyAdapters.ArcGIS = (function () {
  var VERSION = '1.0.0';

  function fetch(options) {
    options = options || {};

    var endpoint = String(options.endpoint || '').trim();

    if (!endpoint) {
      throw new Error('ArcGIS endpoint is required.');
    }

    var context = options.context || {};

    var limit = Math.min(
      Math.max(Number(context.limit || options.limit || 500), 1),
      Number(options.maxLimit || 2000)
    );

    var offset = Math.max(
      Number(context.cursor || options.offset || 0),
      0
    );

    var parameters = {
      where: options.where || '1=1',
      outFields: options.outFields || '*',
      returnGeometry:
        options.returnGeometry === true ? 'true' : 'false',
      resultRecordCount: limit,
      resultOffset: offset,
      f: 'json'
    };

    if (options.orderByFields) {
      parameters.orderByFields = options.orderByFields;
    }

    var url = REOS.CountyAdapters.Http.appendQuery(
      endpoint,
      parameters
    );

    var result = REOS.CountyAdapters.Http.request({
      url: url,
      method: 'get',
      headers: Object.assign(
        { Accept: 'application/json' },
        options.headers || {}
      )
    });

    var payload = REOS.CountyAdapters.Http.parseJson(result);

    if (payload.error) {
      throw new Error(
        'ArcGIS API error: ' +
        JSON.stringify(payload.error)
      );
    }

    var features = Array.isArray(payload.features)
      ? payload.features
      : [];

    var records = features.map(function (feature) {
      return feature && feature.attributes
        ? feature.attributes
        : feature;
    });

    return {
      records: records,
      nextCursor:
        records.length >= limit
          ? String(offset + records.length)
          : '',
      message:
        'ArcGIS fetched ' +
        records.length +
        ' records in ' +
        result.durationMs +
        ' ms.',
      metadata: {
        adapter: 'arcgis',
        status: result.status,
        durationMs: result.durationMs,
        exceededTransferLimit:
          payload.exceededTransferLimit === true
      }
    };
  }

  function health(options) {
    options = options || {};

    var endpoint = String(options.endpoint || '').trim();

    if (!endpoint) {
      throw new Error('ArcGIS health endpoint is required.');
    }

    var url = REOS.CountyAdapters.Http.appendQuery(
      endpoint,
      {
        where: '1=1',
        returnCountOnly: 'true',
        f: 'json'
      }
    );

    var result = REOS.CountyAdapters.Http.request({
      url: url,
      method: 'get',
      headers: { Accept: 'application/json' }
    });

    var payload = REOS.CountyAdapters.Http.parseJson(result);

    if (payload.error) {
      throw new Error(
        'ArcGIS health check failed: ' +
        JSON.stringify(payload.error)
      );
    }

    return {
      ok: true,
      adapter: 'arcgis',
      status: result.status,
      durationMs: result.durationMs,
      count:
        typeof payload.count === 'number'
          ? payload.count
          : null
    };
  }

  return {
    version: VERSION,
    description:
      'ArcGIS FeatureServer query and pagination adapter.',
    fetch: fetch,
    health: health
  };
})();

