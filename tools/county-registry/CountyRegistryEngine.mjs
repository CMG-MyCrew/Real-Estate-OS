import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const REGISTRY_SCHEMA_VERSION = '1.0.0';

const STATUS = {
  DISCOVERED: 'DISCOVERED',
  GENERATED: 'GENERATED',
  READY: 'READY',
  PRODUCTION: 'PRODUCTION',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  DISABLED: 'DISABLED',
  INACCESSIBLE: 'INACCESSIBLE',
  ERROR: 'ERROR'
};

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
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

function nowIso() {
  return new Date().toISOString();
}

function pascalCase(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word =>
      word.charAt(0).toUpperCase() +
      word.slice(1)
    )
    .join('');
}

function generatedConnectorPath(root, manifest) {
  return path.join(
    root,
    'src',
    'connectors',
    'generated',
    `${pascalCase(manifest.county)}CountyConnector.gs`
  );
}

function runCommand({
  root,
  command,
  args,
  inherit = false
}) {
  const result = spawnSync(
    command,
    args,
    {
      cwd: root,
      encoding: 'utf8',
      shell: false,
      stdio: inherit
        ? 'inherit'
        : ['ignore', 'pipe', 'pipe']
    }
  );

  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: inherit
      ? ''
      : String(result.stdout || '').trim(),
    stderr: inherit
      ? ''
      : String(result.stderr || '').trim(),
    error: result.error
      ? result.error.message
      : ''
  };
}

function runTerminal(root, payload) {
  return runCommand({
    root,
    command: 'npx',
    args: [
      'clasp',
      'run',
      'REOS_COUNTY_TERMINAL_SYNC',
      '--params',
      JSON.stringify([payload])
    ]
  });
}

function parseNumber(output, key) {
  const match = String(output || '').match(
    new RegExp(`${key}:\\s*(\\d+)`)
  );

  return match ? Number(match[1]) : null;
}

function parseBoolean(output, key) {
  const match = String(output || '').match(
    new RegExp(`${key}:\\s*(true|false)`)
  );

  if (!match) {
    return null;
  }

  return match[1] === 'true';
}

function parseQuotedValue(output, key) {
  const singleQuoted = String(output || '').match(
    new RegExp(`${key}:\\s*'([^']*)'`)
  );

  if (singleQuoted) {
    return singleQuoted[1];
  }

  const doubleQuoted = String(output || '').match(
    new RegExp(`${key}:\\s*"([^"]*)"`)
  );

  return doubleQuoted
    ? doubleQuoted[1]
    : '';
}

function parseHealthResult(result) {
  const output = [
    result.stdout,
    result.stderr
  ].join('\n');

  return {
    checkedAt: nowIso(),
    ok:
      result.ok &&
      parseBoolean(output, 'ok') === true &&
      !output.includes('Exception:') &&
      !output.includes('DNS error') &&
      !output.includes('HTTP 403'),
    status: parseNumber(output, 'status'),
    count: parseNumber(output, 'count'),
    durationMs: parseNumber(output, 'durationMs'),
    output: output.slice(0, 5000)
  };
}

function parseSyncResult(result) {
  const output = [
    result.stdout,
    result.stderr
  ].join('\n');

  const failed = parseNumber(output, 'failed');
  const logicalOk =
    result.ok &&
    parseBoolean(output, 'ok') === true &&
    failed === 0 &&
    !output.includes('Exception:') &&
    !output.includes('ok: false');

  return {
    checkedAt: nowIso(),
    ok: logicalOk,
    mode: parseQuotedValue(output, 'mode'),
    nextCursor: parseQuotedValue(output, 'nextCursor'),
    stats: {
      fetched: parseNumber(output, 'fetched'),
      valid: parseNumber(output, 'valid'),
      inserted: parseNumber(output, 'inserted'),
      updated: parseNumber(output, 'updated'),
      skipped: parseNumber(output, 'skipped'),
      failed
    },
    output: output.slice(0, 10000)
  };
}

