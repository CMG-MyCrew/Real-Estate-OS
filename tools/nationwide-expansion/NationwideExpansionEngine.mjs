import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CATALOG_YEAR = '2025';

const STATE_FIPS = {
  AL: '01',
  AK: '02',
  AZ: '04',
  AR: '05',
  CA: '06',
  CO: '08',
  CT: '09',
  DE: '10',
  DC: '11',
  FL: '12',
  GA: '13',
  HI: '15',
  ID: '16',
  IL: '17',
  IN: '18',
  IA: '19',
  KS: '20',
  KY: '21',
  LA: '22',
  ME: '23',
  MD: '24',
  MA: '25',
  MI: '26',
  MN: '27',
  MS: '28',
  MO: '29',
  MT: '30',
  NE: '31',
  NV: '32',
  NH: '33',
  NJ: '34',
  NM: '35',
  NY: '36',
  NC: '37',
  ND: '38',
  OH: '39',
  OK: '40',
  OR: '41',
  PA: '42',
  RI: '44',
  SC: '45',
  SD: '46',
  TN: '47',
  TX: '48',
  UT: '49',
  VT: '50',
  VA: '51',
  WA: '53',
  WV: '54',
  WI: '55',
  WY: '56'
};

const STATE_NAMES = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming'
};

const HEALTHY_STATUSES = new Set([
  'READY',
  'PRODUCTION',
  'DISABLED'
]);

function nowIso() {
  return new Date().toISOString();
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, {
    recursive: true
  });
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

  fs.renameSync(
    temporaryPath,
    filePath
  );
}

function runCommand({
  root,
  command,
  args = [],
  inherit = true
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
    exitCode:
      typeof result.status === 'number'
        ? result.status
        : 1,
    stdout: inherit
      ? ''
      : String(result.stdout || '').trim(),
    stderr: inherit
      ? ''
      : String(result.stderr || '').trim(),
    error:
      result.error?.message || ''
  };
}

function runReos(
  root,
  args,
  inherit = true
) {
  return runCommand({
    root,
    command: process.execPath,
    args: [
      path.join(
        root,
        'tools',
        'reos.mjs'
      ),
      ...args
    ],
    inherit
  });
}

function normalizeState(value) {
  const state = String(value || '')
    .trim()
    .toUpperCase();

  if (!STATE_FIPS[state]) {
    throw new Error(
      `Unsupported state abbreviation: ${state}`
    );
  }

  return state;
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeCountyName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+County$/i, '')
    .replace(/\s+Parish$/i, '')
    .replace(/\s+Borough$/i, '')
    .replace(/\s+Census Area$/i, '')
    .replace(/\s+Municipality$/i, '')
    .replace(/\s+/g, ' ');
}

