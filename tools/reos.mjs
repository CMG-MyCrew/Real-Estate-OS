#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import {
  discoverCounty,
  saveDiscoveryReport
} from './county-discovery/CountyDiscoveryEngine.mjs';
import {
  discoverAllDatasets,
  saveAutomaticDiscoveryPlan,
  saveUnderlyingDiscoveryReport
} from './county-discovery/AutomaticDatasetDiscovery.mjs';
import {
  fetchSampleRecords,
  inferFieldMapping,
  saveMappingReport
} from './county-mapping/AutomaticFieldMapper.mjs';
import {
  runCountyBuildPipeline
} from './county-build/CountyBuildPipeline.mjs';
import {
  runStateBuildPipeline
} from './state-build/StateBuildPipeline.mjs';
import {
  refreshRegistry,
  listRegistry,
  getRegistryEntry,
  updateConnectorRegistry,
  updateAllRegistry,
  saveRegistryUpdateReport
} from './county-registry/CountyRegistryEngine.mjs';
import {
  runNationalBuildPipeline
} from './national-build/NationalBuildPipeline.mjs';
import {
  inspectConnectorSchemas,
  saveDriftSummary
} from './schema-drift/SchemaDriftEngine.mjs';
import {
  planConnectorRepair,
  healConnector,
  healAllConnectors
} from './self-healing/SelfHealingEngine.mjs';

const ROOT = process.cwd();
const CONNECTOR_DIR = path.join(ROOT, 'src', 'connectors', 'generated');
const MANIFEST_DIR = path.join(ROOT, 'config', 'county-connectors');

function fail(message, exitCode = 1) {
  console.error(`ERROR: ${message}`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const result = {
    _: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      result._.push(token);
      continue;
    }

    const equalIndex = token.indexOf('=');

    if (equalIndex !== -1) {
      result[token.slice(2, equalIndex)] = token.slice(equalIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function normalizeState(value) {
  const state = String(value || '').trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(state)) {
    fail('--state must be a two-letter state abbreviation.');
  }

  return state;
}

function normalizeCounty(value) {
  const county = String(value || '')
    .trim()
    .replace(/\s+County$/i, '')
    .replace(/\s+/g, ' ');

  if (!county) {
    fail('--county is required.');
  }

  return county;
}

function pascalCase(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function connectorId(state, county) {
  return `${state}-${county.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`;
}

function splitList(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function ensureDirectories() {
  fs.mkdirSync(CONNECTOR_DIR, { recursive: true });
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
}

function propertyKey(id, dataset) {
  return `REOS_COUNTY_${id.replace(/-/g, '_')}_${dataset.toUpperCase()}_URL`;
}

function buildManifest({
  state,
  county,
  adapter,
  datasets
}) {
  const id = connectorId(state, county);

  const datasetDefinitions = {};

  for (const dataset of datasets) {
    datasetDefinitions[dataset] = {
      adapter,
      endpointProperty: propertyKey(id, dataset),
      enabled: true,
      maxLimit: adapter === 'arcgis' ? 2000 : 5000,
      mapping: {
        address: [
          'address',
          'street_address',
          'property_address',
          'location'
        ],
        city: [
          'city',
          'property_city'
        ],
        zip: [
          'zip',
          'zipcode',
          'zip_code',
          'postal_code'
        ],
        parcelId: [
          'parcel_number',
          'parcel_id',
          'opa_number',
          'account_number'
        ],
        ownerName: [
          'owner_name',
          'owner',
          'legal_owner'
        ],
        sourceRecordId: [
          'objectid',
          'id',
          'record_id',
          'parcel_number'
        ],
        sourceUpdatedAt: [
          'updated_at',
          'last_updated',
          'date_updated'
        ]
      }
    };
  }

  return {
    id,
    state,
    county,
    version: '1.0.0',
    enabled: true,
    generatedAt: new Date().toISOString(),
    datasets: datasetDefinitions
  };
}

function toAppsScriptLiteral(value, indent = 0) {
  const spacing = ' '.repeat(indent);
  const nextSpacing = ' '.repeat(indent + 2);

  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return '[]';
    }

    return `[\n${value
      .map(item => `${nextSpacing}${toAppsScriptLiteral(item, indent + 2)}`)
      .join(',\n')}\n${spacing}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);

    if (!entries.length) {
      return '{}';
    }

    return `{\n${entries
      .map(([key, item]) => {
        const formattedKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
          ? key
          : JSON.stringify(key);

        return `${nextSpacing}${formattedKey}: ${toAppsScriptLiteral(
          item,
          indent + 2
        )}`;
      })
      .join(',\n')}\n${spacing}}`;
  }

  return JSON.stringify(value);
}

function buildConnectorSource(manifest) {
  const countyClass = `${pascalCase(manifest.county)}CountyConnector`;
  const manifestLiteral = toAppsScriptLiteral(manifest, 2);

  return `/**
 * REOS Enterprise - ${manifest.county} County Connector
 * Generated by tools/reos.mjs.
 *
 * Configure dataset endpoints through REOS_COUNTY_TERMINAL_SYNC using
 * action=configure-endpoint before running a dataset.
 */
var REOS = REOS || {};

REOS.GeneratedCountyConnectorRegistrars =
  REOS.GeneratedCountyConnectorRegistrars || [];

REOS.${countyClass} = (function () {
  var MANIFEST = ${manifestLiteral};

  function register() {
    return REOS.CountyConnectorSDK.register({
      id: MANIFEST.id,
      county: MANIFEST.county,
      state: MANIFEST.state,
      version: MANIFEST.version,
      enabled: MANIFEST.enabled !== false,
      datasets: Object.keys(MANIFEST.datasets),
      fetch: fetch_,
      normalize: normalize_,
      validate: validate_
    });
  }

  function fetch_(context) {
    var definition = getDatasetDefinition_(context.dataset);
    var endpoint = getEndpoint_(context.dataset, context.config);

    if (!endpoint) {
      throw new Error(
        'Missing endpoint for ' +
        MANIFEST.id +
        ' dataset ' +
        context.dataset +
        '. Configure ' +
        definition.endpointProperty +
        '.'
      );
    }

    var adapterOptions = {
      endpoint: endpoint,
      context: context,
      maxLimit: definition.maxLimit || 2000
    };

    if (definition.adapter === 'arcgis') {
      adapterOptions.where = '1=1';
      adapterOptions.outFields = '*';
      adapterOptions.returnGeometry = false;
    }

    return REOS.CountyAdapters.Registry.fetch(
      definition.adapter,
      adapterOptions
    );
  }

  function normalize_(raw, context) {
    raw = raw || {};

    var definition = getDatasetDefinition_(context.dataset);
    var mapping = definition.mapping || {};

    if (!passesRecordFilter_(raw, definition.recordFilter)) {
      return {
        __skip: true,
        __skipReason: 'Record did not satisfy dataset record filter.'
      };
    }

    return {
      Address: first_(raw, mapping.address || []),
      City:
        first_(raw, mapping.city || []) ||
        MANIFEST.county,
      State: MANIFEST.state,
      Zip: first_(raw, mapping.zip || []),
      County: MANIFEST.county,
      'Parcel ID': first_(raw, mapping.parcelId || []),
      'Owner Name': first_(raw, mapping.ownerName || []),
      'Co-Owner Name': first_(
        raw,
        mapping.coOwnerName || []
      ),
      'Source Record ID': first_(
        raw,
        mapping.sourceRecordId || []
      ),
      'Estimated Value': numberFirst_(
        raw,
        mapping.estimatedValue || []
      ),
      'Assessment Value': numberFirst_(
        raw,
        mapping.assessmentValue || []
      ),
      'Year Built': numberFirst_(
        raw,
        mapping.yearBuilt || []
      ),
      'Land Acres': numberFirst_(
        raw,
        mapping.landAcres || []
      ),
      'Living Area': numberFirst_(
        raw,
        mapping.livingArea || []
      ),
      'Last Sale Date': first_(
        raw,
        mapping.saleDate || []
      ),
      'Last Sale Price': numberFirst_(
        raw,
        mapping.salePrice || []
      ),
      Source: MANIFEST.id,
      'Source Dataset': context.dataset,
      'Source Updated At': first_(
        raw,
        mapping.sourceUpdatedAt || []
      ),
      'Distress Type': datasetLabel_(context.dataset),
      Notes:
        'Generated county connector record from ' +
        MANIFEST.id +
        ' / ' +
        context.dataset
    };
  }

  function validate_(record) {
    return REOS.CountyConnectorSDK.validateLead(record);
  }

  function getDatasetDefinition_(dataset) {
    var definition = MANIFEST.datasets[dataset];

    if (!definition) {
      throw new Error(
        'Dataset is not configured for ' +
        MANIFEST.id +
        ': ' +
        dataset
      );
    }

    if (definition.enabled === false) {
      throw new Error(
        'Dataset is disabled for ' +
        MANIFEST.id +
        ': ' +
        dataset
      );
    }

    return definition;
  }

  function getEndpoint_(dataset, config) {
    var definition = getDatasetDefinition_(dataset);

    return (
      (config && config.endpoint) ||
      PropertiesService
        .getScriptProperties()
        .getProperty(definition.endpointProperty) ||
      ''
    );
  }

  function passesRecordFilter_(raw, filter) {
    if (!filter) {
      return true;
    }

    var requireAny = filter.requireAny || [];

    for (var groupIndex = 0; groupIndex < requireAny.length; groupIndex += 1) {
      var keys = requireAny[groupIndex] || [];
      var matched = false;

      for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
        var value = raw[keys[keyIndex]];

        if (
          value !== null &&
          typeof value !== 'undefined' &&
          String(value).trim() !== ''
        ) {
          matched = true;
          break;
        }
      }

      if (!matched) {
        return false;
      }
    }

    return true;
  }

  function first_(object, keys) {
    for (var index = 0; index < keys.length; index += 1) {
      var key = keys[index];
      var value = object[key];

      if (
        value !== null &&
        typeof value !== 'undefined' &&
        String(value).trim() !== ''
      ) {
        return value;
      }
    }

    return '';
  }

  function numberFirst_(object, keys) {
    var value = first_(object, keys);

    if (value === '') {
      return '';
    }

    var normalized = String(value)
      .replace(/[$,]/g, '')
      .trim();

    var number = Number(normalized);

    return isNaN(number) ? '' : number;
  }

  function datasetLabel_(dataset) {
    return String(dataset || '')
      .replace(/_/g, ' ')
      .replace(/\\b\\w/g, function (letter) {
        return letter.toUpperCase();
      });
  }

  return {
    connectorId: MANIFEST.id,
    manifest: MANIFEST,
    register: register
  };
})();

REOS.GeneratedCountyConnectorRegistrars.push(function () {
  if (
    !REOS.CountyConnectorSDK.get(
      REOS.${countyClass}.connectorId
    )
  ) {
    REOS.${countyClass}.register();
  }
});
`;
}

function commandCreate(args) {
  ensureDirectories();

  const state = normalizeState(args.state);
  const county = normalizeCounty(args.county);
  const adapter = String(args.adapter || 'arcgis')
    .trim()
    .toLowerCase();

  const allowedAdapters = [
    'arcgis',
    'html-table',
    'json-api',
    'socrata',
    'csv'
  ];

  if (!allowedAdapters.includes(adapter)) {
    fail(
      `Unsupported adapter "${adapter}". ` +
      `Use one of: ${allowedAdapters.join(', ')}`
    );
  }

  const datasets = splitList(args.datasets, ['property_assessment']);

  if (!datasets.length) {
    fail('At least one dataset is required.');
  }

  for (const dataset of datasets) {
    if (!/^[a-z][a-z0-9_]*$/.test(dataset)) {
      fail(
        `Invalid dataset "${dataset}". ` +
        'Use lowercase snake_case.'
      );
    }
  }

  const manifest = buildManifest({
    state,
    county,
    adapter,
    datasets
  });

  const className = `${pascalCase(county)}CountyConnector`;
  const connectorPath = path.join(
    CONNECTOR_DIR,
    `${className}.gs`
  );

  const manifestPath = path.join(
    MANIFEST_DIR,
    `${manifest.id}.json`
  );

  if (
    !args.force &&
    (fs.existsSync(connectorPath) || fs.existsSync(manifestPath))
  ) {
    fail(
      `Connector ${manifest.id} already exists. ` +
      'Use --force to overwrite.'
    );
  }

  fs.writeFileSync(
    connectorPath,
    buildConnectorSource(manifest),
    'utf8'
  );

  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  console.log(`Created connector: ${manifest.id}`);
  console.log(`Connector file: ${path.relative(ROOT, connectorPath)}`);
  console.log(`Manifest file:  ${path.relative(ROOT, manifestPath)}`);
  console.log('');
  console.log('Configure endpoints with:');

  for (const dataset of datasets) {
    console.log(`
npx clasp run REOS_COUNTY_TERMINAL_SYNC \\
  --params '[{
    "action":"configure-endpoint",
    "connectorId":"${manifest.id}",
    "dataset":"${dataset}",
    "endpoint":"PASTE_ENDPOINT_HERE"
  }]'`);
  }

  console.log(`
Then push and test:

npx clasp push

./tools/reos county:test \\
  --connector ${manifest.id} \\
  --limit 5`);
}