function getMappingConfidence(definition) {
  const confidence =
    definition.autoMapping?.confidence || {};

  const scores = Object.values(confidence)
    .map(item => Number(item?.score))
    .filter(Number.isFinite);

  if (!scores.length) {
    return null;
  }

  return Math.round(
    scores.reduce((sum, score) => sum + score, 0) /
    scores.length
  );
}

function requiredMappingStatus(definition) {
  const mapping = definition.mapping || {};

  const required = [
    'address',
    'parcelId',
    'sourceRecordId'
  ];

  const missing = required.filter(key => {
    return (
      !Array.isArray(mapping[key]) ||
      mapping[key].length === 0
    );
  });

  return {
    ok: missing.length === 0,
    missing
  };
}

function createDatasetEntry(
  connectorId,
  dataset,
  definition
) {
  const mappingStatus =
    requiredMappingStatus(definition);

  return {
    dataset,
    enabled: definition.enabled !== false,
    adapter: definition.adapter || '',
    endpointProperty:
      definition.endpointProperty || '',
    endpoint:
      definition.endpoint ||
      definition.discovery?.endpoint ||
      '',
    endpointConfigured: false,
    discovery: definition.discovery || null,
    mapping: {
      requiredFieldsPresent: mappingStatus.ok,
      missingRequiredFields: mappingStatus.missing,
      confidence: getMappingConfidence(definition),
      fingerprint: hashValue(definition.mapping || {}),
      autoMappedAt:
        definition.autoMapping?.appliedAt || ''
    },
    recordFilter: definition.recordFilter || null,
    health: null,
    lastDrySync: null,
    status: definition.enabled === false
      ? STATUS.DISABLED
      : STATUS.GENERATED,
    updatedAt: nowIso(),
    connectorId
  };
}

function calculateDatasetStatus(dataset) {
  if (dataset.enabled === false) {
    return STATUS.DISABLED;
  }

  if (
    dataset.health &&
    dataset.health.ok === false
  ) {
    if (
      dataset.health.output?.includes('403') ||
      dataset.health.output?.includes('permissions')
    ) {
      return STATUS.INACCESSIBLE;
    }

    return STATUS.REVIEW_REQUIRED;
  }

  if (
    dataset.mapping.requiredFieldsPresent === false
  ) {
    return STATUS.REVIEW_REQUIRED;
  }

  if (
    dataset.lastDrySync &&
    dataset.lastDrySync.ok === false
  ) {
    return STATUS.REVIEW_REQUIRED;
  }

  if (
    dataset.health?.ok === true &&
    dataset.lastDrySync?.ok === true
  ) {
    return STATUS.READY;
  }

  if (dataset.endpoint) {
    return STATUS.GENERATED;
  }

  return STATUS.DISCOVERED;
}

function calculateConnectorStatus(entry) {
  if (entry.enabled === false) {
    return STATUS.DISABLED;
  }

  const datasets = Object.values(
    entry.datasets || {}
  );

  if (!datasets.length) {
    return STATUS.REVIEW_REQUIRED;
  }

  const statuses = datasets.map(
    dataset => dataset.status
  );

  if (statuses.includes(STATUS.ERROR)) {
    return STATUS.ERROR;
  }

  if (statuses.includes(STATUS.INACCESSIBLE)) {
    return STATUS.INACCESSIBLE;
  }

  if (
    statuses.includes(STATUS.REVIEW_REQUIRED)
  ) {
    return STATUS.REVIEW_REQUIRED;
  }

  const active = datasets.filter(
    dataset => dataset.enabled !== false
  );

  if (
    active.length &&
    active.every(
      dataset => dataset.status === STATUS.READY
    )
  ) {
    return STATUS.READY;
  }

  if (
    active.some(
      dataset =>
        dataset.status === STATUS.GENERATED ||
        dataset.status === STATUS.READY
    )
  ) {
    return STATUS.GENERATED;
  }

  return STATUS.DISCOVERED;
}

