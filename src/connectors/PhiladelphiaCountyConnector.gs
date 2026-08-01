/**
 * REOS Enterprise v4.5.0 - Philadelphia County Connector
 * Adapter for Philadelphia public property and distress datasets.
 * Endpoint URLs and API keys must be configured in Script Properties.
 */
var REOS = REOS || {};

REOS.PhiladelphiaCountyConnector = (function () {
  var CONNECTOR_ID = 'PA-PHILADELPHIA';
  var DATASETS = [
    'tax_delinquent',
    'code_violations',
    'vacant_properties',
    'property_assessment',
    'sheriff_tax_sales',
    'sheriff_mortgage_sales'
  ];

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
    if (
      context.dataset === 'sheriff_tax_sales' ||
      context.dataset === 'sheriff_mortgage_sales'
    ) {
      return fetchSheriffSales_(context);
    }

    var endpoint = getEndpoint_(
      context.dataset,
      context.config
    );

    if (!endpoint) {
      throw new Error(
        'Missing endpoint for Philadelphia dataset: ' +
        context.dataset +
        '. Configure REOS_COUNTY_PA_PHILADELPHIA_' +
        context.dataset.toUpperCase() +
        '_URL.'
      );
    }

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

    return REOS.CountyAdapters.Registry.fetch(
      'arcgis',
      {
        endpoint: endpoint,
        context: context,
        where: whereClause,
        outFields: '*',
        returnGeometry: false,
        maxLimit: 2000
      }
    );
  }

  function fetchSheriffSales_(context) {
    var endpoint = getEndpoint_(
      context.dataset,
      context.config
    );

    if (!endpoint) {
      throw new Error(
        'Missing endpoint for Philadelphia dataset: ' +
        context.dataset +
        '. Configure REOS_COUNTY_PA_PHILADELPHIA_' +
        context.dataset.toUpperCase() +
        '_URL.'
      );
    }

    return REOS.CountyAdapters.Registry.fetch(
      'html-table',
      {
        endpoint: endpoint,
        context: context,
        maxLimit: 2000,
        parser: function (html) {
          return parseSheriffRows_(
            html,
            context.dataset
          );
        }
      }
    );
  }

  function parseSheriffRows_(html, dataset) {
    var records = [];
    var rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    var rowMatch;

    while ((rowMatch = rowPattern.exec(html)) !== null) {
      var cells = [];
      var cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      var cellMatch;

      while (
        (cellMatch = cellPattern.exec(rowMatch[1])) !== null
      ) {
        cells.push(
          cleanSheriffCell_(cellMatch[1])
        );
      }

      if (cells.length < 7) {
        continue;
      }

      var auctionId = cells[0];
      var bookWrit = cells[1];
      var opaNumber = cells[2];
      var address = cells[3];
      var saleType = cells[4];
      var saleStatus = cells[5];
      var saleDate = cells[6];

      if (
        !auctionId ||
        !opaNumber ||
        !address ||
        !/^\d+$/.test(String(opaNumber).replace(/\s/g, ''))
      ) {
        continue;
      }

      if (
        String(auctionId).toLowerCase() === 'id' ||
        String(address).toLowerCase() === 'street'
      ) {
        continue;
      }

      records.push({
        AUCTION_ID: auctionId,
        BOOK_WRIT: bookWrit,
        OPA_NUMBER: opaNumber,
        STREET_ADDRESS: address,
        SALE_TYPE: saleType ||
          (
            dataset === 'sheriff_tax_sales'
              ? 'TAX DELINQUENT'
              : 'MORTGAGE FORECLOSURE'
          ),
        SALE_STATUS: saleStatus,
        SALE_DATE: saleDate,
        SOURCE_URL: ''
      });
    }

    return records;
  }

  function cleanSheriffCell_(value) {
    return decodeSheriffEntities_(
      String(value || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  function decodeSheriffEntities_(value) {
    return String(value || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
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
      record.Address = first_(raw, [
        'STREET_ADDRESS',
        'street_address',
        'address',
        'property_address'
      ]);

      record.Zip = first_(raw, [
        'ZIP_CODE',
        'zip_code',
        'zip',
        'zipcode'
      ]);

      record['Parcel ID'] = first_(raw, [
        'OPA_NUMBER',
        'opa_number',
        'parcel_number',
        'parcel_id'
      ]);

      record['Owner Name'] = first_(raw, [
        'OWNER',
        'owner',
        'owner_name'
      ]);

      record['Source Record ID'] = first_(raw, [
        'OBJECTID',
        'objectid',
        'record_id',
        'id'
      ]);

      record['Distress Type'] = 'Tax Delinquent';
      record['Tax Delinquent Amount'] = numberFirst_(raw, [
        'TOTAL_DUE',
        'total_due',
        'amount_due',
        'balance',
        'delinquent_amount'
      ]);
      record['Tax Principal'] = numberFirst_(raw, [
        'PRINCIPAL_DUE',
        'principal_due',
        'principal'
      ]);
      record['Tax Interest'] = numberFirst_(raw, [
        'INTEREST_DUE',
        'interest_due',
        'interest'
      ]);
      record['Tax Penalty'] = numberFirst_(raw, [
        'PENALTY_DUE',
        'penalty_due',
        'penalty'
      ]);
      record['Tax Other Charges'] = numberFirst_(raw, [
        'OTHER_CHARGES_DUE',
        'other_charges_due',
        'other_due',
        'fees'
      ]);
      record['Tax Year'] = first_(raw, [
        'MOST_RECENT_YEAR_OWED',
        'most_recent_year_owed',
        'tax_year',
        'year'
      ]);
      record['Earliest Delinquent Year'] = first_(raw, [
        'OLDEST_YEAR_OWED',
        'oldest_year_owed'
      ]);
      record['Latest Delinquent Year'] = first_(raw, [
        'MOST_RECENT_YEAR_OWED',
        'most_recent_year_owed'
      ]);
      record['Years Delinquent'] = first_(raw, [
        'NUM_YEARS_OWED',
        'num_years_owed'
      ]);
      record['Payment Agreement Status'] = first_(raw, [
        'PAYMENT_AGREEMENT',
        'payment_agreement'
      ]);
      record['Actionable'] = first_(raw, [
        'IS_ACTIONABLE',
        'is_actionable'
      ]);
      record['Bankruptcy'] = first_(raw, [
        'BANKRUPTCY',
        'bankruptcy'
      ]);
      record['Sheriff Sale'] = first_(raw, [
        'SHERIFF_SALE',
        'sheriff_sale'
      ]);
      record['Mailing Address'] = first_(raw, [
        'MAILING_ADDRESS',
        'mailing_address'
      ]);
      record['Mailing City'] = first_(raw, [
        'MAILING_CITY',
        'mailing_city'
      ]);
      record['Mailing State'] = first_(raw, [
        'MAILING_STATE',
        'mailing_state'
      ]);
      record['Mailing Zip'] = first_(raw, [
        'MAILING_ZIP',
        'mailing_zip'
      ]);
      record['Estimated Value'] = numberFirst_(raw, [
        'TOTAL_ASSESSMENT',
        'total_assessment',
        'TAXABLE_ASSESSMENT',
        'taxable_assessment'
      ]);
    } else if (context.dataset === 'code_violations') {
      record.Address = first_(raw, [
        'address',
        'street_address',
        'location'
      ]);

      record.Zip = first_(raw, [
        'zip',
        'zip_code',
        'zipcode'
      ]);

      record['Parcel ID'] = first_(raw, [
        'opa_account_num',
        'parcel_id_num',
        'parcel_number'
      ]);

      record['Owner Name'] = first_(raw, [
        'opa_owner',
        'owner_name',
        'owner'
      ]);

      record['Source Record ID'] = first_(raw, [
        'violationnumber',
        'objectid',
        'posse_jobid',
        'casenumber'
      ]);

      record['Distress Type'] = 'Code Violation';

      record['Violation Number'] = first_(raw, [
        'violationnumber',
        'violation_number'
      ]);

      record['Case Number'] = first_(raw, [
        'casenumber',
        'case_number'
      ]);

      record['Violation Code'] = first_(raw, [
        'violationcode',
        'violation_code'
      ]);

      record['Violation Type'] = first_(raw, [
        'violationcodetitle',
        'violation_description',
        'violation_type',
        'code_description'
      ]);

      record['Violation Status'] = first_(raw, [
        'violationstatus',
        'casestatus',
        'case_status',
        'status'
      ]);

      record['Case Priority'] = first_(raw, [
        'caseprioritydesc',
        'case_priority'
      ]);

      record['Violation Date'] = first_(raw, [
        'violationdate',
        'violation_date'
      ]);

      record['Resolution Date'] = first_(raw, [
        'violationresolutiondate',
        'violation_resolution_date'
      ]);

      record['Resolution Code'] = first_(raw, [
        'violationresolutioncode',
        'violation_resolution_code'
      ]);

      record['Most Recent Investigation'] = first_(raw, [
        'mostrecentinvestigation',
        'most_recent_investigation'
      ]);

      record['Under Appeal'] = first_(raw, [
        'underappeal',
        'under_appeal'
      ]);

      record['Public Notice URL'] = first_(raw, [
        'publicnov',
        'public_notice_url'
      ]);

      record['Source Updated At'] = first_(raw, [
        'mostrecentinvestigation',
        'violationdate',
        'casecreateddate'
      ]);
    } else if (context.dataset === 'vacant_properties') {
      record.Address = first_(raw, [
        'address',
        'ADDRESS',
        'street_address',
        'location'
      ]);

      record.Zip = first_(raw, [
        'zipcode',
        'ZIPCODE',
        'zip_code',
        'zip'
      ]);

      record['Parcel ID'] = first_(raw, [
        'opa_id',
        'OPA_ID',
        'opa_number',
        'parcel_number'
      ]);

      var owner1 = first_(raw, [
        'owner1',
        'OWNER1',
        'owner_name',
        'owner'
      ]);

      var owner2 = first_(raw, [
        'owner2',
        'OWNER2',
        'co_owner'
      ]);

      record['Owner Name'] = owner1;

      if (owner2) {
        record['Co-Owner Name'] = owner2;
      }

      record['Source Record ID'] = first_(raw, [
        'objectid',
        'OBJECTID',
        'lniaddresskey',
        'opa_id'
      ]);

      record['Distress Type'] = 'Vacant Property';

      record['Vacancy Status'] = first_(raw, [
        'vacant_flag',
        'VACANT_FLAG',
        'vacancy_status',
        'status'
      ]);

      record['Vacancy Rank'] = numberFirst_(raw, [
        'vacant_rank',
        'VACANT_RANK'
      ]);

      record['Land Vacancy Rank'] = numberFirst_(raw, [
        'land_rank',
        'LAND_RANK'
      ]);

      record['Building Vacancy Rank'] = numberFirst_(raw, [
        'build_rank',
        'BUILD_RANK'
      ]);

      record['Property Type'] = first_(raw, [
        'bldg_desc',
        'BLDG_DESC',
        'building_description'
      ]);

      record['Council District'] = first_(raw, [
        'councildistrict',
        'COUNCILDISTRICT'
      ]);

      record['Zoning'] = first_(raw, [
        'zoningbasedistrict',
        'ZONINGBASEDISTRICT'
      ]);

      record['L&I Address Key'] = first_(raw, [
        'lniaddresskey',
        'LNIADDRESSKEY'
      ]);

      record['Source Updated At'] = first_(raw, [
        'date_update',
        'DATE_UPDATE'
      ]);

      record.Notes =
        'Philadelphia vacancy model classification: ' +
        String(record['Vacancy Status'] || 'Unknown') +
        '. Vacancy rank: ' +
        String(record['Vacancy Rank'] || '') +
        '.';
    } else if (
      context.dataset === 'sheriff_tax_sales' ||
      context.dataset === 'sheriff_mortgage_sales'
    ) {
      record.Address = first_(raw, [
        'STREET_ADDRESS',
        'street_address',
        'address'
      ]);

      record.Zip = extractZip_(
        record.Address ||
        first_(raw, ['ZIP_CODE', 'zip_code'])
      );

      record['Parcel ID'] = first_(raw, [
        'OPA_NUMBER',
        'opa_number',
        'assessment_id'
      ]);

      record['Source Record ID'] = first_(raw, [
        'AUCTION_ID',
        'auction_id',
        'BOOK_WRIT',
        'book_writ'
      ]);

      record['Distress Type'] =
        context.dataset === 'sheriff_tax_sales'
          ? 'Sheriff Tax Sale'
          : 'Sheriff Mortgage Sale';

      record['Sheriff Auction ID'] = first_(raw, [
        'AUCTION_ID',
        'auction_id'
      ]);

      record['Book/Writ'] = first_(raw, [
        'BOOK_WRIT',
        'book_writ',
        'booknwrit'
      ]);

      record['Sale Type'] = first_(raw, [
        'SALE_TYPE',
        'sale_type'
      ]);

      record['Sale Status'] = first_(raw, [
        'SALE_STATUS',
        'sale_status',
        'status'
      ]);

      record['Sale Date'] = parseSheriffDate_(
        first_(raw, [
          'SALE_DATE',
          'sale_date'
        ])
      );

      record['Source Updated At'] =
        record['Sale Date'];

      record.Notes =
        'Philadelphia Sheriff Sale. ' +
        'Auction ID: ' +
        String(record['Sheriff Auction ID'] || '') +
        '. Book/Writ: ' +
        String(record['Book/Writ'] || '') +
        '. Status: ' +
        String(record['Sale Status'] || '') +
        '.';
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

  function numberFirst_(object, keys) {
    var value = first_(object, keys);

    if (value === '') return '';

    var normalized = String(value)
      .replace(/[$,]/g, '')
      .trim();

    var number = Number(normalized);

    return isNaN(number) ? '' : number;
  }

  function extractZip_(value) {
    var match = String(value || '').match(
      /\b\d{5}(?:-\d{4})?\b/
    );

    return match ? match[0] : '';
  }

  function parseSheriffDate_(value) {
    if (!value) return '';

    var date = value instanceof Date
      ? value
      : new Date(value);

    return isNaN(date.getTime()) ? value : date;
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