function readManifests() {
  ensureDirectories();

  return fs
    .readdirSync(MANIFEST_DIR)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => {
      const fullPath = path.join(MANIFEST_DIR, file);

      try {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch (error) {
        return {
          id: file,
          invalid: true,
          error: error.message
        };
      }
    });
}

function findManifestById(id) {
  const normalizedId = String(id || '')
    .trim()
    .toUpperCase();

  if (!normalizedId) {
    fail('--connector is required.');
  }

  const manifestPath = path.join(
    MANIFEST_DIR,
    `${normalizedId}.json`
  );

  if (!fs.existsSync(manifestPath)) {
    fail(
      `County connector manifest not found: ` +
      `${path.relative(ROOT, manifestPath)}`
    );
  }

  let manifest;

  try {
    manifest = JSON.parse(
      fs.readFileSync(manifestPath, 'utf8')
    );
  } catch (error) {
    fail(
      `Invalid county connector manifest ${normalizedId}: ` +
      error.message
    );
  }

  if (!manifest.id) {
    fail(
      `Manifest ${normalizedId} is missing id.`
    );
  }

  if (!manifest.state) {
    fail(
      `Manifest ${normalizedId} is missing state.`
    );
  }

  if (!manifest.county) {
    fail(
      `Manifest ${normalizedId} is missing county.`
    );
  }

  if (
    !manifest.datasets ||
    typeof manifest.datasets !== 'object' ||
    Array.isArray(manifest.datasets)
  ) {
    fail(
      `Manifest ${normalizedId} must contain a datasets object.`
    );
  }

  return {
    manifest,
    manifestPath
  };
}

function connectorPathForManifest(manifest) {
  const className =
    `${pascalCase(manifest.county)}CountyConnector`;

  return path.join(
    CONNECTOR_DIR,
    `${className}.gs`
  );
}

function validateManifest(manifest) {
  const allowedAdapters = new Set([
    'arcgis',
    'html-table',
    'json-api',
    'socrata',
    'csv'
  ]);

  const datasetNames = Object.keys(
    manifest.datasets || {}
  );

  if (!datasetNames.length) {
    fail(
      `Manifest ${manifest.id} contains no datasets.`
    );
  }

  for (const datasetName of datasetNames) {
    if (!/^[a-z][a-z0-9_]*$/.test(datasetName)) {
      fail(
        `Manifest ${manifest.id} has invalid dataset ` +
        `"${datasetName}". Use lowercase snake_case.`
      );
    }

    const definition =
      manifest.datasets[datasetName] || {};

    const adapter = String(
      definition.adapter || ''
    )
      .trim()
      .toLowerCase();

    if (!allowedAdapters.has(adapter)) {
      fail(
        `Manifest ${manifest.id} dataset ` +
        `${datasetName} uses unsupported adapter ` +
        `"${adapter}".`
      );
    }

    if (!definition.endpointProperty) {
      fail(
        `Manifest ${manifest.id} dataset ` +
        `${datasetName} is missing endpointProperty.`
      );
    }

    if (
      !definition.mapping ||
      typeof definition.mapping !== 'object' ||
      Array.isArray(definition.mapping)
    ) {
      fail(
        `Manifest ${manifest.id} dataset ` +
        `${datasetName} is missing a mapping object.`
      );
    }
  }
}

function syntaxCheckGeneratedConnector(connectorPath) {
  const tempPath = path.join(
    '/tmp',
    `${path.basename(connectorPath, '.gs')}-check.js`
  );

  fs.copyFileSync(connectorPath, tempPath);

  const result = spawnSync(
    process.execPath,
    ['--check', tempPath],
    {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false
    }
  );

  try {
    fs.unlinkSync(tempPath);
  } catch {
    // Temporary cleanup failure is not fatal.
  }

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    fail(
      `Generated connector syntax check failed: ` +
      `${path.relative(ROOT, connectorPath)}`
    );
  }
}

function regenerateManifest(manifest, options = {}) {
  validateManifest(manifest);

  const connectorPath =
    connectorPathForManifest(manifest);

  fs.mkdirSync(
    path.dirname(connectorPath),
    { recursive: true }
  );

  const source = buildConnectorSource(manifest);

  const previous = fs.existsSync(connectorPath)
    ? fs.readFileSync(connectorPath, 'utf8')
    : null;

  const changed = previous !== source;

  if (changed) {
    fs.writeFileSync(
      connectorPath,
      source,
      'utf8'
    );
  }

  syntaxCheckGeneratedConnector(connectorPath);

  return {
    connectorId: manifest.id,
    connectorPath,
    changed,
    datasets: Object.keys(manifest.datasets || {})
  };
}