function mergeOperationalState(
  currentEntry,
  generatedEntry
) {
  if (!currentEntry) {
    return generatedEntry;
  }

  for (
    const [datasetName, generatedDataset]
    of Object.entries(generatedEntry.datasets)
  ) {
    const currentDataset =
      currentEntry.datasets?.[datasetName];

    if (!currentDataset) {
      continue;
    }

    if (
      currentDataset.mapping?.fingerprint ===
      generatedDataset.mapping?.fingerprint
    ) {
      generatedDataset.health =
        currentDataset.health || null;

      generatedDataset.lastDrySync =
        currentDataset.lastDrySync || null;

      generatedDataset.endpointConfigured =
        currentDataset.endpointConfigured === true;
    }
  }

  generatedEntry.lastVerifiedAt =
    currentEntry.lastVerifiedAt || '';

  generatedEntry.lastSuccessfulSyncAt =
    currentEntry.lastSuccessfulSyncAt || '';

  generatedEntry.history =
    Array.isArray(currentEntry.history)
      ? currentEntry.history.slice(-50)
      : [];

  return generatedEntry;
}

function buildRegistryEntry(root, manifestPath, manifest) {
  const connectorPath =
    generatedConnectorPath(root, manifest);

  const datasets = {};

  for (
    const [dataset, definition]
    of Object.entries(manifest.datasets || {})
  ) {
    datasets[dataset] = createDatasetEntry(
      manifest.id,
      dataset,
      definition
    );
  }

  const entry = {
    connectorId: manifest.id,
    state: manifest.state,
    county: manifest.county,
    version: manifest.version || '1.0.0',
    enabled: manifest.enabled !== false,
    implementation: 'generated',
    manifestPath:
      path.relative(root, manifestPath),
    connectorPath:
      path.relative(root, connectorPath),
    connectorExists:
      fs.existsSync(connectorPath),
    manifestFingerprint:
      hashValue(manifest),
    datasets,
    status: STATUS.GENERATED,
    lastVerifiedAt: '',
    lastSuccessfulSyncAt: '',
    updatedAt: nowIso(),
    history: []
  };

  for (const dataset of Object.values(entry.datasets)) {
    dataset.status =
      calculateDatasetStatus(dataset);
  }

  entry.status = calculateConnectorStatus(entry);

  return entry;
}

export function registryPath(root) {
  return path.join(
    root,
    'config',
    'county-registry',
    'registry.json'
  );
}

export function loadRegistry(root) {
  return readJson(
    registryPath(root),
    {
      schemaVersion: REGISTRY_SCHEMA_VERSION,
      generatedAt: '',
      updatedAt: '',
      connectors: {}
    }
  );
}

