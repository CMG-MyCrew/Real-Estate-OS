import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(
    fs.readFileSync(filePath, 'utf8')
  );
}

function writeJsonAtomic(filePath, value) {
  ensureDirectory(path.dirname(filePath));

  const temporaryPath =
    `${filePath}.tmp-${process.pid}-${Date.now()}`;

  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );

  fs.renameSync(temporaryPath, filePath);
}

function hashValue(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function normalizeType(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  const type = typeof value;

  if (type === 'number') {
    return Number.isInteger(value)
      ? 'integer'
      : 'number';
  }

  return type;
}

function inferFieldType(values) {
  const populated = values.filter(value => {
    return (
      value !== null &&
      typeof value !== 'undefined' &&
      String(value).trim() !== ''
    );
  });

  if (!populated.length) {
    return 'empty';
  }

  const types = new Set(
    populated.map(normalizeType)
  );

  if (types.size === 1) {
    return [...types][0];
  }

  if (
    types.size === 2 &&
    types.has('integer') &&
    types.has('number')
  ) {
    return 'number';
  }

  return 'mixed';
}

function buildSchema(records) {
  const fieldNames = new Set();

  records.forEach(record => {
    Object.keys(record || {}).forEach(field => {
      fieldNames.add(field);
    });
  });

  const fields = {};

  [...fieldNames]
    .sort()
    .forEach(field => {
      const values = records.map(record => {
        return record?.[field];
      });

      const populated = values.filter(value => {
        return (
          value !== null &&
          typeof value !== 'undefined' &&
          String(value).trim() !== ''
        );
      });

      fields[field] = {
        type: inferFieldType(values),
        populatedCount: populated.length,
        completeness: records.length
          ? populated.length / records.length
          : 0,
        uniqueCount: new Set(
          populated.map(value => String(value))
        ).size,
        sampleValues: populated.slice(0, 5)
      };
    });

  const schema = {
    sampleCount: records.length,
    fields
  };

  schema.fingerprint = hashValue(fields);

  return schema;
}

function compareSchemas(previous, current) {
  if (!previous) {
    return {
      severity: 'BASELINE',
      changed: false,
      addedFields: [],
      removedFields: [],
      changedTypes: [],
      completenessChanges: [],
      requiresReview: false
    };
  }

  const previousFields =
    previous.fields || {};

  const currentFields =
    current.fields || {};

  const previousNames =
    new Set(Object.keys(previousFields));

  const currentNames =
    new Set(Object.keys(currentFields));

  const addedFields = [...currentNames]
    .filter(field => !previousNames.has(field))
    .sort();

  const removedFields = [...previousNames]
    .filter(field => !currentNames.has(field))
    .sort();

  const changedTypes = [];
  const completenessChanges = [];

  [...currentNames]
    .filter(field => previousNames.has(field))
    .forEach(field => {
      const before = previousFields[field];
      const after = currentFields[field];

      if (before.type !== after.type) {
        changedTypes.push({
          field,
          before: before.type,
          after: after.type
        });
      }

      const difference =
        Number(after.completeness || 0) -
        Number(before.completeness || 0);

      if (Math.abs(difference) >= 0.25) {
        completenessChanges.push({
          field,
          before: before.completeness,
          after: after.completeness,
          difference
        });
      }
    });

  let severity = 'NONE';

  if (
    removedFields.length ||
    changedTypes.length
  ) {
    severity = 'HIGH';
  } else if (
    addedFields.length ||
    completenessChanges.length
  ) {
    severity = 'MEDIUM';
  }

  return {
    severity,
    changed: severity !== 'NONE',
    addedFields,
    removedFields,
    changedTypes,
    completenessChanges,
    requiresReview:
      severity === 'HIGH'
  };
}

async function fetchArcGIS(endpoint, sampleCount) {
  const url = new URL(endpoint);

  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', '*');
  url.searchParams.set(
    'returnGeometry',
    'false'
  );
  url.searchParams.set(
    'resultRecordCount',
    String(sampleCount)
  );
  url.searchParams.set('resultOffset', '0');
  url.searchParams.set('f', 'json');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'REOS-Schema-Drift-Engine/1.0'
    }
  });

  const body = await response.text();

  let payload;

  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new Error(
      `ArcGIS schema response was not JSON: ` +
      `${error.message}; body=${body.slice(0, 500)}`
    );
  }

  if (!response.ok || payload.error) {
    throw new Error(
      `ArcGIS schema request failed: ` +
      `${JSON.stringify(payload.error || payload)}`
    );
  }

  return (payload.features || []).map(feature => {
    return feature?.attributes || feature;
  });
}

async function fetchJSON(endpoint, sampleCount) {
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'REOS-Schema-Drift-Engine/1.0'
    }
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `JSON schema request failed with HTTP ` +
      `${response.status}; body=${body.slice(0, 500)}`
    );
  }

  let payload;

  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new Error(
      `JSON schema response was invalid: ` +
      `${error.message}; body=${body.slice(0, 500)}`
    );
  }

  const records = Array.isArray(payload)
    ? payload
    : payload.records ||
      payload.results ||
      payload.data ||
      [];

  return records.slice(0, sampleCount);
}