function connectorCountySlug(value) {
  return normalizeCountyName(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function connectorId(state, county) {
  return [
    state,
    connectorCountySlug(county)
  ].join('-');
}

function nationwideCatalogPath(root) {
  return path.join(
    root,
    'config',
    'nationwide',
    'US.json'
  );
}

function stateCatalogPath(root, state) {
  return path.join(
    root,
    'config',
    'states',
    `${state}.json`
  );
}

function registryPath(root) {
  return path.join(
    root,
    'config',
    'county-registry',
    'registry.json'
  );
}

function expansionReportPath(root) {
  return path.join(
    root,
    'reports',
    'nationwide-expansion',
    'expansion-report.json'
  );
}

function coverageReportPath(root) {
  return path.join(
    root,
    'reports',
    'nationwide-expansion',
    'coverage-report.json'
  );
}

function checkpointPath(root) {
  return path.join(
    root,
    'reports',
    'nationwide-expansion',
    'checkpoint.json'
  );
}

function catalogSourceUrl(state) {
  const fips = STATE_FIPS[state];

  return (
    'https://www2.census.gov/geo/docs/' +
    'maps-data/data/gazetteer/' +
    `${CATALOG_YEAR}_Gazetteer/` +
    `${CATALOG_YEAR}_gaz_counties_${fips}.txt`
  );
}

function parsePipeDelimited(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(line => line.trim() !== '');

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0]
    .split('|')
    .map(value => value.trim());

  return lines
    .slice(1)
    .map(line => {
      const values = line.split('|');
      const record = {};

      headers.forEach((header, index) => {
        record[header] =
          String(values[index] || '').trim();
      });

      return record;
    });
}

async function fetchStateCounties(state) {
  const url = catalogSourceUrl(state);

  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain',
      'User-Agent':
        'REOS-Nationwide-Expansion/1.0'
    },
    redirect: 'follow'
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `County Gazetteer request failed for ${state}: ` +
      `HTTP ${response.status}; ` +
      `body=${body.slice(0, 300)}`
    );
  }

  const rows = parsePipeDelimited(body);

  if (!rows.length) {
    throw new Error(
      `County Gazetteer returned no records for ${state}.`
    );
  }

  const expectedStateFips =
    STATE_FIPS[state];

  return rows
    .filter(row => {
      return (
        row.USPS === state &&
        String(row.GEOID || '')
          .startsWith(expectedStateFips)
      );
    })
    .map(row => ({
      name: normalizeCountyName(row.NAME),
      legalName: row.NAME,
      geoid: row.GEOID,
      stateFips:
        String(row.GEOID || '').slice(0, 2),
      countyFips:
        String(row.GEOID || '').slice(2),
      ansiCode: row.ANSICODE || '',
      landSquareMiles:
        Number(row.ALAND_SQMI || 0),
      waterSquareMiles:
        Number(row.AWATER_SQMI || 0),
      latitude:
        Number(row.INTPTLAT || 0),
      longitude:
        Number(row.INTPTLONG || 0)
    }))
    .filter(county => county.name)
    .sort((left, right) => {
      return left.name.localeCompare(
        right.name
      );
    });
}

export async function syncNationwideCatalog(
  options = {}
) {
  const root =
    options.root || process.cwd();

  const states = unique(
    (
      options.states?.length
        ? options.states
        : Object.keys(STATE_FIPS)
    )
      .map(normalizeState)
  ).sort();

  const catalog = {
    schemaVersion: '1.0.0',
    catalogYear: CATALOG_YEAR,
    generatedAt: nowIso(),
    source:
      'U.S. Census Bureau Gazetteer county files',
    sourceBase:
      'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/',
    states: {},
    counts: {
      requested: states.length,
      succeeded: 0,
      failed: 0,
      counties: 0
    }
  };

  for (const state of states) {
    console.log(
      `Fetching county catalog for ${state}...`
    );

    try {
      const counties =
        await fetchStateCounties(state);

      const stateEntry = {
        state,
        name: STATE_NAMES[state],
        fips: STATE_FIPS[state],
        catalogYear: CATALOG_YEAR,
        sourceUrl:
          catalogSourceUrl(state),
        countyCount:
          counties.length,
        counties
      };

      catalog.states[state] =
        stateEntry;

      catalog.counts.succeeded += 1;
      catalog.counts.counties +=
        counties.length;

      const outputPath =
        stateCatalogPath(root, state);

      const existing =
        readJson(outputPath, null);

      const stateCatalog = {
        schemaVersion: '1.0.0',
        state,
        name: STATE_NAMES[state],
        fips: STATE_FIPS[state],
        catalogYear: CATALOG_YEAR,
        generatedAt: nowIso(),
        source:
          'U.S. Census Bureau Gazetteer county files',
        sourceUrl:
          catalogSourceUrl(state),
        counties:
          counties.map(county => county.name),
        countyMetadata:
          Object.fromEntries(
            counties.map(county => [
              county.name,
              county
            ])
          )
      };

      if (
        existing &&
        options.overwrite !== true
      ) {
        stateCatalog.preservedConfiguration =
          Object.fromEntries(
            Object.entries(existing)
              .filter(([key]) => {
                return ![
                  'counties',
                  'countyMetadata',
                  'generatedAt',
                  'source',
                  'sourceUrl',
                  'catalogYear'
                ].includes(key);
              })
          );

        Object.assign(
          stateCatalog,
          stateCatalog.preservedConfiguration
        );

        delete stateCatalog
          .preservedConfiguration;
      }

      writeJsonAtomic(
        outputPath,
        stateCatalog
      );
    } catch (error) {
      catalog.counts.failed += 1;

      catalog.states[state] = {
        state,
        name: STATE_NAMES[state],
        fips: STATE_FIPS[state],
        sourceUrl:
          catalogSourceUrl(state),
        error: error.message,
        counties: []
      };

      console.error(
        `${state}: ${error.message}`
      );

      if (!options.continueOnError) {
        writeJsonAtomic(
          nationwideCatalogPath(root),
          catalog
        );

        throw error;
      }
    }
  }

  writeJsonAtomic(
    nationwideCatalogPath(root),
    catalog
  );

  return {
    ok: catalog.counts.failed === 0,
    catalog,
    catalogPath:
      nationwideCatalogPath(root)
  };
}

