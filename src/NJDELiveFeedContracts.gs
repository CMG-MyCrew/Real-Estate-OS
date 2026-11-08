/**
 * REOS NJ/DE — five-feed normalization contracts, license-ready but DENY-LIVE.
 * Pure data adapter for approved source snapshots; no UrlFetchApp, ScriptApp,
 * PropertiesService, Google Sheets, email, credential access or side effects.
 *
 * The Sheriff's Sale Data API is a possible *paid* source for mortgage/tax
 * sheriff records, not a source already approved by REOS or a public API.
 * Feed contracts for municipal code/vacancy/probate require their own sources.
 *
 * DO NOT expose these methods to existing CountyConnectorSDK live writers.
 */
var REOS = REOS || {};
REOS.NJDEFeedContracts = (function () {
  'use strict';

  var SCHEMA = 'REOS_NJ_DE_FEED_CONTRACTS_OFFLINE_V1';
  var FEEDS = Object.freeze([
    'code_violations', 'vacant_properties',
    'sheriff_tax_sales', 'sheriff_mortgage_sales', 'probate'
  ]);
  var SOURCE = 'SHERIFFSALEDATA_LICENSED_API_CANDIDATE_NOT_APPROVED';
  var STATUSES = Object.freeze({
    scheduled: 'SCHEDULED_REVIEW',
    listed: 'LISTED_REVIEW',
    in_progress: 'IN_PROGRESS_REVIEW',
    sold: 'SOLD_REVIEW',
    unsold: 'UNSOLD_REVIEW'
  });
  var TYPE_FEED = Object.freeze({
    mortgage_foreclosure: 'sheriff_mortgage_sales',
    tax_foreclosure: 'sheriff_tax_sales'
  });

  function require_(ok, code) {
    if (!ok) throw new Error(code);
  }

  function string_(val, maxLen) {
    var v = String(val === null || typeof val === 'undefined' ? '' : val).trim();
    require_(v.length <= maxLen, 'FEED_STRING_OVERFLOW');
    return v;
  }

  function state_(state) {
    require_(state === 'NJ' || state === 'DE', 'FEED_STATE_INVALID');
    return state;
  }

  function county_(state, countyName) {
    state_(state);
    var slug = string_(countyName, 80).toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    require_(slug.length >= 2, 'FEED_COUNTY_INVALID');
    return state + '-' + slug;
  }

  function feed_(feed) {
    require_(FEEDS.indexOf(feed) !== -1, 'FEED_KIND_INVALID');
    return feed;
  }

  function date_(raw) {
    var value = string_(raw, 10);
    require_(/^\d{4}-\d{2}-\d{2}$/.test(value), 'FEED_DATE_INVALID');
    var utc = new Date(value + 'T00:00:00.000Z');
    require_(Number.isFinite(utc.getTime()) &&
      utc.toISOString().slice(0,10) === value, 'FEED_DATE_INVALID');
    return value;
  }

  function sale_(raw, state, countyName, feed) {
    state_(state);
    feed_(feed);
    require_(raw && typeof raw === 'object' && !Array.isArray(raw),
      'SHERIFF_RECORD_INVALID');
    require_(raw.state === state &&
      county_(state, raw.county) === county_(state, countyName),
      'SHERIFF_CROSS_STATE_COUNTY_RECORD');
    require_(TYPE_FEED[raw.sale_type] === feed,
      'SHERIFF_MORTGAGE_TAX_TYPE_MISMATCH');
    var id = string_(raw.id, 40);
    require_(/^[0-9a-f]{16}$/.test(id), 'SHERIFF_SOURCE_ID_INVALID');
    var court = string_(raw.case_number, 80);
    var sheriff = string_(raw.sheriff_number, 80);
    require_(court || sheriff, 'SHERIFF_NO_STABLE_CASE_OR_SHERIFF_ID');
    require_(raw.sale_status && Object.prototype.hasOwnProperty.call(STATUSES,
      raw.sale_status), 'SHERIFF_STATUS_UNKNOWN_QUARANTINE');
    require_(typeof raw.address === 'string' && raw.address.trim().length >= 5 &&
      typeof raw.city === 'string' && raw.city.trim().length >= 2,
      'SHERIFF_ADDRESS_REQUIRED');
    var date = date_(raw.sale_date);
    require_(raw.status_history === null ||
      typeof raw.status_history === 'undefined' ||
      (Array.isArray(raw.status_history) && raw.status_history.length <= 100),
      'SHERIFF_STATUS_HISTORY_INVALID');
    require_(raw.other_ids === null ||
      typeof raw.other_ids === 'undefined' ||
      (Array.isArray(raw.other_ids) && raw.other_ids.length <= 100),
      'SHERIFF_ALIAS_IDS_INVALID');

    var key = [state, county_(state, countyName), feed,
      court ? ('CASE:' + court.toUpperCase()) :
        ('SHERIFF:' + sheriff.toUpperCase())].join('|');
    return {
      schemaVersion: SCHEMA,
      source: SOURCE,
      sourceRecordId: id,
      countyId: county_(state, countyName),
      state: state,
      feed: feed,
      stableCandidateKey: key,
      identityCertainty: court ? 'CASE_NUMBER_PENDING_SOURCE_ATTESTATION' :
        'SHERIFF_NUMBER_REQUIRES_ADDITIONAL_REVIEW',
      saleDate: date,
      status: STATUSES[raw.sale_status],
      originalStatus: raw.sale_status,
      // Status details can include stays, adjournments and cancellations;
      // never infer actionable sale from a vendor's normalized status alone.
      statusDetail: string_(raw.status_detail, 256),
      sourceDataAsOf: null,
      needsHumanStatusReview: true,
      readyForDistressLeads: false,
      readyForAutomaticMAO: false,
      readyForOffer: false
    };
  }

  function genericSourceEvent_(raw, state, countyName, feed) {
    state_(state); feed_(feed);
    require_(feed !== 'sheriff_mortgage_sales' &&
      feed !== 'sheriff_tax_sales', 'SHERIFF_REQUIRES_SALE_ADAPTER');
    require_(raw && typeof raw === 'object' && !Array.isArray(raw),
      'DISTRESS_EVENT_MALFORMED');
    require_(raw.state === state &&
      county_(state, raw.county) === county_(state, countyName) &&
      raw.feed === feed, 'DISTRESS_EVENT_SCOPE_MISMATCH');
    var eventId = string_(raw.sourceRecordId, 128);
    var propertyId = string_(raw.propertyRecordId, 128);
    var sourceUrl = string_(raw.sourceUrl, 500);
    require_(eventId.length >= 4 && propertyId.length >= 4 &&
      /^https:\/\//.test(sourceUrl), 'DISTRESS_EVENT_ID_OR_PROVENANCE_MISSING');
    return {
      schemaVersion: SCHEMA,
      source: 'UNATTESTED_COUNTY_SOURCE',
      state: state,
      countyId: county_(state, countyName),
      feed: feed,
      sourceRecordId: eventId,
      candidateKey: [state,county_(state,countyName),feed,eventId].join('|'),
      propertyRecordId: propertyId,
      eventDate: date_(raw.eventDate),
      status: string_(raw.status, 128),
      sourceUrl: sourceUrl,
      sourceCertified: false,
      readyForDistressLeads: false,
      readyForAutomaticMAO: false,
      readyForOffer: false
    };
  }

  function validateSheriffCursorPage_(page, state, countyName, feed, cursor) {
    state_(state); feed_(feed);
    require_(feed === 'sheriff_mortgage_sales' ||
      feed === 'sheriff_tax_sales', 'PAGING_SHERIFF_FEED_ONLY');
    require_(page && page.object === 'list' && Array.isArray(page.data) &&
      page.data.length <= 200 && typeof page.has_more === 'boolean',
      'SHERIFF_PAGE_SCHEMA_INVALID');
    require_(page.truncated === false,
      'SHERIFF_PAGE_TRUNCATED_QUOTA_OR_COVERAGE_HOLD');
    require_(page.next_cursor === null ||
      (typeof page.next_cursor === 'string' &&
       page.next_cursor.length > 0 && page.next_cursor.length <= 512),
      'SHERIFF_NEXT_CURSOR_INVALID');
    require_(page.has_more === Boolean(page.next_cursor),
      'SHERIFF_PAGINATION_STATUS_MISMATCH');
    require_(!page.next_cursor || page.next_cursor !== cursor,
      'SHERIFF_PAGINATION_CURSOR_STALLED');
    var stamp = date_(page.data_as_of);
    var rows = page.data.map(function (r) {
      var v = sale_(r,state,countyName,feed);
      v.sourceDataAsOf = stamp;
      return v;
    });
    var keys = {};
    rows.forEach(function (v) {
      require_(!keys[v.stableCandidateKey],
        'SHERIFF_DUPLICATE_STABLE_CASE_IN_PAGE');
      keys[v.stableCandidateKey] = true;
    });
    return { rows: rows, nextCursor: page.next_cursor || '',
      more: page.has_more, sourceAsOf: stamp,
      recordCount: rows.length, productionWrites: 0 };
  }

  function validateSnapshotPages(pages, state, countyName, feed) {
    require_(Array.isArray(pages) && pages.length > 0 &&
      pages.length <= 100, 'SHERIFF_PAGE_COUNT_OUT_OF_BOUNDS');
    var cursor = '';
    var seenCursors = {};
    var seenCases = {};
    var total = 0;
    var firstStamp = '';
    var lastPage;
    pages.forEach(function (raw, index) {
      // Pages supplied by a test transport or by a separately approved
      // read-only provider. No network requested from this contract.
      var result = validateSheriffCursorPage_(raw,state,countyName,feed,cursor);
      if (firstStamp && firstStamp !== result.sourceAsOf) {
        throw new Error('SHERIFF_DATA_AS_OF_DRIFT_QUARANTINE');
      }
      firstStamp = result.sourceAsOf;
      result.rows.forEach(function (r) {
        require_(!seenCases[r.stableCandidateKey],
          'SHERIFF_DUPLICATE_CASE_ACROSS_CURSOR_PAGES');
        seenCases[r.stableCandidateKey] = true;
      });
      total += result.rows.length;
      if (result.more) {
        require_(index + 1 < pages.length,
          'SHERIFF_SNAPSHOT_INCOMPLETE_PAGINATION');
        require_(!seenCursors[result.nextCursor],
          'SHERIFF_CYCLE_CURSOR_REUSED');
        seenCursors[result.nextCursor] = true;
      } else {
        require_(index === pages.length - 1,
          'SHERIFF_EXTRA_PAGE_AFTER_TERMINAL');
      }
      cursor = result.nextCursor;
      lastPage = result;
    });
    require_(lastPage && !lastPage.more && !cursor,
      'SHERIFF_CYCLE_NOT_COMPLETE');
    return {
      schemaVersion: SCHEMA,
      state: state,
      countyId: county_(state,countyName),
      feed: feed,
      pagesValidated: pages.length,
      rowsValidated: total,
      sourceDataAsOf: firstStamp,
      lastCursor: '',
      mockValidationOnly: true,
      sourcePermissionAttested: false,
      sourceSchemaCertified: false,
      recordsWritten: 0,
      liveReadAuthorized: false,
      productionActivation: 'HOLD'
    };
  }

  return Object.freeze({
    schemaVersion: SCHEMA,
    feedOrder: FEEDS.slice(),
    licensedApiCandidateBase: 'https://www.sheriffsaledata.com/api/v1',
    licensedApiSource: SOURCE,
    normalizeSale: sale_,
    normalizeGenericSourceEvent: genericSourceEvent_,
    validateSheriffCursorPage: validateSheriffCursorPage_,
    validateSnapshotPages: validateSnapshotPages,
    permissionToFetchLive: false,
    permissionToWriteProduction: false
  });
})();