export function refreshRegistry(options = {}) {
  const root = options.root || process.cwd();

  const manifestsDirectory = path.join(
    root,
    'config',
    'county-connectors'
  );

  ensureDirectory(manifestsDirectory);

  const currentRegistry = loadRegistry(root);

  const registry = {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    generatedAt:
      currentRegistry.generatedAt || nowIso(),
    updatedAt: nowIso(),
    connectors: {}
  };

  const manifestFiles = fs
    .readdirSync(manifestsDirectory)
    .filter(file => file.endsWith('.json'))
    .sort();

  for (const file of manifestFiles) {
    const manifestPath = path.join(
      manifestsDirectory,
      file
    );

    let manifest;

    try {
      manifest = readJson(manifestPath);
    } catch (error) {
      continue;
    }

    if (!manifest?.id) {
      continue;
    }

    const generatedEntry =
      buildRegistryEntry(
        root,
        manifestPath,
        manifest
      );

    registry.connectors[manifest.id] =
      mergeOperationalState(
        currentRegistry.connectors?.[manifest.id],
        generatedEntry
      );

    registry.connectors[manifest.id].status =
      calculateConnectorStatus(
        registry.connectors[manifest.id]
      );
  }

  /*
   * Philadelphia remains handcrafted and may not have a generated
   * manifest. Keep a minimal registry entry when its connector exists.
   */
  const philadelphiaPath = path.join(
    root,
    'src',
    'connectors',
    'PhiladelphiaCountyConnector.gs'
  );

  if (
    fs.existsSync(philadelphiaPath) &&
    !registry.connectors['PA-PHILADELPHIA']
  ) {
    registry.connectors['PA-PHILADELPHIA'] = {
      connectorId: 'PA-PHILADELPHIA',
      state: 'PA',
      county: 'Philadelphia',
      version: '1.0.0',
      enabled: true,
      implementation: 'handcrafted',
      manifestPath: '',
      connectorPath:
        path.relative(root, philadelphiaPath),
      connectorExists: true,
      manifestFingerprint: '',
      datasets: {},
      status: STATUS.PRODUCTION,
      lastVerifiedAt: '',
      lastSuccessfulSyncAt: '',
      updatedAt: nowIso(),
      history: []
    };
  }

  writeJsonAtomic(
    registryPath(root),
    registry
  );

  return registry;
}

function resolveEndpoint(
  root,
  connectorId,
  dataset,
  datasetEntry
) {
  if (datasetEntry.endpoint) {
    return datasetEntry.endpoint;
  }

  const result = runTerminal(root, {
    action: 'get-endpoint',
    connectorId,
    dataset
  });

  if (!result.ok) {
    return '';
  }

  return parseQuotedValue(
    result.stdout,
    'endpoint'
  );
}

function appendHistory(entry, event) {
  entry.history = Array.isArray(entry.history)
    ? entry.history
    : [];

  entry.history.push({
    at: nowIso(),
    ...event
  });

  entry.history = entry.history.slice(-50);
}

export function updateConnectorRegistry(options = {}) {
  const root = options.root || process.cwd();

  const registry = refreshRegistry({ root });

  const connectorId = String(
    options.connectorId || ''
  )
    .trim()
    .toUpperCase();

  if (!connectorId) {
    throw new Error(
      'connectorId is required for registry update.'
    );
  }

  const entry = registry.connectors[connectorId];

  if (!entry) {
    throw new Error(
      `Connector is not present in the registry: ${connectorId}`
    );
  }

  const datasets = Object.entries(
    entry.datasets || {}
  );

  if (!datasets.length) {
    appendHistory(entry, {
      action: 'registry-update',
      ok: true,
      message:
        'No manifest-backed datasets were available for verification.'
    });

    entry.lastVerifiedAt = nowIso();
    writeJsonAtomic(
      registryPath(root),
      registry
    );

    return entry;
  }

  for (
    const [datasetName, datasetEntry]
    of datasets
  ) {
    if (datasetEntry.enabled === false) {
      datasetEntry.status = STATUS.DISABLED;
      continue;
    }

    const endpoint = resolveEndpoint(
      root,
      connectorId,
      datasetName,
      datasetEntry
    );

    datasetEntry.endpoint = endpoint;
    datasetEntry.endpointConfigured =
      Boolean(endpoint);

    if (!endpoint) {
      datasetEntry.status =
        STATUS.REVIEW_REQUIRED;

      appendHistory(entry, {
        action: 'endpoint-check',
        dataset: datasetName,
        ok: false,
        message: 'No endpoint configured.'
      });

      if (!options.continueOnError) {
        break;
      }

      continue;
    }

    if (options.health === true) {
      const healthResult = runTerminal(root, {
        action: 'adapter-health',
        adapter: datasetEntry.adapter,
        endpoint
      });

      datasetEntry.health =
        parseHealthResult(healthResult);

      appendHistory(entry, {
        action: 'health-check',
        dataset: datasetName,
        ok: datasetEntry.health.ok,
        status: datasetEntry.health.status,
        durationMs:
          datasetEntry.health.durationMs
      });

      if (
        !datasetEntry.health.ok &&
        !options.continueOnError
      ) {
        datasetEntry.status =
          calculateDatasetStatus(datasetEntry);
        break;
      }
    }

    if (options.test === true) {
      const syncResult = runTerminal(root, {
        action: 'sync',
        connectorId,
        dataset: datasetName,
        limit: options.limit || 10,
        cursor: String(options.cursor || ''),
        dryRun: true
      });

      datasetEntry.lastDrySync =
        parseSyncResult(syncResult);

      appendHistory(entry, {
        action: 'dry-sync',
        dataset: datasetName,
        ok: datasetEntry.lastDrySync.ok,
        stats: datasetEntry.lastDrySync.stats
      });

      if (datasetEntry.lastDrySync.ok) {
        entry.lastSuccessfulSyncAt =
          datasetEntry.lastDrySync.checkedAt;
      }

      if (
        !datasetEntry.lastDrySync.ok &&
        !options.continueOnError
      ) {
        datasetEntry.status =
          calculateDatasetStatus(datasetEntry);
        break;
      }
    }

    datasetEntry.status =
      calculateDatasetStatus(datasetEntry);

    datasetEntry.updatedAt = nowIso();
  }

  entry.lastVerifiedAt = nowIso();
  entry.updatedAt = nowIso();
  entry.status = calculateConnectorStatus(entry);

  appendHistory(entry, {
    action: 'registry-update-complete',
    ok:
      entry.status !== STATUS.ERROR &&
      entry.status !== STATUS.REVIEW_REQUIRED &&
      entry.status !== STATUS.INACCESSIBLE,
    status: entry.status
  });

  registry.updatedAt = nowIso();

  writeJsonAtomic(
    registryPath(root),
    registry
  );

  return entry;
}