function runClaspPush() {
  const result = spawnSync(
    'npx',
    ['clasp', 'push'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false
    }
  );

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    fail(
      `clasp push failed with exit code ` +
      `${result.status}.`
    );
  }
}

function runCountyRegression(connectorId, limit) {
  const result = spawnSync(
    'npx',
    [
      'clasp',
      'run',
      'REOS_COUNTY_TERMINAL_SYNC',
      '--params',
      JSON.stringify([
        {
          action: 'test-county',
          connectorId,
          limit
        }
      ])
    ],
    {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false
    }
  );

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    fail(
      `County regression test failed for ` +
      `${connectorId}.`
    );
  }
}

function commandRegenerate(args) {
  ensureDirectories();

  const regenerateAll =
    args.all === true;

  const connectorIdValue = String(
    args.connector ||
    args['connector-id'] ||
    ''
  )
    .trim()
    .toUpperCase();

  if (!regenerateAll && !connectorIdValue) {
    fail(
      'Use --connector PA-BUCKS or --all.'
    );
  }

  const targets = regenerateAll
    ? readManifests().filter(
        manifest => !manifest.invalid
      )
    : [
        findManifestById(
          connectorIdValue
        ).manifest
      ];

  if (!targets.length) {
    fail(
      'No valid county connector manifests found.'
    );
  }

  const results = targets.map(manifest =>
    regenerateManifest(manifest)
  );

  console.log('');
  console.log('Manifest regeneration results:');

  for (const result of results) {
    console.log(
      [
        result.connectorId,
        result.changed ? 'UPDATED' : 'UNCHANGED',
        path.relative(ROOT, result.connectorPath),
        `datasets=${result.datasets.length}`
      ].join(' | ')
    );
  }

  if (args.push === true) {
    console.log('');
    console.log('Pushing regenerated connectors...');
    runClaspPush();
  }

  if (args.test === true) {
    if (args.push !== true) {
      console.log('');
      console.log(
        'WARNING: --test without --push tests the ' +
        'currently deployed Apps Script version.'
      );
    }

    const limit = Math.max(
      1,
      Math.min(Number(args.limit || 5), 100)
    );

    for (const result of results) {
      console.log('');
      console.log(
        `Testing ${result.connectorId}...`
      );

      runCountyRegression(
        result.connectorId,
        limit
      );
    }
  }
}

async function commandDiscover(args) {
  const state = normalizeState(args.state);
  const county = normalizeCounty(args.county);

  const report = await discoverCounty({
    root: ROOT,
    state,
    county,
    sources: args.sources || 'arcgis,socrata',
    limit: Number(args.limit || 40),
    results: Number(args.results || 30),
    health: args.health === true,
    healthLimit: Number(args['health-limit'] || 10)
  });

  const reportName = [
    state,
    county.toUpperCase().replace(/[^A-Z0-9]+/g, '-'),
    'DISCOVERY.json'
  ].join('-');

  const outputPath = args.output
    ? path.resolve(ROOT, String(args.output))
    : path.join(
        ROOT,
        'reports',
        'county-discovery',
        reportName
      );

  saveDiscoveryReport(report, outputPath);

  console.log('');
  console.log(
    `${county} County, ${state} discovery`
  );
  console.log(
    `Candidates found: ${report.candidateCount}`
  );
  console.log(
    `Report: ${path.relative(ROOT, outputPath)}`
  );
  console.log('');

  report.results.forEach((candidate, index) => {
    const compatibility =
      candidate.compatibility || {};

    console.log(
      [
        `[${index + 1}]`,
        `score=${compatibility.score || 0}`,
        `dataset=${compatibility.dataset || 'unknown'}`,
        `adapter=${candidate.adapter}`,
        compatibility.generatorReady
          ? 'GENERATOR_READY'
          : 'REVIEW',
        candidate.title
      ].join(' | ')
    );

    if (candidate.endpoint) {
      console.log(`    ${candidate.endpoint}`);
    }

    if (candidate.health) {
      console.log(
        `    health=${candidate.health.ok ? 'PASS' : 'FAIL'}`
      );
    }
  });
}

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found: ${path.relative(ROOT, filePath)}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(
      `Invalid ${label.toLowerCase()} ` +
      `${path.relative(ROOT, filePath)}: ${error.message}`
    );
  }
}

function defaultMappingForDataset(dataset) {
  const common = {
    address: [
      'ADDRESS',
      'address',
      'STREET_ADDRESS',
      'street_address',
      'property_address',
      'location'
    ],
    city: [
      'CITY',
      'city',
      'MUNICIPALITY',
      'municipality',
      'property_city'
    ],
    zip: [
      'ZIP',
      'zip',
      'ZIP_CODE',
      'zip_code',
      'ZIPCODE',
      'zipcode',
      'postal_code'
    ],
    parcelId: [
      'PARCEL_NUM',
      'parcel_num',
      'PARCEL_ID',
      'parcel_id',
      'parcel_number',
      'OPA_NUMBER',
      'opa_number',
      'account_number'
    ],
    ownerName: [
      'OWNER1',
      'owner1',
      'OWNER',
      'owner',
      'owner_name',
      'legal_owner'
    ],
    coOwnerName: [
      'OWNER2',
      'owner2',
      'CO_OWNER',
      'co_owner'
    ],
    sourceRecordId: [
      'OBJECTID',
      'objectid',
      'ID',
      'id',
      'record_id',
      'PARCEL_NUM',
      'parcel_number'
    ],
    sourceUpdatedAt: [
      'MODIFY_DATE',
      'modify_date',
      'UPDATED_AT',
      'updated_at',
      'last_updated',
      'date_updated'
    ]
  };

  if (dataset === 'property_assessment') {
    return {
      ...common,
      landValue: [
        'LAND_VALUE',
        'land_value',
        'assessed_land_value'
      ],
      buildingValue: [
        'BUILDING_VALUE',
        'building_value',
        'improvement_value'
      ],
      estimatedValue: [
        'TOTAL_VALUE',
        'total_value',
        'TOTAL_ASSESSMENT',
        'total_assessment',
        'assessed_value'
      ]
    };
  }

  if (dataset === 'tax_delinquent') {
    return {
      ...common,
      taxDelinquentAmount: [
        'TOTAL_DUE',
        'total_due',
        'balance',
        'amount_due',
        'delinquent_amount'
      ],
      taxPrincipal: [
        'PRINCIPAL_DUE',
        'principal_due',
        'principal'
      ],
      taxInterest: [
        'INTEREST_DUE',
        'interest_due',
        'interest'
      ],
      taxPenalty: [
        'PENALTY_DUE',
        'penalty_due',
        'penalty'
      ]
    };
  }

  if (dataset === 'code_violations') {
    return {
      ...common,
      violationNumber: [
        'VIOLATIONNUMBER',
        'violationnumber',
        'violation_number'
      ],
      violationType: [
        'VIOLATIONCODETITLE',
        'violationcodetitle',
        'violation_description',
        'violation_type'
      ],
      violationStatus: [
        'VIOLATIONSTATUS',
        'violationstatus',
        'status',
        'case_status'
      ]
    };
  }

  if (dataset === 'vacant_properties') {
    return {
      ...common,
      vacancyStatus: [
        'VACANT_FLAG',
        'vacant_flag',
        'vacancy_status',
        'status'
      ],
      vacancyRank: [
        'VACANT_RANK',
        'vacant_rank'
      ]
    };
  }

  return common;
}

function normalizePromotedDataset(value) {
  const dataset = String(value || '')
    .trim()
    .toLowerCase();

  const aliases = {
    sheriff_sale: 'sheriff_sales',
    sheriff_tax_sale: 'sheriff_sales',
    sheriff_mortgage_sale: 'sheriff_sales',
    parcels: 'property_assessment',
    parcel: 'property_assessment',
    assessment: 'property_assessment',
    violations: 'code_violations',
    vacant: 'vacant_properties'
  };

  const normalized = aliases[dataset] || dataset;

  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    fail(
      `Invalid promoted dataset "${normalized}". ` +
      'Use lowercase snake_case.'
    );
  }

  return normalized;
}

function loadDiscoveryCandidate(args) {
  const reportArgument = String(args.report || '').trim();

  if (!reportArgument) {
    fail('--report is required for county:promote.');
  }

  const reportPath = path.resolve(ROOT, reportArgument);
  const report = readJsonFile(reportPath, 'Discovery report');

  if (
    !Array.isArray(report.results) ||
    !report.results.length
  ) {
    fail('Discovery report contains no candidates.');
  }

  const candidateNumber = Number(args.candidate);

  if (
    !Number.isInteger(candidateNumber) ||
    candidateNumber < 1 ||
    candidateNumber > report.results.length
  ) {
    fail(
      `--candidate must be between 1 and ` +
      `${report.results.length}.`
    );
  }

  const candidate = report.results[candidateNumber - 1];

  if (!candidate || typeof candidate !== 'object') {
    fail(`Discovery candidate ${candidateNumber} is invalid.`);
  }

  return {
    report,
    reportPath,
    candidate,
    candidateNumber
  };
}