function loadRegistry(root) {
  return readJson(
    registryPath(root),
    {
      connectors: {}
    }
  );
}

function getStateCounties(root, state) {
  const catalog = readJson(
    stateCatalogPath(root, state),
    null
  );

  if (!catalog) {
    throw new Error(
      `State catalog not found for ${state}. ` +
      `Run nationwide:catalog-sync first.`
    );
  }

  return Array.isArray(catalog.counties)
    ? catalog.counties
    : [];
}

function selectCounties({
  root,
  state,
  countyLimit,
  overrides,
  includeExisting
}) {
  const registry = loadRegistry(root);
  const connectors =
    registry.connectors || {};

  let counties =
    getStateCounties(root, state);

  if (overrides?.length) {
    const requested = new Set(
      overrides.map(value => {
        return normalizeCountyName(value)
          .toLowerCase();
      })
    );

    counties = counties.filter(county => {
      return requested.has(
        normalizeCountyName(county)
          .toLowerCase()
      );
    });
  }

  if (!includeExisting) {
    counties = counties.filter(county => {
      const entry =
        connectors[
          connectorId(state, county)
        ];

      return (
        !entry ||
        !HEALTHY_STATUSES.has(
          entry.status
        )
      );
    });
  }

  if (countyLimit > 0) {
    counties = counties.slice(
      0,
      countyLimit
    );
  }

  return counties;
}

export function generateCoverageReport(
  options = {}
) {
  const root =
    options.root || process.cwd();

  const nationalCatalog = readJson(
    nationwideCatalogPath(root),
    null
  );

  const states = unique(
    (
      options.states?.length
        ? options.states
        : Object.keys(
            nationalCatalog?.states || {}
          )
    )
      .map(normalizeState)
  ).sort();

  const registry = loadRegistry(root);
  const connectors =
    registry.connectors || {};

  const report = {
    schemaVersion: '1.0.0',
    generatedAt: nowIso(),
    states: {},
    totals: {
      states: 0,
      counties: 0,
      connectors: 0,
      ready: 0,
      production: 0,
      reviewRequired: 0,
      failed: 0,
      missing: 0
    }
  };

  for (const state of states) {
    const counties =
      getStateCounties(root, state);

    const countyResults =
      counties.map(county => {
        const id =
          connectorId(state, county);

        const entry =
          connectors[id] || null;

        return {
          county,
          connectorId: id,
          exists: Boolean(entry),
          status:
            entry?.status || 'MISSING',
          implementation:
            entry?.implementation || '',
          datasets:
            Object.keys(
              entry?.datasets || {}
            ).length
        };
      });

    const stateReport = {
      state,
      name: STATE_NAMES[state],
      countyCount:
        countyResults.length,
      connectorCount:
        countyResults.filter(item => {
          return item.exists;
        }).length,
      ready:
        countyResults.filter(item => {
          return item.status === 'READY';
        }).length,
      production:
        countyResults.filter(item => {
          return (
            item.status === 'PRODUCTION'
          );
        }).length,
      reviewRequired:
        countyResults.filter(item => {
          return (
            item.status ===
            'REVIEW_REQUIRED'
          );
        }).length,
      failed:
        countyResults.filter(item => {
          return [
            'FAILED',
            'ERROR',
            'INACCESSIBLE'
          ].includes(item.status);
        }).length,
      missing:
        countyResults.filter(item => {
          return item.status === 'MISSING';
        }).length,
      counties: countyResults
    };

    report.states[state] =
      stateReport;

    report.totals.states += 1;
    report.totals.counties +=
      stateReport.countyCount;
    report.totals.connectors +=
      stateReport.connectorCount;
    report.totals.ready +=
      stateReport.ready;
    report.totals.production +=
      stateReport.production;
    report.totals.reviewRequired +=
      stateReport.reviewRequired;
    report.totals.failed +=
      stateReport.failed;
    report.totals.missing +=
      stateReport.missing;
  }

  writeJsonAtomic(
    coverageReportPath(root),
    report
  );

  return {
    ...report,
    reportPath:
      coverageReportPath(root)
  };
}