export function updateAllRegistry(options = {}) {
  const root = options.root || process.cwd();

  const registry = refreshRegistry({ root });

  const connectorIds = Object.keys(
    registry.connectors || {}
  ).sort();

  const results = [];

  for (const connectorId of connectorIds) {
    const entry = registry.connectors[connectorId];

    if (
      options.generatedOnly === true &&
      entry.implementation !== 'generated'
    ) {
      continue;
    }

    try {
      const updated = updateConnectorRegistry({
        ...options,
        root,
        connectorId
      });

      results.push({
        connectorId,
        ok:
          updated.status !== STATUS.ERROR &&
          updated.status !== STATUS.REVIEW_REQUIRED &&
          updated.status !== STATUS.INACCESSIBLE,
        status: updated.status
      });
    } catch (error) {
      results.push({
        connectorId,
        ok: false,
        status: STATUS.ERROR,
        error: error.message
      });

      if (!options.continueOnError) {
        break;
      }
    }
  }

  return {
    checkedAt: nowIso(),
    count: results.length,
    passed: results.filter(item => item.ok).length,
    failed: results.filter(item => !item.ok).length,
    results
  };
}

export function listRegistry(options = {}) {
  const root = options.root || process.cwd();

  const registry = refreshRegistry({ root });

  return Object.values(registry.connectors)
    .filter(entry => {
      if (options.state) {
        return entry.state ===
          String(options.state).toUpperCase();
      }

      return true;
    })
    .sort((left, right) =>
      left.connectorId.localeCompare(
        right.connectorId
      )
    );
}

export function getRegistryEntry(
  root,
  connectorId
) {
  const registry = refreshRegistry({ root });

  return (
    registry.connectors[
      String(connectorId || '')
        .trim()
        .toUpperCase()
    ] || null
  );
}

export function saveRegistryUpdateReport(
  root,
  report
) {
  const outputPath = path.join(
    root,
    'reports',
    'county-registry',
    'update-report.json'
  );

  writeJsonAtomic(outputPath, report);

  return outputPath;
}

export { STATUS };