function buildPromotedDatasetDefinition({
  connectorIdValue,
  dataset,
  candidate,
  reportPath,
  candidateNumber
}) {
  const adapter = String(candidate.adapter || '')
    .trim()
    .toLowerCase();

  const allowedAdapters = [
    'arcgis',
    'html-table',
    'json-api',
    'socrata',
    'csv'
  ];

  if (!allowedAdapters.includes(adapter)) {
    fail(
      `Candidate uses unsupported adapter "${adapter}".`
    );
  }

  const endpoint = String(candidate.endpoint || '').trim();

  if (!endpoint) {
    fail(
      'Selected candidate has no usable endpoint. ' +
      'Choose another candidate or use --force-endpoint.'
    );
  }

  return {
    adapter,
    endpointProperty: propertyKey(connectorIdValue, dataset),
    enabled: true,
    maxLimit: adapter === 'arcgis' ? 2000 : 5000,
    mapping: defaultMappingForDataset(dataset),
    discovery: {
      report: path.relative(ROOT, reportPath),
      candidate: candidateNumber,
      promotedAt: new Date().toISOString(),
      title: candidate.title || '',
      source: candidate.source || '',
      sourceItemId: candidate.itemId || '',
      sourceLayerId:
        typeof candidate.layerId === 'undefined'
          ? ''
          : candidate.layerId,
      compatibilityScore:
        candidate.compatibility &&
        typeof candidate.compatibility.score !== 'undefined'
          ? candidate.compatibility.score
          : null,
      matchedTerms:
        candidate.compatibility &&
        Array.isArray(candidate.compatibility.matchedTerms)
          ? candidate.compatibility.matchedTerms
          : [],
      endpoint
    }
  };
}

function configurePromotedEndpoint({
  connectorIdValue,
  dataset,
  endpoint
}) {
  const result = spawnSync(
    'npx',
    [
      'clasp',
      'run',
      'REOS_COUNTY_TERMINAL_SYNC',
      '--params',
      JSON.stringify([{
        action: 'configure-endpoint',
        connectorId: connectorIdValue,
        dataset,
        endpoint
      }])
    ],
    {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false
    }
  );

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    fail(
      `Endpoint configuration failed for ` +
      `${connectorIdValue}/${dataset}.`
    );
  }
}

function sleepMs(milliseconds) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, milliseconds);
}

function runPromotedDatasetTest({
  connectorIdValue,
  dataset,
  limit
}) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync(
      'npx',
      [
        'clasp',
        'run',
        'REOS_COUNTY_TERMINAL_SYNC',
        '--params',
        JSON.stringify([{
          action: 'sync',
          connectorId: connectorIdValue,
          dataset,
          limit,
          dryRun: true
        }])
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        shell: false
      }
    );

    if (result.error) {
      fail(result.error.message);
    }

    const stdout = String(result.stdout || '');
    const stderr = String(result.stderr || '');
    const combined = `${stdout}\n${stderr}`;

    const lockTimeout =
      combined.includes('Lock timeout') ||
      combined.includes('holding the lock for too long');

    if (result.status === 0 && !lockTimeout) {
      process.stdout.write(stdout);
      process.stderr.write(stderr);
      return;
    }

    if (lockTimeout && attempt < maxAttempts) {
      console.log(
        `Database lock detected. Retrying dry sync ` +
        `(${attempt + 1}/${maxAttempts})...`
      );

      sleepMs(attempt * 5000);
      continue;
    }

    process.stdout.write(stdout);
    process.stderr.write(stderr);

    fail(
      `Dry-run test failed for ` +
      `${connectorIdValue}/${dataset}.`
    );
  }
}

function commandPromote(args) {
  ensureDirectories();

  const {
    report,
    reportPath,
    candidate,
    candidateNumber
  } = loadDiscoveryCandidate(args);

  const locality = report.locality || {};

  const state = normalizeState(
    args.state || locality.state
  );

  const county = normalizeCounty(
    args.county || locality.county
  );

  const connectorIdValue = connectorId(state, county);

  const detectedDataset =
    candidate.compatibility &&
    candidate.compatibility.dataset
      ? candidate.compatibility.dataset
      : 'unknown';

  const dataset = normalizePromotedDataset(
    args.dataset || detectedDataset
  );

  if (dataset === 'unknown') {
    fail(
      'The selected candidate was not classified. ' +
      'Supply --dataset explicitly.'
    );
  }

  const compatibilityScore =
    candidate.compatibility &&
    Number(candidate.compatibility.score || 0);

  const generatorReady =
    candidate.compatibility &&
    candidate.compatibility.generatorReady === true;

  if (
    args.force !== true &&
    !generatorReady &&
    compatibilityScore < Number(args['min-score'] || 60)
  ) {
    fail(
      `Candidate ${candidateNumber} scored ` +
      `${compatibilityScore || 0} and is not generator-ready. ` +
      'Use --force after manually reviewing the endpoint.'
    );
  }

  const endpoint = String(
    args.endpoint || candidate.endpoint || ''
  ).trim();

  if (!endpoint) {
    fail(
      'Candidate has no endpoint. Supply --endpoint explicitly.'
    );
  }

  const manifestPath = path.join(
    MANIFEST_DIR,
    `${connectorIdValue}.json`
  );

  let manifest;

  if (fs.existsSync(manifestPath)) {
    manifest = readJsonFile(
      manifestPath,
      'County connector manifest'
    );
  } else {
    manifest = {
      id: connectorIdValue,
      state,
      county,
      version: '1.0.0',
      enabled: true,
      generatedAt: new Date().toISOString(),
      datasets: {}
    };
  }

  manifest.id = connectorIdValue;
  manifest.state = state;
  manifest.county = county;
  manifest.enabled = manifest.enabled !== false;
  manifest.datasets = manifest.datasets || {};

  if (
    manifest.datasets[dataset] &&
    args.replace !== true
  ) {
    fail(
      `${connectorIdValue}/${dataset} already exists. ` +
      'Use --replace to overwrite it.'
    );
  }

  const definition = buildPromotedDatasetDefinition({
    connectorIdValue,
    dataset,
    candidate: {
      ...candidate,
      endpoint
    },
    reportPath,
    candidateNumber
  });

  manifest.datasets[dataset] = definition;
  manifest.updatedAt = new Date().toISOString();

  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  const regeneration = regenerateManifest(manifest);

  console.log('');
  console.log('Discovery promotion complete:');
  console.log(`Connector: ${connectorIdValue}`);
  console.log(`Dataset:   ${dataset}`);
  console.log(`Adapter:   ${definition.adapter}`);
  console.log(`Endpoint:  ${endpoint}`);
  console.log(
    `Manifest:  ${path.relative(ROOT, manifestPath)}`
  );
  console.log(
    `Generated: ${path.relative(
      ROOT,
      regeneration.connectorPath
    )}`
  );
  console.log(
    `Result:    ${regeneration.changed ? 'UPDATED' : 'UNCHANGED'}`
  );

  if (args.push === true) {
    console.log('');
    console.log('Pushing generated connector...');
    runClaspPush();
  }

  if (args.configure === true) {
    if (args.push !== true) {
      console.log('');
      console.log(
        'WARNING: configuring before --push requires the ' +
        'connector dataset to already exist in Apps Script.'
      );
    }

    console.log('');
    console.log('Configuring promoted endpoint...');

    configurePromotedEndpoint({
      connectorIdValue,
      dataset,
      endpoint
    });
  }

  if (args.test === true) {
    if (args.push !== true) {
      console.log('');
      console.log(
        'WARNING: --test without --push tests the currently ' +
        'deployed connector version.'
      );
    }

    if (args.configure !== true) {
      console.log('');
      console.log(
        'WARNING: --test without --configure requires the ' +
        'endpoint to already exist in Script Properties.'
      );
    }

    console.log('');
    console.log('Running promoted dataset dry sync...');

    runPromotedDatasetTest({
      connectorIdValue,
      dataset,
      limit: Math.max(
        1,
        Math.min(Number(args.limit || 5), 100)
      )
    });
  }
}

function getConfiguredEndpoint(
  connectorIdValue,
  dataset
) {
  const result = spawnSync(
    'npx',
    [
      'clasp',
      'run',
      'REOS_COUNTY_TERMINAL_SYNC',
      '--params',
      JSON.stringify([{
        action: 'get-endpoint',
        connectorId: connectorIdValue,
        dataset
      }])
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      shell: false
    }
  );

  if (result.error || result.status !== 0) {
    return '';
  }

  const output = String(result.stdout || '').trim();

  const match = output.match(
    /endpoint:\s*'([^']+)'/
  );

  return match ? match[1] : '';
}

