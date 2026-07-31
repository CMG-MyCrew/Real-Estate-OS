/**
 * REOS Enterprise v4.5.0 - Philadelphia County Connector
 * Adapter for Philadelphia public property and distress datasets.
 * Endpoint URLs and API keys must be configured in Script Properties.
 */
var REOS = REOS || {};

REOS.PhiladelphiaCountyConnector = (function () {
  var CONNECTOR_ID = 'PA-PHILADELPHIA';
  var DATASETS = ['tax_delinquent', 'code_violations', 'vacant_properties', 'property_assessment'];

  function register() {
    return REOS.CountyConnectorSDK.register({
      id: CONNECTOR_ID,
      county: 'Philadelphia',
      state: 'PA',
      version: '1.0.0',
      enabled: true,
      datasets: DATASETS,
      fetch: fetch_,
      normalize: normalize_,
      validate: validate_
    });
  }

  function fetch_(context) {
    var endpoint = getEndpoint_(context.dataset, context.config);

    if (!endpoint) {
      throw new Error(
        'Missing endpoint for Philadelphia dataset: ' +
        context.dataset +
        '. Configure REOS_COUNTY_PA_PHILADELPHIA_' +
        context.dataset.toUpperCase() +
        '_URL.'
      );
    }

    var limit = Math.min(
      Math.max(Number(context.limit) || 500, 1),
      2000
    );

    var offset = Math.max(Number(context.cursor) || 0, 0);
    var whereClause = '1=1';

    if (context.since) {
      var sinceFilter = buildSinceFilter_(
        context.dataset,
        context.since
      );

      if (sinceFilter) {
        whereClause = sinceFilter;
      }
    }

    var query = [
      'where=' + encodeURIComponent(whereClause),
      'outFields=' + encodeURIComponent('*'),
      'returnGeometry=false',
      'resultRecordCount=' + encodeURIComponent(limit),
      'resultOffset=' + encodeURIComponent(offset),
      'f=json'
    ];

    var url =
      endpoint +
      (endpoint.indexOf('?') === -1 ? '?' : '&') +
      query.join('&');

    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        Accept: 'application/json'
      },
      muteHttpExceptions: true,
      followRedirects: true
    });

    var status = response.getResponseCode();
    var responseText = response.getContentText();
    var headers = response.getHeaders();
    var contentType = String(
      headers['Content-Type'] ||
      headers['content-type'] ||
      ''
    );

    if (status < 200 || status >= 300) {
      throw new Error(
        'Philadelphia endpoint returned HTTP ' +
        status +
        '. URL: ' +
        url +
        '. Response: ' +
        responseText.slice(0, 500)
      );
    }

    if (
      responseText.trim().charAt(0) === '<' ||
      contentType.toLowerCase().indexOf('text/html') !== -1
    ) {
      throw new Error(
        'Philadelphia endpoint returned HTML instead of JSON. ' +
        'URL: ' +
        url +
        '. Content-Type: ' +
        contentType +
        '. Response: ' +
        responseText.slice(0, 500)
      );
    }

    var payload;

    try {
      payload = JSON.parse(responseText || '{}');
    } catch (error) {
      throw new Error(
        'Philadelphia endpoint returned invalid JSON. ' +
        'URL: ' +
        url +
        '. Response: ' +
        responseText.slice(0, 500)
      );
    }

    if (payload.error) {
      throw new Error(
        'Philadelphia ArcGIS API error: ' +
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
        'Fetched ' +
        records.length +
        ' records from Philadelphia ' +
        context.dataset
    };
  }

  function normalize_(raw, context) {
    raw = raw || {};
    var address = first_(raw, ['address', 'street_address', 'location', 'property_address', 'opa_address']);
    var city = first_(raw, ['city', 'property_city']) || 'Philadelphia';
    var zip = first_(raw, ['zip', 'zipcode', 'zip_code', 'property_zip']);
    var parcel = first_(raw, ['parcel_number', 'parcel_id', 'opa_account_num', 'opa_account_number', 'account_num']);
    var owner = first_(raw, ['owner_name', 'owner', 'legal_owner', 'owner_1']);
    var sourceId = first_(raw, ['objectid', 'id', 'record_id', 'case_number', 'violation_id', 'parcel_number', 'opa_account_num']);

    var record = {
      Address: address,
      City: city,
      State: 'PA',
      Zip: zip,
      County: 'Philadelphia',
      'Parcel ID': parcel,
      'Owner Name': owner,
      'Source Record ID': sourceId,
      Source: CONNECTOR_ID,
      'Source Dataset': context.dataset,
      'Source Updated At': first_(raw, ['updated_at', 'last_updated', 'date_updated', 'inspection_date', 'violation_date']),
      Notes: buildNotes_(raw, context.dataset)
    };

    if (context.dataset === 'tax_delinquent') {
      record['Distress Type'] = 'Tax Delinquent';
      record['Tax Delinquent Amount'] = first_(raw, ['amount_due', 'balance', 'delinquent_amount', 'total_due']);
      record['Tax Year'] = first_(raw, ['tax_year', 'year']);
    } else if (context.dataset === 'code_violations') {
      record['Distress Type'] = 'Code Violation';
      record['Violation Amount'] = first_(raw, ['fine_amount', 'amount_due', 'penalty']);
      record['Violation Type'] = first_(raw, ['violation_type', 'violation_description', 'code_description']);
      record['Violation Status'] = first_(raw, ['status', 'case_status']);
    } else if (context.dataset === 'vacant_properties') {
      record['Distress Type'] = 'Vacant Property';
      record['Vacancy Status'] = first_(raw, ['vacancy_status', 'status', 'category']);
    } else if (context.dataset === 'property_assessment') {
      record['Distress Type'] = 'Assessment Record';
      record['Estimated Value'] = first_(raw, ['market_value', 'total_market_value', 'assessed_value']);
      record['Property Type'] = first_(raw, ['property_type', 'building_code_description', 'category_code_description']);
    }

    return record;
  }

  function validate_(record) {
    var base = REOS.CountyConnectorSDK.validateLead(record);
    var errors = (base.errors || []).slice();
    if (record.City && String(record.City).toLowerCase() !== 'philadelphia') errors.push('Record is outside Philadelphia.');
    if (record.State !== 'PA') errors.push('Record state must be PA.');
    return { ok: errors.length === 0, errors: errors };
  }

  function getEndpoint_(dataset, config) {
    var key = 'REOS_COUNTY_PA_PHILADELPHIA_' + String(dataset || '').toUpperCase() + '_URL';
    return String((config && config.endpoint) || PropertiesService.getScriptProperties().getProperty(key) || '').trim();
  }

  function getApiKey_(config) {
    return String((config && config.apiKey) || PropertiesService.getScriptProperties().getProperty('REOS_COUNTY_PA_PHILADELPHIA_API_KEY') || '').trim();
  }

  function buildSinceFilter_(dataset, since) {
    var date = since instanceof Date ? since : new Date(since);
    if (isNaN(date.getTime())) return '';
    var iso = Utilities.formatDate(date, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS");
    var fieldMap = {
      tax_delinquent: 'updated_at',
      code_violations: 'violation_date',
      vacant_properties: 'updated_at',
      property_assessment: 'assessment_date'
    };
    return (fieldMap[dataset] || 'updated_at') + ">='" + iso + "'";
  }

  function first_(object, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var value = object[keys[i]];
      if (value !== null && typeof value !== 'undefined' && String(value).trim() !== '') return value;
    }
    return '';
  }

  function buildNotes_(raw, dataset) {
    var parts = ['Imported from Philadelphia ' + dataset + '.'];
    var caseNumber = first_(raw, ['case_number', 'case_id']);
    var description = first_(raw, ['description', 'violation_description', 'category_code_description']);
    if (caseNumber) parts.push('Case: ' + caseNumber + '.');
    if (description) parts.push(String(description).slice(0, 500));
    return parts.join(' ');
  }

  return {
    register: register,
    connectorId: CONNECTOR_ID,
    datasets: DATASETS.slice()
  };
})();