export async function runNationwideExpansion(
  options = {}
) {
  const root =
    options.root || process.cwd();

  const nationalCatalog = readJson(
    nationwideCatalogPath(root),
    null
  );

  const states = unique(
    (
      options.states?.length
        ? options.states
        : Object.keys(
            nationalCatalog?.states || {}
          )
    )
      .map(normalizeState)
  ).sort();

  if (!states.length) {
    throw new Error(
      'No states selected or available.'
    );
  }

  const checkpoint = options.resume
    ? readJson(
        checkpointPath(root),
        {
          completedStates: []
        }
      )
    : {
        completedStates: []
      };

  const completedStates =
    new Set(
      checkpoint.completedStates || []
    );

  const report = {
    schemaVersion: '1.0.0',
    expansionId:
      `NWE-${Date.now()}-` +
      `${Math.floor(Math.random() * 10000)}`,
    startedAt: nowIso(),
    completedAt: '',
    mode:
      options.execute === true
        ? 'EXECUTE'
        : 'PLAN_ONLY',
    datasets:
      options.datasets || [
        'property_assessment'
      ],
    statesRequested: states,
    states: {},
    counts: {
      statesPlanned: 0,
      statesExecuted: 0,
      statesSkipped: 0,
      statesFailed: 0,
      countiesPlanned: 0,
      countiesAttempted: 0
    },
    ok: false
  };

  const statePlans = [];

  console.log('');
  console.log(
    'REOS Nationwide Expansion Engine'
  );
  console.log(
    '================================'
  );
  console.log(`Mode: ${report.mode}`);
  console.log('');

  for (const state of states) {
    if (
      options.resume &&
      completedStates.has(state)
    ) {
      report.states[state] = {
        state,
        status: 'CHECKPOINT_SKIPPED',
        counties: []
      };

      report.counts.statesSkipped += 1;
      continue;
    }

    try {
      const counties = selectCounties({
        root,
        state,
        countyLimit:
          Number(
            options.countyLimit || 0
          ),
        overrides:
          options.countyOverrides?.[
            state
          ] || [],
        includeExisting:
          options.includeExisting === true
      });

      const plan = {
        state,
        status:
          options.execute === true
            ? 'QUEUED'
            : 'PLANNED',
        countyCount:
          counties.length,
        counties
      };

      report.states[state] = plan;
      statePlans.push(plan);

      report.counts.statesPlanned += 1;
      report.counts.countiesPlanned +=
        counties.length;

      console.log(
        [
          state.padEnd(5),
          plan.status.padEnd(18),
          `counties=${counties.length}`
        ].join(' | ')
      );
    } catch (error) {
      report.states[state] = {
        state,
        status: 'PLAN_FAILED',
        error: error.message,
        counties: []
      };

      report.counts.statesFailed += 1;

      if (!options.continueOnError) {
        break;
      }
    }
  }

  if (options.execute !== true) {
    report.completedAt = nowIso();
    report.ok =
      report.counts.statesFailed === 0;

    writeJsonAtomic(
      expansionReportPath(root),
      report
    );

    generateCoverageReport({
      root,
      states
    });

    console.log('');
    console.log(
      `Counties planned: ` +
      `${report.counts.countiesPlanned}`
    );
    console.log(
      `Report: ` +
      `${path.relative(
        root,
        expansionReportPath(root)
      )}`
    );

    return {
      ok: report.ok,
      planOnly: true,
      counts: report.counts,
      reportPath:
        expansionReportPath(root)
    };
  }

  for (const plan of statePlans) {
    if (!plan.counties.length) {
      plan.status = 'NO_WORK';
      completedStates.add(plan.state);
      continue;
    }

    console.log('');
    console.log(
      `===== Expanding ${plan.state} =====`
    );

    const args = [
      'national:build',
      '--states',
      plan.state,
      '--counties',
      `${plan.state}:` +
        plan.counties.join(','),
      '--datasets',
      report.datasets.join(','),
      '--execute',
      '--samples',
      String(options.samples || 50),
      '--results',
      String(options.results || 150),
      '--health-limit',
      String(options.healthLimit || 25),
      '--test-limit',
      String(options.testLimit || 10),
      '--test'
    ];

    if (options.push === true) {
      args.push('--push');
    }

    if (options.rebuild === true) {
      args.push('--rebuild');
    }

    if (options.continueOnError) {
      args.push('--continue-on-error');
    }

    const result = runReos(
      root,
      args,
      true
    );

    report.counts.countiesAttempted +=
      plan.counties.length;

    if (result.ok) {
      plan.status = 'PASS';
      plan.ok = true;

      report.counts.statesExecuted += 1;
      completedStates.add(plan.state);
    } else {
      plan.status = 'REVIEW_REQUIRED';
      plan.ok = false;
      plan.exitCode =
        result.exitCode;

      report.counts.statesFailed += 1;

      if (!options.continueOnError) {
        break;
      }
    }

    writeJsonAtomic(
      checkpointPath(root),
      {
        schemaVersion: '1.0.0',
        expansionId:
          report.expansionId,
        updatedAt: nowIso(),
        completedStates:
          [...completedStates].sort()
      }
    );
  }

  runReos(
    root,
    [
      'county:registry-refresh'
    ],
    true
  );

  runReos(
    root,
    [
      'county:registry-update',
      '--all',
      '--generated-only',
      '--health',
      '--test',
      '--limit',
      String(options.testLimit || 10),
      '--continue-on-error'
    ],
    true
  );

  const coverage =
    generateCoverageReport({
      root,
      states
    });

  report.completedAt = nowIso();
  report.coverage =
    coverage.totals;
  report.ok =
    report.counts.statesFailed === 0;

  writeJsonAtomic(
    expansionReportPath(root),
    report
  );

  console.log('');
  console.log(
    'Nationwide expansion summary'
  );
  console.log(
    '----------------------------'
  );
  console.log(
    `States planned:     ` +
    `${report.counts.statesPlanned}`
  );
  console.log(
    `States executed:    ` +
    `${report.counts.statesExecuted}`
  );
  console.log(
    `States skipped:     ` +
    `${report.counts.statesSkipped}`
  );
  console.log(
    `States failed:      ` +
    `${report.counts.statesFailed}`
  );
  console.log(
    `Counties planned:   ` +
    `${report.counts.countiesPlanned}`
  );
  console.log(
    `Counties attempted: ` +
    `${report.counts.countiesAttempted}`
  );
  console.log(
    `Ready:              ` +
    `${coverage.totals.ready}`
  );
  console.log(
    `Production:         ` +
    `${coverage.totals.production}`
  );
  console.log(
    `Review required:    ` +
    `${coverage.totals.reviewRequired}`
  );
  console.log(
    `Failed:             ` +
    `${coverage.totals.failed}`
  );
  console.log(
    `Missing:            ` +
    `${coverage.totals.missing}`
  );
  console.log(
    `Status:             ` +
    `${report.ok ? 'PASS' : 'REVIEW_REQUIRED'}`
  );
  console.log(
    `Report:             ` +
    `${path.relative(
      root,
      expansionReportPath(root)
    )}`
  );

  return {
    ok: report.ok,
    counts: report.counts,
    coverage: coverage.totals,
    reportPath:
      expansionReportPath(root),
    coveragePath:
      coverageReportPath(root)
  };
}

export function resetExpansionCheckpoint(
  options = {}
) {
  const root =
    options.root || process.cwd();

  const filePath =
    checkpointPath(root);

  const existed =
    fs.existsSync(filePath);

  if (existed) {
    fs.unlinkSync(filePath);
  }

  return {
    ok: true,
    deleted: existed,
    checkpoint:
      path.relative(root, filePath)
  };
}