async function commandAutoMap(args) {
  ensureDirectories();

  const connectorIdValue = String(
    args.connector ||
    args['connector-id'] ||
    ''
  )
    .trim()
    .toUpperCase();

  const dataset = String(args.dataset || '')
    .trim()
    .toLowerCase();

  if (!connectorIdValue) {
    fail('--connector is required for county:automap.');
  }

  if (!dataset) {
    fail('--dataset is required for county:automap.');
  }

  const {
    manifest,
    manifestPath
  } = findManifestById(connectorIdValue);

  const definition = manifest.datasets?.[dataset];

  if (!definition) {
    fail(
      `${connectorIdValue}/${dataset} is not present in the manifest.`
    );
  }

  const endpoint =
    String(args.endpoint || '').trim() ||
    String(definition.endpoint || '').trim() ||
    String(definition.discovery?.endpoint || '').trim() ||
    getConfiguredEndpoint(
      connectorIdValue,
      dataset
    );

  if (!endpoint) {
    fail(
      'No endpoint was found in the manifest. ' +
      'Supply --endpoint explicitly.'
    );
  }

  const adapter = String(definition.adapter || '')
    .trim()
    .toLowerCase();

  const sampleCount = Math.max(
    5,
    Math.min(Number(args.samples || 25), 250)
  );

  console.log(
    `Fetching ${sampleCount} sample records from ${adapter}...`
  );

  const records = await fetchSampleRecords({
    adapter,
    endpoint,
    sampleCount
  });

  if (!records.length) {
    fail('The source returned no sample records.');
  }

  const result = inferFieldMapping(
    records,
    dataset,
    {
      minimumScore: Number(args['minimum-score'] || 65),
      maxFields: Number(args['max-fields'] || 3)
    }
  );

  const reportPath = args.output
    ? path.resolve(ROOT, String(args.output))
    : path.join(
        ROOT,
        'reports',
        'county-mapping',
        `${connectorIdValue}-${dataset.toUpperCase()}-MAPPING.json`
      );

  const report = {
    ...result,
    connectorId: connectorIdValue,
    endpoint,
    adapter,
    manifest: path.relative(ROOT, manifestPath)
  };

  saveMappingReport(report, reportPath);

  console.log('');
  console.log('Automatic field mapping results:');
  console.log(`Connector: ${connectorIdValue}`);
  console.log(`Dataset:   ${dataset}`);
  console.log(`Adapter:   ${adapter}`);
  console.log(`Samples:   ${records.length}`);
  console.log(
    `Report:    ${path.relative(ROOT, reportPath)}`
  );
  console.log('');

  Object.entries(result.mapping).forEach(
    ([target, fields]) => {
      const confidence = result.confidence[target];

      console.log(
        [
          target.padEnd(22),
          fields.length ? fields.join(', ') : 'UNMAPPED',
          confidence
            ? `score=${confidence.score}`
            : ''
        ]
          .filter(Boolean)
          .join(' | ')
      );
    }
  );

  if (result.warnings.length) {
    console.log('');
    console.log('Warnings:');

    result.warnings.forEach(warning => {
      console.log(`- ${warning}`);
    });
  }

  if (args.apply !== true) {
    console.log('');
    console.log(
      'Review the report, then rerun with --apply.'
    );
    return;
  }

  const requiredMappingFailures = [
    'address',
    'parcelId',
    'sourceRecordId'
  ].filter(target => {
    return !Array.isArray(result.mapping[target]) ||
      result.mapping[target].length === 0;
  });

  if (
    requiredMappingFailures.length &&
    args['allow-incomplete-mapping'] !== true
  ) {
    fail(
      'Automatic mapping cannot be applied because required ' +
      'fields are unmapped: ' +
      requiredMappingFailures.join(', ') +
      '. Review the source or use --allow-incomplete-mapping.'
    );
  }

  const preserveExisting =
    args.replace !== true;

  const existingMapping =
    definition.mapping || {};

  definition.mapping = preserveExisting
    ? mergeMappings(existingMapping, result.mapping)
    : result.mapping;

  if (
    result.recordFilter &&
    args['no-filter'] !== true
  ) {
    definition.recordFilter = result.recordFilter;
  }

  definition.autoMapping = {
    appliedAt: new Date().toISOString(),
    sampleCount: records.length,
    report: path.relative(ROOT, reportPath),
    minimumScore: Number(
      args['minimum-score'] || 65
    ),
    confidence: result.confidence,
    warnings: result.warnings
  };

  manifest.updatedAt = new Date().toISOString();

  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  const regeneration = regenerateManifest(manifest);

  console.log('');
  console.log('Manifest mapping applied.');
  console.log(
    `Generated connector: ${path.relative(
      ROOT,
      regeneration.connectorPath
    )}`
  );

  if (args.push === true) {
    console.log('');
    console.log('Pushing regenerated connector...');
    runClaspPush();
  }

  if (args.configure === true) {
    console.log('');
    console.log('Configuring endpoint...');

    configurePromotedEndpoint({
      connectorIdValue,
      dataset,
      endpoint
    });
  }

  if (args.test === true) {
    if (args.push !== true) {
      console.log(
        'WARNING: --test without --push tests the deployed version.'
      );
    }

    console.log('');
    console.log('Running automatic-mapping dry sync...');

    runPromotedDatasetTest({
      connectorIdValue,
      dataset,
      limit: Math.max(
        1,
        Math.min(Number(args.limit || 10), 100)
      )
    });
  }
}

function mergeMappings(existing, inferred) {
  const output = {
    ...(existing || {})
  };

  Object.entries(inferred || {}).forEach(
    ([target, fields]) => {
      const existingFields = Array.isArray(output[target])
        ? output[target]
        : [];

      const inferredFields = Array.isArray(fields)
        ? fields
        : [];

      output[target] = [
        ...new Set([
          ...existingFields,
          ...inferredFields
        ])
      ];
    }
  );

  return output;
}

function writeAutomaticPromotionReport(
  results,
  outputPath
) {
  fs.mkdirSync(
    path.dirname(outputPath),
    { recursive: true }
  );

  fs.writeFileSync(
    outputPath,
    `${JSON.stringify({
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      results
    }, null, 2)}\n`,
    'utf8'
  );
}

function runAutomaticPromotion({
  planPath,
  dataset,
  candidateNumber,
  push,
  configure,
  test,
  limit
}) {
  const args = [
    process.execPath,
    path.join(ROOT, 'tools', 'reos.mjs'),
    'county:promote',
    '--report',
    planPath,
    '--candidate',
    String(candidateNumber),
    '--dataset',
    dataset,
    '--replace',
    '--force'
  ];

  if (push) {
    args.push('--push');
  }

  if (configure) {
    args.push('--configure');
  }

  if (test) {
    args.push('--test');
    args.push('--limit', String(limit));
  }

  const result = spawnSync(
    args[0],
    args.slice(1),
    {
      cwd: ROOT,
      encoding: 'utf8',
      shell: false
    }
  );

  process.stdout.write(
    String(result.stdout || '')
  );

  process.stderr.write(
    String(result.stderr || '')
  );

  return {
    dataset,
    candidateNumber,
    ok: result.status === 0,
    exitCode: result.status
  };
}

async function commandDiscoverAll(args) {
  const state = normalizeState(args.state);
  const county = normalizeCounty(args.county);

  const datasets = splitList(
    args.datasets,
    [
      'property_assessment',
      'tax_delinquent',
      'code_violations',
      'vacant_properties',
      'sheriff_sales',
      'building_permits'
    ]
  );

  const plan = await discoverAllDatasets({
    root: ROOT,
    state,
    county,
    datasets,
    sources: args.sources || 'arcgis,socrata',
    limit: Number(args.limit || 50),
    results: Number(args.results || 100),
    health: args.health === true,
    healthLimit: Number(
      args['health-limit'] || 20
    )
  });

  const countySlug = county
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-');

  const planPath = args.output
    ? path.resolve(ROOT, String(args.output))
    : path.join(
        ROOT,
        'reports',
        'county-discovery',
        `${state}-${countySlug}-AUTOMATIC-DISCOVERY.json`
      );

  const rawReportPath = path.join(
    ROOT,
    'reports',
    'county-discovery',
    `${state}-${countySlug}-AUTOMATIC-CANDIDATES.json`
  );

  saveAutomaticDiscoveryPlan(
    plan,
    planPath
  );

  saveUnderlyingDiscoveryReport(
    plan,
    rawReportPath
  );

  console.log('');
  console.log(
    `Automatic discovery plan: ` +
    `${path.relative(ROOT, planPath)}`
  );

  if (args.promote !== true) {
    console.log('');
    console.log(
      'Review selections, then rerun with --promote.'
    );

    return;
  }

  const promotionReport = [];
  const promotionInput = {
    ...plan,
    results: []
  };

  const candidateIndexes = {};

  for (
    const [dataset, selection]
    of Object.entries(plan.selections)
  ) {
    if (!selection.selected) {
      continue;
    }

    promotionInput.results.push(
      selection.selected
    );

    candidateIndexes[dataset] =
      promotionInput.results.length;
  }

  const promotionInputPath = path.join(
    ROOT,
    'reports',
    'county-discovery',
    `${state}-${countySlug}-PROMOTION-INPUT.json`
  );

  fs.writeFileSync(
    promotionInputPath,
    `${JSON.stringify(
      promotionInput,
      null,
      2
    )}\n`,
    'utf8'
  );

  for (
    const [dataset, candidateNumber]
    of Object.entries(candidateIndexes)
  ) {
    console.log('');
    console.log(
      `Promoting ${dataset}...`
    );

    const result = runAutomaticPromotion({
      planPath:
        path.relative(
          ROOT,
          promotionInputPath
        ),
      dataset,
      candidateNumber,
      push: args.push === true,
      configure: args.configure !== false,
      test: args.test === true,
      limit: Math.max(
        1,
        Math.min(Number(args['test-limit'] || 5), 100)
      )
    });

    promotionReport.push(result);

    if (
      !result.ok &&
      args['continue-on-error'] !== true
    ) {
      break;
    }
  }

  const promotionReportPath = path.join(
    ROOT,
    'reports',
    'county-discovery',
    `${state}-${countySlug}-PROMOTION-RESULTS.json`
  );

  writeAutomaticPromotionReport(
    promotionReport,
    promotionReportPath
  );

  console.log('');
  console.log(
    `Promotion results: ` +
    `${path.relative(ROOT, promotionReportPath)}`
  );
}