async function fetchSocrata(endpoint, sampleCount) {
  const url = new URL(endpoint);

  url.searchParams.set(
    '$limit',
    String(sampleCount)
  );

  return fetchJSON(
    url.toString(),
    sampleCount
  );
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const character = text[index];
    const next = text[index + 1];

    if (
      character === '"' &&
      quoted &&
      next === '"'
    ) {
      value += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (
      character === ',' &&
      !quoted
    ) {
      row.push(value);
      value = '';
      continue;
    }

    if (
      (
        character === '\n' ||
        character === '\r'
      ) &&
      !quoted
    ) {
      if (
        character === '\r' &&
        next === '\n'
      ) {
        index += 1;
      }

      row.push(value);
      value = '';

      if (row.some(cell => cell !== '')) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    value += character;
  }

  if (value !== '' || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

async function fetchCSV(endpoint, sampleCount) {
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'text/csv',
      'User-Agent':
        'REOS-Schema-Drift-Engine/1.0'
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `CSV schema request failed with HTTP ` +
      `${response.status}; body=${text.slice(0, 500)}`
    );
  }

  const rows = parseCSV(text);

  if (!rows.length) {
    return [];
  }

  const headers = rows.shift();

  return rows
    .slice(0, sampleCount)
    .map(row => {
      const record = {};

      headers.forEach((header, index) => {
        record[header] =
          typeof row[index] === 'undefined'
            ? ''
            : row[index];
      });

      return record;
    });
}

async function fetchRecords({
  adapter,
  endpoint,
  sampleCount
}) {
  switch (adapter) {
    case 'arcgis':
      return fetchArcGIS(
        endpoint,
        sampleCount
      );

    case 'socrata':
      return fetchSocrata(
        endpoint,
        sampleCount
      );

    case 'json':
    case 'json-api':
      return fetchJSON(
        endpoint,
        sampleCount
      );

    case 'csv':
      return fetchCSV(
        endpoint,
        sampleCount
      );

    default:
      throw new Error(
        `Schema drift does not support adapter ` +
        `"${adapter}".`
      );
  }
}

function snapshotPath(
  root,
  connectorId,
  dataset
) {
  return path.join(
    root,
    'config',
    'county-registry',
    'schemas',
    connectorId,
    `${dataset}.json`
  );
}

function datasetReportPath(
  root,
  connectorId,
  dataset
) {
  return path.join(
    root,
    'reports',
    'schema-drift',
    connectorId,
    `${dataset}.json`
  );
}

export async function inspectDatasetSchema(
  options
) {
  const {
    root,
    connectorId,
    dataset,
    adapter,
    endpoint
  } = options;

  const sampleCount = Math.max(
    5,
    Math.min(
      Number(options.sampleCount || 50),
      250
    )
  );

  const records = await fetchRecords({
    adapter,
    endpoint,
    sampleCount
  });

  if (!records.length) {
    throw new Error(
      `${connectorId}/${dataset} returned ` +
      `no schema sample records.`
    );
  }

  const currentSchema =
    buildSchema(records);

  const baselinePath = snapshotPath(
    root,
    connectorId,
    dataset
  );

  const previousSnapshot =
    readJson(baselinePath, null);

  const comparison = compareSchemas(
    previousSnapshot?.schema || null,
    currentSchema
  );

  const result = {
    schemaVersion: '1.0.0',
    checkedAt: nowIso(),
    connectorId,
    dataset,
    adapter,
    endpoint,
    baselineExists:
      Boolean(previousSnapshot),
    schema: currentSchema,
    comparison,
    status:
      comparison.requiresReview
        ? 'REVIEW_REQUIRED'
        : comparison.changed
          ? 'CHANGED'
          : previousSnapshot
            ? 'UNCHANGED'
            : 'BASELINE_CREATED'
  };

  writeJsonAtomic(
    datasetReportPath(
      root,
      connectorId,
      dataset
    ),
    result
  );

  if (
    !previousSnapshot ||
    options.accept === true
  ) {
    writeJsonAtomic(
      baselinePath,
      {
        schemaVersion: '1.0.0',
        acceptedAt: nowIso(),
        connectorId,
        dataset,
        adapter,
        endpoint,
        schema: currentSchema
      }
    );
  }

  return result;
}

export async function inspectConnectorSchemas(
  options
) {
  const results = [];

  for (
    const datasetEntry
    of options.datasets || []
  ) {
    if (
      datasetEntry.enabled === false ||
      !datasetEntry.endpoint
    ) {
      results.push({
        connectorId:
          options.connectorId,
        dataset:
          datasetEntry.dataset,
        status: 'SKIPPED',
        ok: true,
        reason:
          datasetEntry.enabled === false
            ? 'Dataset disabled.'
            : 'Endpoint missing.'
      });

      continue;
    }

    try {
      const result =
        await inspectDatasetSchema({
          root: options.root,
          connectorId:
            options.connectorId,
          dataset:
            datasetEntry.dataset,
          adapter:
            datasetEntry.adapter,
          endpoint:
            datasetEntry.endpoint,
          sampleCount:
            options.sampleCount,
          accept:
            options.accept
        });

      results.push({
        ...result,
        ok:
          result.status !==
          'REVIEW_REQUIRED'
      });
    } catch (error) {
      results.push({
        connectorId:
          options.connectorId,
        dataset:
          datasetEntry.dataset,
        status: 'ERROR',
        ok: false,
        error: error.message
      });

      if (!options.continueOnError) {
        break;
      }
    }
  }

  return results;
}

export function saveDriftSummary(
  root,
  summary
) {
  const outputPath = path.join(
    root,
    'reports',
    'schema-drift',
    'summary.json'
  );

  writeJsonAtomic(
    outputPath,
    summary
  );

  return outputPath;
}
