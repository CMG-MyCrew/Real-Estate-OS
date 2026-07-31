/**
 * REOS Enterprise v4.5.0 - County Connector SDK
 * Shared registry, execution, normalization, validation, deduplication, and audit services.
 */
var REOS = REOS || {};

REOS.CountyConnectorSDK = (function () {
  var REGISTRY = {};
  var AUDIT_SHEET = 'COUNTY_CONNECTOR_RUNS';
  var TARGET_SHEET = 'DISTRESS_LEADS';
  var RUN_HEADERS = [
    'Run ID', 'Connector ID', 'County', 'State', 'Dataset', 'Mode', 'Status',
    'Records Fetched', 'Records Valid', 'Records Inserted', 'Records Updated',
    'Records Skipped', 'Records Failed', 'Started At', 'Completed At',
    'Duration Ms', 'Cursor', 'Message', 'Executed By'
  ];

  function register(connector) {
    validateConnector_(connector);
    REGISTRY[connector.id] = connector;
    return connector.id;
  }

  function get(connectorId) {
    return REGISTRY[String(connectorId || '').trim()] || null;
  }

  function list() {
    return Object.keys(REGISTRY).sort().map(function (id) {
      var c = REGISTRY[id];
      return {
        id: c.id,
        county: c.county,
        state: c.state,
        datasets: (c.datasets || []).slice(),
        enabled: c.enabled !== false,
        version: c.version || '1.0.0'
      };
    });
  }

  function ensureInfrastructure() {
    REOS.Database.ensureTable(AUDIT_SHEET, RUN_HEADERS);
    return { ok: true, auditSheet: AUDIT_SHEET, connectors: list().length };
  }

  function run(connectorId, options) {
    options = options || {};
    ensureInfrastructure();
    var connector = get(connectorId);
    if (!connector) throw new Error('County connector not registered: ' + connectorId);
    if (connector.enabled === false) throw new Error('County connector is disabled: ' + connectorId);

    var dataset = String(options.dataset || connector.datasets[0] || '').trim();
    if (!dataset) throw new Error('A dataset is required.');
    if (connector.datasets.indexOf(dataset) === -1) {
      throw new Error('Unsupported dataset for ' + connector.id + ': ' + dataset);
    }

    var started = new Date();
    var runId = REOS.generateId_('CCR');
    var mode = options.dryRun === false ? 'LIVE' : 'DRY_RUN';
    var stats = {
      fetched: 0,
      valid: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0
    };
    var cursor = String(options.cursor || '');

    insertRun_(runId, connector, dataset, mode, started, cursor);

    try {
      var context = {
        runId: runId,
        connectorId: connector.id,
        dataset: dataset,
        cursor: cursor,
        limit: Number(options.limit || 500),
        since: options.since || null,
        dryRun: options.dryRun !== false,
        config: options.config || {},
        now: started
      };
      var response = connector.fetch(context) || {};
      var rawRecords = Array.isArray(response.records) ? response.records : [];
      stats.fetched = rawRecords.length;
      cursor = String(response.nextCursor || cursor || '');

      rawRecords.forEach(function (raw, index) {
        try {
          var normalized = connector.normalize(raw, context);
          normalized = normalizeLead_(normalized, connector, dataset, runId);
          var validation = connector.validate ? connector.validate(normalized, context) : validateLead_(normalized);
          if (validation === true) validation = { ok: true, errors: [] };
          validation = validation || { ok: false, errors: ['Connector returned no validation result.'] };
          if (!validation.ok) {
            stats.failed += 1;
            logWarning_('County connector validation failed', {
              connectorId: connector.id,
              dataset: dataset,
              index: index,
              errors: validation.errors || []
            });
            return;
          }

          stats.valid += 1;
          var result = persist_(normalized, context);
          stats[result.action] += 1;
        } catch (recordError) {
          stats.failed += 1;
          logError_('County connector record failed', recordError, {
            connectorId: connector.id,
            dataset: dataset,
            index: index
          });
        }
      });

      var completed = new Date();
      completeRun_(runId, 'Completed', stats, completed, started, cursor, response.message || '');
      return {
        ok: true,
        runId: runId,
        connectorId: connector.id,
        dataset: dataset,
        mode: mode,
        stats: stats,
        nextCursor: cursor,
        completedAt: completed.toISOString()
      };
    } catch (error) {
      completeRun_(runId, 'Failed', stats, new Date(), started, cursor, error.message || String(error));
      logError_('County connector run failed', error, { runId: runId, connectorId: connector.id, dataset: dataset });
      throw error;
    }
  }

  function runAll(options) {
    options = options || {};
    var results = [];
    list().filter(function (item) { return item.enabled; }).forEach(function (item) {
      item.datasets.forEach(function (dataset) {
        try {
          results.push(run(item.id, Object.assign({}, options, { dataset: dataset })));
        } catch (error) {
          results.push({ ok: false, connectorId: item.id, dataset: dataset, error: error.message || String(error) });
        }
      });
    });
    return results;
  }

  function persist_(record, context) {
    if (context.dryRun) return { action: 'skipped', record: record };
    var naturalKey = buildNaturalKey_(record);
    var existing = findExisting_(record, naturalKey);
    if (existing) {
      REOS.Database.update(TARGET_SHEET, 'Distress Lead ID', existing['Distress Lead ID'], Object.assign({}, record, {
        'Source Record Key': naturalKey,
        'Last Seen At': new Date(),
        'Updated At': new Date()
      }));
      return { action: 'updated', id: existing['Distress Lead ID'] };
    }
    var inserted = REOS.Database.insert(TARGET_SHEET, Object.assign({}, record, {
      'Source Record Key': naturalKey,
      'Last Seen At': new Date()
    }), { idField: 'Distress Lead ID', idPrefix: 'DL' });
    return { action: 'inserted', id: inserted['Distress Lead ID'] };
  }

  function findExisting_(record, naturalKey) {
    var rows = REOS.Database.getAll(TARGET_SHEET);
    return rows.find(function (row) {
      if (naturalKey && String(row['Source Record Key'] || '') === naturalKey) return true;
      return normalizeText_(row.Address) === normalizeText_(record.Address) &&
        normalizeText_(row.City) === normalizeText_(record.City) &&
        normalizeText_(row.State) === normalizeText_(record.State) &&
        normalizeText_(row.Zip) === normalizeText_(record.Zip);
    }) || null;
  }

  function normalizeLead_(record, connector, dataset, runId) {
    record = Object.assign({}, record || {});
    return Object.assign(record, {
      Address: titleCase_(record.Address),
      City: titleCase_(record.City),
      State: String(record.State || connector.state || '').toUpperCase(),
      Zip: normalizeZip_(record.Zip),
      County: record.County || connector.county,
      Source: record.Source || connector.id,
      'Source Dataset': record['Source Dataset'] || dataset,
      'Connector Run ID': runId,
      'Owner Name': String(record['Owner Name'] || '').trim(),
      'Parcel ID': String(record['Parcel ID'] || '').trim(),
      'Distress Type': record['Distress Type'] || dataset,
      'Estimated Value': numberOrBlank_(record['Estimated Value']),
      'Estimated Debt': numberOrBlank_(record['Estimated Debt']),
      'Tax Delinquent Amount': numberOrBlank_(record['Tax Delinquent Amount']),
      'Violation Amount': numberOrBlank_(record['Violation Amount']),
      'Source Updated At': parseDateOrBlank_(record['Source Updated At']),
      'Updated At': new Date()
    });
  }

  function validateLead_(record) {
    var errors = [];
    if (!record.Address) errors.push('Address is required.');
    if (!record.City) errors.push('City is required.');
    if (!/^[A-Z]{2}$/.test(String(record.State || ''))) errors.push('State must be a two-letter code.');
    if (record.Zip && !/^\d{5}(-\d{4})?$/.test(String(record.Zip))) errors.push('Zip is invalid.');
    if (!record['Parcel ID'] && !record['Source Record ID']) errors.push('Parcel ID or Source Record ID is required.');
    return { ok: errors.length === 0, errors: errors };
  }

  function validateConnector_(connector) {
    if (!connector || typeof connector !== 'object') throw new Error('Connector definition is required.');
    ['id', 'county', 'state'].forEach(function (field) {
      if (!String(connector[field] || '').trim()) throw new Error('Connector missing required field: ' + field);
    });
    if (!Array.isArray(connector.datasets) || !connector.datasets.length) throw new Error('Connector datasets are required.');
    if (typeof connector.fetch !== 'function') throw new Error('Connector fetch(context) is required.');
    if (typeof connector.normalize !== 'function') throw new Error('Connector normalize(record, context) is required.');
  }

  function buildNaturalKey_(record) {
    return [
      normalizeText_(record.Source),
      normalizeText_(record['Source Dataset']),
      normalizeText_(record['Source Record ID'] || record['Parcel ID']),
      normalizeText_(record.Address),
      normalizeText_(record.Zip)
    ].join('|');
  }

  function insertRun_(runId, connector, dataset, mode, started, cursor) {
    REOS.Database.insert(AUDIT_SHEET, {
      'Run ID': runId,
      'Connector ID': connector.id,
      County: connector.county,
      State: connector.state,
      Dataset: dataset,
      Mode: mode,
      Status: 'Running',
      'Started At': started,
      Cursor: cursor,
      'Executed By': currentUser_()
    }, { idField: 'Run ID', idPrefix: 'CCR' });
  }

  function completeRun_(runId, status, stats, completed, started, cursor, message) {
    REOS.Database.update(AUDIT_SHEET, 'Run ID', runId, {
      Status: status,
      'Records Fetched': stats.fetched,
      'Records Valid': stats.valid,
      'Records Inserted': stats.inserted,
      'Records Updated': stats.updated,
      'Records Skipped': stats.skipped,
      'Records Failed': stats.failed,
      'Completed At': completed,
      'Duration Ms': completed.getTime() - started.getTime(),
      Cursor: cursor,
      Message: String(message || '').slice(0, 2000)
    });
  }

  function currentUser_() {
    try { return Session.getActiveUser().getEmail() || 'system'; } catch (e) { return 'system'; }
  }

  function titleCase_(value) {
    return String(value || '').trim().toLowerCase().replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function normalizeText_(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function normalizeZip_(value) {
    var digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 9) return digits.slice(0, 5) + '-' + digits.slice(5);
    return digits.slice(0, 5);
  }

  function numberOrBlank_(value) {
    if (value === '' || value === null || typeof value === 'undefined') return '';
    var number = Number(String(value).replace(/[$,]/g, ''));
    return isNaN(number) ? '' : number;
  }

  function parseDateOrBlank_(value) {
    if (!value) return '';
    var date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? '' : date;
  }

  function logWarning_(message, data) {
    if (REOS.Logger && REOS.Logger.warn) REOS.Logger.warn(message, data || {});
  }

  function logError_(message, error, data) {
    if (REOS.Logger && REOS.Logger.error) REOS.Logger.error(message, Object.assign({}, data || {}, {
      error: error && error.message ? error.message : String(error)
    }));
  }

  return {
    register: register,
    get: get,
    list: list,
    ensureInfrastructure: ensureInfrastructure,
    run: run,
    runAll: runAll,
    validateLead: validateLead_
  };
})();