async function commandBuild(args) {
  const state = normalizeState(args.state);
  const county = normalizeCounty(args.county);

  const datasets = splitList(
    args.datasets,
    ['property_assessment']
  );

  const result = await runCountyBuildPipeline({
    root: ROOT,
    state,
    county,
    datasets,
    execute: args.execute === true,
    health: args.health !== false,
    healthLimit: Math.max(
      1,
      Math.min(Number(args['health-limit'] || 20), 50)
    ),
    results: Math.max(
      10,
      Math.min(Number(args.results || 100), 250)
    ),
    samples: Math.max(
      5,
      Math.min(Number(args.samples || 50), 250)
    ),
    push: args.push === true,
    configure: args.configure !== false,
    test: args.test === true,
    testLimit: Math.max(
      1,
      Math.min(Number(args['test-limit'] || 10), 100)
    ),
    replaceMappings: args['replace-mappings'] === true,
    noFilter: args['no-filter'] === true,
    continueOnError:
      args['continue-on-error'] === true
  });

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function commandStateBuild(args) {
  const state = normalizeState(
    args.state ||
    args._[1]
  );

  const counties = splitList(
    args.counties,
    []
  );

  const datasets = splitList(
    args.datasets,
    ['property_assessment']
  );

  const result = await runStateBuildPipeline({
    root: ROOT,
    state,
    counties,
    datasets,
    execute: args.execute === true,
    rebuild: args.rebuild === true,
    push: args.push === true,
    test: args.test === true,
    results: Math.max(
      10,
      Math.min(
        Number(args.results || 100),
        250
      )
    ),
    healthLimit: Math.max(
      1,
      Math.min(
        Number(args['health-limit'] || 20),
        50
      )
    ),
    samples: Math.max(
      5,
      Math.min(
        Number(args.samples || 50),
        250
      )
    ),
    testLimit: Math.max(
      1,
      Math.min(
        Number(args['test-limit'] || 10),
        100
      )
    ),
    replaceMappings:
      args['replace-mappings'] === true,
    noFilter:
      args['no-filter'] === true,
    continueOnError:
      args['continue-on-error'] === true
  });

  if (!result.ok) {
    process.exitCode = 1;
  }
}

function printRegistryEntries(entries) {
  if (!entries.length) {
    console.log('No county registry entries found.');
    return;
  }

  console.log('');
  console.log(
    [
      'CONNECTOR'.padEnd(22),
      'STATUS'.padEnd(18),
      'TYPE'.padEnd(12),
      'DATASETS'
    ].join(' | ')
  );

  console.log('-'.repeat(82));

  entries.forEach(entry => {
    console.log(
      [
        entry.connectorId.padEnd(22),
        String(entry.status || '').padEnd(18),
        String(entry.implementation || '').padEnd(12),
        String(
          Object.keys(entry.datasets || {}).length
        )
      ].join(' | ')
    );
  });
}

function commandRegistryRefresh() {
  const registry = refreshRegistry({
    root: ROOT
  });

  const connectors = Object.values(
    registry.connectors || {}
  );

  console.log('');
  console.log('County registry refreshed.');
  console.log(
    `Connectors: ${connectors.length}`
  );
  console.log(
    `Registry: config/county-registry/registry.json`
  );

  printRegistryEntries(
    connectors.sort((left, right) =>
      left.connectorId.localeCompare(
        right.connectorId
      )
    )
  );
}

function commandRegistryList(args) {
  const entries = listRegistry({
    root: ROOT,
    state: args.state || ''
  });

  printRegistryEntries(entries);
}

function commandRegistryStatus(args) {
  const connectorIdValue = String(
    args.connector ||
    args['connector-id'] ||
    ''
  )
    .trim()
    .toUpperCase();

  if (!connectorIdValue) {
    fail('--connector is required.');
  }

  const entry = getRegistryEntry(
    ROOT,
    connectorIdValue
  );

  if (!entry) {
    fail(
      `Registry entry not found: ${connectorIdValue}`
    );
  }

  console.log(
    JSON.stringify(entry, null, 2)
  );
}

function commandRegistryUpdate(args) {
  const updateAll =
    args.all === true;

  const commonOptions = {
    root: ROOT,
    health: args.health === true,
    test: args.test === true,
    limit: Math.max(
      1,
      Math.min(Number(args.limit || 10), 100)
    ),
    cursor: String(args.cursor || ''),
    generatedOnly:
      args['generated-only'] === true,
    continueOnError:
      args['continue-on-error'] === true
  };

  if (updateAll) {
    const report = updateAllRegistry(
      commonOptions
    );

    const reportPath =
      saveRegistryUpdateReport(
        ROOT,
        report
      );

    console.log('');
    console.log('County registry update complete.');
    console.log(`Checked: ${report.count}`);
    console.log(`Passed:  ${report.passed}`);
    console.log(`Failed:  ${report.failed}`);
    console.log(
      `Report:  ${path.relative(ROOT, reportPath)}`
    );

    report.results.forEach(result => {
      console.log(
        [
          result.connectorId.padEnd(22),
          result.status.padEnd(18),
          result.ok ? 'PASS' : 'REVIEW'
        ].join(' | ')
      );
    });

    if (report.failed > 0) {
      process.exitCode = 1;
    }

    return;
  }

  const connectorIdValue = String(
    args.connector ||
    args['connector-id'] ||
    ''
  )
    .trim()
    .toUpperCase();

  if (!connectorIdValue) {
    fail(
      'Use --connector PA-BUCKS or --all.'
    );
  }

  const entry = updateConnectorRegistry({
    ...commonOptions,
    connectorId: connectorIdValue
  });

  console.log(
    JSON.stringify(entry, null, 2)
  );

  if (
    entry.status === 'ERROR' ||
    entry.status === 'REVIEW_REQUIRED' ||
    entry.status === 'INACCESSIBLE'
  ) {
    process.exitCode = 1;
  }
}

function parseCountyOverrides(value) {
  const output = {};

  if (!value) {
    return output;
  }

  String(value)
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .forEach(part => {
      const separator = part.indexOf(':');

      if (separator === -1) {
        return;
      }

      const state = part
        .slice(0, separator)
        .trim()
        .toUpperCase();

      const counties = part
        .slice(separator + 1)
        .split(',')
        .map(county => county.trim())
        .filter(Boolean);

      if (
        /^[A-Z]{2}$/.test(state) &&
        counties.length
      ) {
        output[state] = counties;
      }
    });

  return output;
}

async function commandNationalBuild(args) {
  const states = splitList(
    args.states ||
    args.state,
    []
  )
    .map(state =>
      String(state).trim().toUpperCase()
    )
    .filter(Boolean);

  if (!states.length) {
    fail(
      'Use --states PA,NJ,DE or --state PA.'
    );
  }

  const datasets = splitList(
    args.datasets,
    ['property_assessment']
  );

  const result = await runNationalBuildPipeline({
    root: ROOT,
    states,
    datasets,
    countyOverrides:
      parseCountyOverrides(
        args.counties
      ),
    execute:
      args.execute === true,
    rebuild:
      args.rebuild === true,
    push:
      args.push === true,
    health:
      args.health !== false,
    test:
      args.test === true,
    results: Math.max(
      10,
      Math.min(
        Number(args.results || 100),
        250
      )
    ),
    healthLimit: Math.max(
      1,
      Math.min(
        Number(
          args['health-limit'] || 20
        ),
        50
      )
    ),
    samples: Math.max(
      5,
      Math.min(
        Number(args.samples || 50),
        250
      )
    ),
    testLimit: Math.max(
      1,
      Math.min(
        Number(
          args['test-limit'] || 10
        ),
        100
      )
    ),
    replaceMappings:
      args['replace-mappings'] === true,
    noFilter:
      args['no-filter'] === true,
    continueOnError:
      args['continue-on-error'] === true
  });

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function commandSchemaDrift(args) {
  const connectorIdValue = String(
    args.connector ||
    args['connector-id'] ||
    ''
  )
    .trim()
    .toUpperCase();

  if (!connectorIdValue) {
    fail('--connector is required.');
  }

  const entry = getRegistryEntry(
    ROOT,
    connectorIdValue
  );

  if (!entry) {
    fail(
      `Registry entry not found: ${connectorIdValue}`
    );
  }

  const requestedDataset = String(
    args.dataset || ''
  )
    .trim()
    .toLowerCase();

  const datasets = Object.values(
    entry.datasets || {}
  ).filter(dataset => {
    return (
      !requestedDataset ||
      dataset.dataset === requestedDataset
    );
  });

  const results =
    await inspectConnectorSchemas({
      root: ROOT,
      connectorId: connectorIdValue,
      datasets,
      sampleCount: Math.max(
        5,
        Math.min(
          Number(args.samples || 50),
          250
        )
      ),
      accept: args.accept === true,
      continueOnError:
        args['continue-on-error'] === true
    });

  const registry = refreshRegistry({
    root: ROOT
  });

  const registryEntry =
    registry.connectors?.[
      connectorIdValue
    ];

  results.forEach(result => {
    const registryDataset =
      registryEntry?.datasets?.[
        result.dataset
      ];

    if (!registryDataset) {
      return;
    }

    registryDataset.schemaDrift = {
      checkedAt:
        result.checkedAt || new Date().toISOString(),
      status: result.status,
      changed:
        result.comparison?.changed === true,
      severity:
        result.comparison?.severity || '',
      requiresReview:
        result.comparison?.requiresReview === true,
      addedFields:
        result.comparison?.addedFields || [],
      removedFields:
        result.comparison?.removedFields || [],
      changedTypes:
        result.comparison?.changedTypes || [],
      report:
        `reports/schema-drift/` +
        `${connectorIdValue}/` +
        `${result.dataset}.json`
    };

    if (
      registryDataset.schemaDrift.requiresReview
    ) {
      registryDataset.status =
        'REVIEW_REQUIRED';
    }
  });

  const registryPath = path.join(
    ROOT,
    'config',
    'county-registry',
    'registry.json'
  );

  fs.writeFileSync(
    registryPath,
    `${JSON.stringify(registry, null, 2)}\n`
  );

  console.log('');
  console.log(
    `Schema drift results for ${connectorIdValue}`
  );

  results.forEach(result => {
    console.log(
      [
        result.dataset.padEnd(24),
        String(result.status).padEnd(20),
        result.ok ? 'PASS' : 'REVIEW'
      ].join(' | ')
    );
  });

  if (results.some(result => !result.ok)) {
    process.exitCode = 1;
  }
}

async function commandSchemaDriftAll(args) {
  const entries = listRegistry({
    root: ROOT,
    state: args.state || ''
  }).filter(entry => {
    return entry.implementation === 'generated';
  });

  const results = [];

  for (const entry of entries) {
    const connectorResults =
      await inspectConnectorSchemas({
        root: ROOT,
        connectorId: entry.connectorId,
        datasets: Object.values(
          entry.datasets || {}
        ),
        sampleCount: Math.max(
          5,
          Math.min(
            Number(args.samples || 50),
            250
          )
        ),
        accept: args.accept === true,
        continueOnError:
          args['continue-on-error'] === true
      });

    results.push(
      ...connectorResults
    );

    if (
      connectorResults.some(result => !result.ok) &&
      args['continue-on-error'] !== true
    ) {
      break;
    }
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    connectorCount:
      new Set(
        results.map(
          result => result.connectorId
        )
      ).size,
    datasetCount: results.length,
    passed:
      results.filter(result => result.ok).length,
    reviewRequired:
      results.filter(result => !result.ok).length,
    results
  };

  const outputPath =
    saveDriftSummary(
      ROOT,
      summary
    );

  console.log('');
  console.log('Schema drift scan complete.');
  console.log(
    `Datasets: ${summary.datasetCount}`
  );
  console.log(
    `Passed:   ${summary.passed}`
  );
  console.log(
    `Review:   ${summary.reviewRequired}`
  );
  console.log(
    `Report:   ${path.relative(ROOT, outputPath)}`
  );

  if (summary.reviewRequired > 0) {
    process.exitCode = 1;
  }
}

async function commandSelfHeal(args) {
  const connectorIdValue = String(
    args.connector ||
    args['connector-id'] ||
    ''
  )
    .trim()
    .toUpperCase();

  if (!connectorIdValue) {
    fail('--connector is required.');
  }

  const options = {
    root: ROOT,
    connectorId:
      connectorIdValue,
    dataset: String(
      args.dataset || ''
    )
      .trim()
      .toLowerCase(),
    execute:
      args.execute === true,
    forceRemap:
      args['force-remap'] === true,
    allowEndpointReplacement:
      args[
        'allow-endpoint-replacement'
      ] === true,
    replaceMappings:
      args['replace-mappings'] === true,
    push:
      args.push === true,
    configure:
      args.configure !== false,
    test:
      args.test !== false,
    samples: Math.max(
      5,
      Math.min(
        Number(args.samples || 50),
        250
      )
    ),
    results: Math.max(
      10,
      Math.min(
        Number(args.results || 150),
        250
      )
    ),
    healthLimit: Math.max(
      1,
      Math.min(
        Number(
          args['health-limit'] || 25
        ),
        50
      )
    ),
    testLimit: Math.max(
      1,
      Math.min(
        Number(
          args['test-limit'] || 10
        ),
        100
      )
    ),
    continueOnError:
      args['continue-on-error'] === true
  };

  if (!options.execute) {
    const plan =
      planConnectorRepair(options);

    console.log(
      JSON.stringify(plan, null, 2)
    );

    return;
  }

  const result =
    await healConnector(options);

  console.log('');
  console.log('Self-healing result');
  console.log('-------------------');
  console.log(
    `Connector: ${result.connectorId}`
  );
  console.log(
    `Status:    ${result.finalStatus || 'UNKNOWN'}`
  );
  console.log(
    `Result:    ${result.ok ? 'PASS' : 'REVIEW_REQUIRED'}`
  );
  console.log(
    `Report:    ${path.relative(ROOT, result.reportPath)}`
  );

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function commandSelfHealAll(args) {
  const result =
    await healAllConnectors({
      root: ROOT,
      state: args.state || '',
      execute:
        args.execute === true,
      forceRemap:
        args['force-remap'] === true,
      allowEndpointReplacement:
        args[
          'allow-endpoint-replacement'
        ] === true,
      replaceMappings:
        args['replace-mappings'] === true,
      push:
        args.push === true,
      configure:
        args.configure !== false,
      test:
        args.test !== false,
      samples: Math.max(
        5,
        Math.min(
          Number(args.samples || 50),
          250
        )
      ),
      results: Math.max(
        10,
        Math.min(
          Number(args.results || 150),
          250
        )
      ),
      healthLimit: Math.max(
        1,
        Math.min(
          Number(
            args['health-limit'] || 25
          ),
          50
        )
      ),
      testLimit: Math.max(
        1,
        Math.min(
          Number(
            args['test-limit'] || 10
          ),
          100
        )
      ),
      continueOnError:
        args['continue-on-error'] === true
    });

  console.log('');
  console.log('Self-healing scan complete.');
  console.log(
    `Connectors: ${result.connectorCount}`
  );
  console.log(
    `Passed:     ${result.passed}`
  );
  console.log(
    `Failed:     ${result.failed}`
  );
  console.log(
    `Report:     ${path.relative(ROOT, result.reportPath)}`
  );

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

function commandList() {
  const manifests = readManifests();

  if (!manifests.length) {
    console.log('No generated county connectors found.');
    return;
  }

  for (const manifest of manifests) {
    if (manifest.invalid) {
      console.log(`${manifest.id} INVALID: ${manifest.error}`);
      continue;
    }

    console.log(
      [
        manifest.id,
        manifest.enabled === false ? 'disabled' : 'enabled',
        Object.keys(manifest.datasets || {}).join(',')
      ].join(' | ')
    );
  }
}

function runClasp(functionName, payload) {
  const result = spawnSync(
    'npx',
    [
      'clasp',
      'run',
      functionName,
      '--params',
      JSON.stringify([payload])
    ],
    {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false
    }
  );

  if (result.error) {
    fail(result.error.message);
  }

  process.exitCode = result.status || 0;
}

function commandTest(args) {
  const id = String(
    args.connector || args['connector-id'] || ''
  ).trim();

  if (!id) {
    fail('--connector is required.');
  }

  runClasp('REOS_COUNTY_TERMINAL_SYNC', {
    action: 'test-county',
    connectorId: id,
    limit: Number(args.limit || 5)
  });
}

function commandSync(args) {
  const id = String(args.connector || '').trim();
  const dataset = String(args.dataset || '').trim();

  if (!id) {
    fail('--connector is required.');
  }

  if (!dataset) {
    fail('--dataset is required.');
  }

  const live = args.live === true;

  runClasp('REOS_COUNTY_TERMINAL_SYNC', {
    action: 'sync',
    connectorId: id,
    dataset,
    limit: Number(args.limit || 10),
    cursor: String(args.cursor || ''),
    dryRun: !live,
    confirmLive: live
  });
}

function commandConfigure(args) {
  const id = String(args.connector || '').trim();
  const dataset = String(args.dataset || '').trim();
  const endpoint = String(args.endpoint || '').trim();

  if (!id || !dataset || !endpoint) {
    fail(
      '--connector, --dataset, and --endpoint are required.'
    );
  }

  runClasp('REOS_COUNTY_TERMINAL_SYNC', {
    action: 'configure-endpoint',
    connectorId: id,
    dataset,
    endpoint
  });
}

function commandHealth(args) {
  const adapter = String(args.adapter || '').trim();
  const endpoint = String(args.endpoint || '').trim();

  if (!adapter || !endpoint) {
    fail('--adapter and --endpoint are required.');
  }

  runClasp('REOS_COUNTY_TERMINAL_SYNC', {
    action: 'adapter-health',
    adapter,
    endpoint
  });
}

function showHelp() {
  console.log(`
REOS County Connector CLI

Commands:

  county:create
    Generate a county connector and manifest.

    ./tools/reos county:create \\
      --state PA \\
      --county Bucks \\
      --adapter arcgis \\
      --datasets property_assessment,tax_delinquent

  county:list
    List generated connector manifests.

  county:discover
    Discover county datasets from public data catalogs.

    ./tools/reos county:discover \
      --state PA \
      --county Montgomery

    Include adapter health checks:

    ./tools/reos county:discover \
      --state PA \
      --county Montgomery \
      --health \
      --health-limit 10

    Limit discovery sources:

    ./tools/reos county:discover \
      --state PA \
      --county Montgomery \
      --sources arcgis,socrata

  national:build
    Coordinate county connector builds across multiple states.

    Plan only:

    ./tools/reos national:build \
      --states PA,NJ,DE

    Plan selected counties only:

    ./tools/reos national:build \
      --states PA,NJ \
      --counties "PA:Lancaster,York;NJ:Camden,Burlington"

    Execute local state builds without deployment:

    ./tools/reos national:build \
      --states PA,NJ \
      --execute \
      --continue-on-error

    Generate, push once, refresh the registry, and dry-test:

    ./tools/reos national:build \
      --states PA,NJ,DE \
      --execute \
      --push \
      --test \
      --samples 50 \
      --test-limit 10 \
      --continue-on-error

    Rebuild existing connectors:

    ./tools/reos national:build \
      --states PA \
      --execute \
      --rebuild \
      --push \
      --test

  county:registry-refresh
    Rebuild the central county registry from manifests.

    ./tools/reos county:registry-refresh

  county:registry-list
    List registered county connectors.

    ./tools/reos county:registry-list

    ./tools/reos county:registry-list \
      --state PA

  county:registry-status
    Show one complete registry entry.

    ./tools/reos county:registry-status \
      --connector PA-BUCKS

  county:registry-update
    Run endpoint health and terminal dry-sync verification.

    ./tools/reos county:registry-update \
      --connector PA-BUCKS \
      --health \
      --test \
      --limit 10

    Update all generated connectors:

    ./tools/reos county:registry-update \
      --all \
      --generated-only \
      --health \
      --test \
      --limit 10 \
      --continue-on-error

  state:build
    Build county connectors across an entire state.

    Plan only:

    ./tools/reos state:build \
      --state PA

    Limit to selected counties:

    ./tools/reos state:build \
      --state PA \
      --counties Lancaster,York

    Execute local generation:

    ./tools/reos state:build \
      --state PA \
      --counties Lancaster,York \
      --execute

    Generate, push once, and terminal dry-test:

    ./tools/reos state:build \
      --state PA \
      --counties Lancaster,York \
      --execute \
      --push \
      --test \
      --samples 50 \
      --test-limit 10

    Rebuild existing connectors:

    ./tools/reos state:build \
      --state PA \
      --counties Bucks,Montgomery \
      --execute \
      --rebuild

  county:build
    Run the complete county connector build pipeline.

    Plan and review only:

    ./tools/reos county:build \
      --state PA \
      --county Delaware \
      --datasets property_assessment

    Execute local generation without deployment:

    ./tools/reos county:build \
      --state PA \
      --county Delaware \
      --datasets property_assessment \
      --execute

    Full generation, deployment, and terminal dry sync:

    ./tools/reos county:build \
      --state PA \
      --county Delaware \
      --datasets property_assessment \
      --execute \
      --push \
      --test \
      --samples 50 \
      --test-limit 10

    Continue through independently failing datasets:

    ./tools/reos county:build \
      --state PA \
      --county Delaware \
      --datasets property_assessment,code_violations \
      --execute \
      --push \
      --test \
      --continue-on-error

  county:discover-all
    Automatically discover and select datasets for a county.

    Review-only discovery:

    ./tools/reos county:discover-all \
      --state PA \
      --county Chester \
      --health

    Discover, promote, configure, push, and dry-test:

    ./tools/reos county:discover-all \
      --state PA \
      --county Chester \
      --health \
      --promote \
      --push \
      --test \
      --test-limit 5

    Restrict dataset types:

    ./tools/reos county:discover-all \
      --state PA \
      --county Chester \
      --datasets property_assessment,tax_delinquent

  county:promote
    Promote one discovery candidate into a county manifest.

    ./tools/reos county:promote \
      --report reports/county-discovery/PA-MONTGOMERY-DISCOVERY.json \
      --candidate 1

    Promote, push, configure, and dry-test:

    ./tools/reos county:promote \
      --report reports/county-discovery/PA-MONTGOMERY-DISCOVERY.json \
      --candidate 1 \
      --push \
      --configure \
      --test \
      --limit 5

    Override classification or replace an existing dataset:

    ./tools/reos county:promote \
      --report reports/county-discovery/PA-MONTGOMERY-DISCOVERY.json \
      --candidate 3 \
      --dataset property_assessment \
      --replace \
      --force

  county:automap
    Infer manifest field mappings from live source records.

    Review-only mapping:

    ./tools/reos county:automap \
      --connector PA-MONTGOMERY \
      --dataset property_assessment \
      --samples 25

    Apply, regenerate, push, and dry-test:

    ./tools/reos county:automap \
      --connector PA-MONTGOMERY \
      --dataset property_assessment \
      --samples 25 \
      --apply \
      --push \
      --test \
      --limit 10

    Replace existing mappings instead of merging:

    ./tools/reos county:automap \
      --connector PA-MONTGOMERY \
      --dataset property_assessment \
      --apply \
      --replace

  county:regenerate
    Rebuild generated Apps Script connectors from JSON manifests.

    ./tools/reos county:regenerate \
      --connector PA-BUCKS

    Regenerate, push, and regression-test:

    ./tools/reos county:regenerate \
      --connector PA-BUCKS \
      --push \
      --test \
      --limit 5

    Regenerate every manifest:

    ./tools/reos county:regenerate \
      --all

  county:test
    Dry-run every registered dataset for one county.

    ./tools/reos county:test \\
      --connector PA-BUCKS \\
      --limit 5

  county:sync
    Run one dataset in dry-run mode.

    ./tools/reos county:sync \\
      --connector PA-BUCKS \\
      --dataset property_assessment \\
      --limit 10

    Add --live to perform a confirmed live sync.

  county:configure
    Save a dataset endpoint in Apps Script properties.

  county:health
    Run a shared-adapter endpoint health check.
`);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

switch (command) {
  case 'county:create':
    commandCreate(args);
    break;

  case 'county:list':
    commandList();
    break;

  case 'county:discover':
    await commandDiscover(args);
    break;

  case 'county:discover-all':
    await commandDiscoverAll(args);
    break;

  case 'county:build':
    await commandBuild(args);
    break;

  case 'state:build':
    await commandStateBuild(args);
    break;

  case 'county:registry-refresh':
    commandRegistryRefresh(args);
    break;

  case 'county:registry-list':
    commandRegistryList(args);
    break;

  case 'county:registry-status':
    commandRegistryStatus(args);
    break;

  case 'county:registry-update':
    commandRegistryUpdate(args);
    break;

  case 'national:build':
    await commandNationalBuild(args);
    break;

  case 'county:schema-drift':
    await commandSchemaDrift(args);
    break;

  case 'county:schema-drift-all':
    await commandSchemaDriftAll(args);
    break;

  case 'county:self-heal':
    await commandSelfHeal(args);
    break;

  case 'county:self-heal-all':
    await commandSelfHealAll(args);
    break;

  case 'county:promote':
    commandPromote(args);
    break;

  case 'county:automap':
    await commandAutoMap(args);
    break;

  case 'county:regenerate':
    commandRegenerate(args);
    break;

  case 'county:test':
    commandTest(args);
    break;

  case 'county:sync':
    commandSync(args);
    break;

  case 'county:configure':
    commandConfigure(args);
    break;

  case 'county:health':
    commandHealth(args);
    break;

  case 'help':
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;

  default:
    fail(`Unknown command: ${command}`);
}
