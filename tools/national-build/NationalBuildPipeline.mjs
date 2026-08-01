import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

function nowIso() {
  return new Date().toISOString();
}

function runCommand({
  root,
  command,
  args,
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

function runReos(root, args, inherit = true) {
  return runCommand({
    root,
    command: process.execPath,
    args: [
      path.join(root, 'tools', 'reos.mjs'),
      ...args
    ],
    inherit
  });
}

function runClaspPush(root) {
  return runCommand({
    root,
    command: 'npx',
    args: ['clasp', 'push'],
    inherit: true
  });
}

function normalizeState(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function stateCatalogPath(root, state) {
  return path.join(
    root,
    'config',
    'states',
    `${state}.json`
  );
}

function stateBuildReportPath(root, state) {
  return path.join(
    root,
    'reports',
    'state-build',
    state,
    'build-report.json'
  );
}

function loadStateCatalog(root, state) {
  const catalogPath =
    stateCatalogPath(root, state);

  if (!fs.existsSync(catalogPath)) {
    return {
      ok: false,
      state,
      catalogPath,
      error:
        `State catalog not found: ` +
        `${path.relative(root, catalogPath)}`
    };
  }

  try {
    const catalog = readJson(catalogPath);

    if (
      !catalog ||
      !Array.isArray(catalog.counties)
    ) {
      return {
        ok: false,
        state,
        catalogPath,
        error:
          `State catalog has no counties array: ` +
          `${path.relative(root, catalogPath)}`
      };
    }

    return {
      ok: true,
      state,
      catalogPath,
      catalog
    };
  } catch (error) {
    return {
      ok: false,
      state,
      catalogPath,
      error: error.message
    };
  }
}

function selectedStateCounties(
  catalog,
  countyOverrides
) {
  const override =
    countyOverrides?.[catalog.state];

  if (
    Array.isArray(override) &&
    override.length
  ) {
    return override;
  }

  return catalog.counties;
}

function collectGeneratedConnectors(
  stateReport
) {
  if (!stateReport) {
    return [];
  }

  return (stateReport.counties || [])
    .filter(county => {
      return [
        'GENERATED',
        'PASS',
        'CONFIGURED',
        'SKIPPED_EXISTING'
      ].includes(county.status);
    })
    .map(county => county.connectorId)
    .filter(Boolean);
}

function buildStage(name, details = {}) {
  return {
    name,
    startedAt: nowIso(),
    completedAt: '',
    ok: null,
    ...details
  };
}

function finishStage(stage, ok, details = {}) {
  stage.completedAt = nowIso();
  stage.ok = ok;

  Object.assign(stage, details);

  return stage;
}

function printHeader(states) {
  console.log('');
  console.log('REOS National Build Orchestrator');
  console.log('================================');
  console.log(`States: ${states.join(', ')}`);
  console.log('');
}

function printStateLine(result) {
  console.log(
    [
      result.state.padEnd(6),
      String(result.status || '').padEnd(20),
      `counties=${result.countyCount ?? 0}`,
      `connectors=${result.connectorCount ?? 0}`
    ].join(' | ')
  );
}

function parseRegistryStatus(entry) {
  if (!entry) {
    return {
      ok: false,
      status: 'REGISTRY_ENTRY_MISSING'
    };
  }

  const badStatuses = new Set([
    'ERROR',
    'REVIEW_REQUIRED',
    'INACCESSIBLE'
  ]);

  return {
    ok: !badStatuses.has(entry.status),
    status: entry.status
  };
}

function runRegistryVerification({
  root,
  connectorId,
  health,
  test,
  limit,
  continueOnError
}) {
  const args = [
    'county:registry-update',
    '--connector',
    connectorId
  ];

  if (health) {
    args.push('--health');
  }

  if (test) {
    args.push(
      '--test',
      '--limit',
      String(limit)
    );
  }

  if (continueOnError) {
    args.push('--continue-on-error');
  }

  return runReos(
    root,
    args,
    false
  );
}

function extractRegistryEntry(output) {
  const text = String(output || '').trim();

  if (!text) {
    return null;
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (
    firstBrace === -1 ||
    lastBrace === -1 ||
    lastBrace <= firstBrace
  ) {
    return null;
  }

  try {
    return JSON.parse(
      text.slice(firstBrace, lastBrace + 1)
    );
  } catch {
    return null;
  }
}

export async function runNationalBuildPipeline(
  options = {}
) {
  const root = options.root || process.cwd();

  const states = uniqueValues(
    (options.states || [])
      .map(normalizeState)
      .filter(state => /^[A-Z]{2}$/.test(state))
  );

  if (!states.length) {
    throw new Error(
      'National build requires at least one two-letter state code.'
    );
  }

  const reportDirectory = path.join(
    root,
    'reports',
    'national-build'
  );

  ensureDirectory(reportDirectory);

  const reportPath = path.join(
    reportDirectory,
    'build-report.json'
  );

  const report = {
    schemaVersion: '1.0.0',
    buildId:
      `NBP-${Date.now()}-` +
      `${Math.floor(Math.random() * 10000)}`,
    startedAt: nowIso(),
    completedAt: '',
    mode: options.execute
      ? 'EXECUTE'
      : 'PLAN_ONLY',
    statesRequested: states,
    datasets: options.datasets,
    stages: [],
    states: {},
    connectors: {},
    counts: {
      statesRequested: states.length,
      statesAvailable: 0,
      statesMissingCatalog: 0,
      statesBuilt: 0,
      statesFailed: 0,
      countiesRequested: 0,
      connectorsDiscovered: 0,
      connectorsVerified: 0,
      connectorsReady: 0,
      connectorsReviewRequired: 0,
      connectorsFailed: 0
    },
    push: {
      requested: options.push === true,
      attempted: false,
      ok: null
    },
    registryRefresh: {
      attempted: false,
      ok: null
    },
    ok: false
  };

  printHeader(states);

  /*
   * Phase 1: validate state catalogs and create the national plan.
   */
  const availableStates = [];

  for (const state of states) {
    const catalogResult =
      loadStateCatalog(root, state);

    const stateResult = {
      state,
      catalog:
        path.relative(
          root,
          catalogResult.catalogPath
        ),
      status: '',
      countyCount: 0,
      connectorCount: 0,
      buildReport: '',
      error: '',
      ok: null
    };

    report.states[state] = stateResult;

    if (!catalogResult.ok) {
      stateResult.status =
        'CATALOG_MISSING';

      stateResult.error =
        catalogResult.error;

      stateResult.ok = false;

      report.counts.statesMissingCatalog += 1;

      printStateLine(stateResult);

      if (!options.continueOnError) {
        report.completedAt = nowIso();

        writeJsonAtomic(
          reportPath,
          report
        );

        return {
          ok: false,
          reportPath,
          message:
            `State catalog missing for ${state}.`
        };
      }

      continue;
    }

    const counties =
      selectedStateCounties(
        catalogResult.catalog,
        options.countyOverrides
      );

    stateResult.status = options.execute
      ? 'QUEUED'
      : 'PLANNED';

    stateResult.countyCount =
      counties.length;

    stateResult.ok = true;

    stateResult.counties = counties;

    report.counts.statesAvailable += 1;
    report.counts.countiesRequested +=
      counties.length;

    availableStates.push({
      state,
      catalog: catalogResult.catalog,
      counties,
      result: stateResult
    });

    printStateLine(stateResult);
  }

  if (!availableStates.length) {
    report.completedAt = nowIso();
    report.ok = false;

    writeJsonAtomic(
      reportPath,
      report
    );

    return {
      ok: false,
      reportPath,
      message:
        'No usable state catalogs were found.'
    };
  }

  if (!options.execute) {
    report.completedAt = nowIso();
    report.ok =
      report.counts.statesMissingCatalog === 0 ||
      options.continueOnError === true;

    writeJsonAtomic(
      reportPath,
      report
    );

    console.log('');
    console.log(
      'National build plan complete.'
    );

    console.log(
      `Report: ${path.relative(root, reportPath)}`
    );

    return {
      ok: report.ok,
      planOnly: true,
      reportPath
    };
  }

  /*
   * Phase 2: execute local state builds.
   *
   * State builders do not push or terminal-test here.
   * The National Orchestrator pushes once after all local work.
   */
  for (const stateItem of availableStates) {
    console.log('');
    console.log(
      `===== Building state ${stateItem.state} =====`
    );

    const args = [
      'state:build',
      '--state',
      stateItem.state,
      '--counties',
      stateItem.counties.join(','),
      '--datasets',
      options.datasets.join(','),
      '--execute',
      '--samples',
      String(options.samples),
      '--results',
      String(options.results),
      '--health-limit',
      String(options.healthLimit)
    ];

    if (options.rebuild) {
      args.push('--rebuild');
    }

    if (options.continueOnError) {
      args.push('--continue-on-error');
    }

    if (options.replaceMappings) {
      args.push('--replace-mappings');
    }

    if (options.noFilter) {
      args.push('--no-filter');
    }

    const buildResult = runReos(
      root,
      args,
      true
    );

    const stateReportPath =
      stateBuildReportPath(
        root,
        stateItem.state
      );

    stateItem.result.buildReport =
      path.relative(
        root,
        stateReportPath
      );

    const stateBuildReport =
      readJson(
        stateReportPath,
        null
      );

    const connectors =
      collectGeneratedConnectors(
        stateBuildReport
      );

    stateItem.result.connectorCount =
      connectors.length;

    stateItem.result.connectors =
      connectors;

    report.counts.connectorsDiscovered +=
      connectors.length;

    if (!buildResult.ok) {
      stateItem.result.status =
        'BUILD_FAILED';

      stateItem.result.ok = false;

      report.counts.statesFailed += 1;

      printStateLine(stateItem.result);

      if (!options.continueOnError) {
        break;
      }

      continue;
    }

    stateItem.result.status =
      'GENERATED';

    stateItem.result.ok = true;

    report.counts.statesBuilt += 1;

    printStateLine(stateItem.result);
  }

  const buildFailure = Object.values(
    report.states
  ).some(state => state.status === 'BUILD_FAILED');

  if (
    buildFailure &&
    !options.continueOnError
  ) {
    report.completedAt = nowIso();
    report.ok = false;

    writeJsonAtomic(
      reportPath,
      report
    );

    return {
      ok: false,
      reportPath,
      message:
        'National build stopped after a state failure.'
    };
  }

  /*
   * Phase 3: push every generated connector once.
   */
  if (options.push) {
    const pushStage =
      buildStage('national-push');

    report.stages.push(pushStage);
    report.push.attempted = true;

    console.log('');
    console.log(
      '===== National Apps Script push ====='
    );

    const pushResult =
      runClaspPush(root);

    report.push.ok =
      pushResult.ok;

    finishStage(
      pushStage,
      pushResult.ok,
      {
        exitCode:
          pushResult.exitCode
      }
    );

    if (!pushResult.ok) {
      report.completedAt = nowIso();
      report.ok = false;

      writeJsonAtomic(
        reportPath,
        report
      );

      throw new Error(
        'National clasp push failed.'
      );
    }
  }

  /*
   * Phase 4: refresh the central County Registry.
   */
  const registryStage =
    buildStage('registry-refresh');

  report.stages.push(registryStage);
  report.registryRefresh.attempted = true;

  console.log('');
  console.log(
    '===== Refreshing County Registry ====='
  );

  const registryRefresh = runReos(
    root,
    ['county:registry-refresh'],
    true
  );

  report.registryRefresh.ok =
    registryRefresh.ok;

  finishStage(
    registryStage,
    registryRefresh.ok,
    {
      exitCode:
        registryRefresh.exitCode
    }
  );

  if (!registryRefresh.ok) {
    report.completedAt = nowIso();
    report.ok = false;

    writeJsonAtomic(
      reportPath,
      report
    );

    throw new Error(
      'County Registry refresh failed.'
    );
  }

  /*
   * Phase 5: verify each connector built or already present in the
   * requested states through health checks and terminal dry syncs.
   */
  const connectorIds = uniqueValues(
    availableStates.flatMap(stateItem => {
      return stateItem.result.connectors || [];
    })
  ).sort();

  for (const connectorId of connectorIds) {
    console.log('');
    console.log(
      `===== Verifying ${connectorId} =====`
    );

    const verification =
      runRegistryVerification({
        root,
        connectorId,
        health: options.health,
        test: options.test,
        limit: options.testLimit,
        continueOnError:
          options.continueOnError
      });

    if (verification.stdout) {
      console.log(
        verification.stdout
      );
    }

    if (verification.stderr) {
      console.error(
        verification.stderr
      );
    }

    const entry = extractRegistryEntry(
      [
        verification.stdout,
        verification.stderr
      ].join('\n')
    );

    const registryStatus =
      parseRegistryStatus(entry);

    const connectorResult = {
      connectorId,
      status:
        registryStatus.status,
      ok:
        verification.ok &&
        registryStatus.ok,
      registryEntryFound:
        Boolean(entry),
      checkedAt: nowIso(),
      exitCode:
        verification.exitCode
    };

    report.connectors[connectorId] =
      connectorResult;

    report.counts.connectorsVerified += 1;

    if (connectorResult.ok) {
      report.counts.connectorsReady += 1;
    } else if (
      connectorResult.status ===
        'REVIEW_REQUIRED' ||
      connectorResult.status ===
        'INACCESSIBLE'
    ) {
      report.counts
        .connectorsReviewRequired += 1;
    } else {
      report.counts.connectorsFailed += 1;
    }

    console.log(
      [
        connectorId.padEnd(24),
        String(
          connectorResult.status
        ).padEnd(20),
        connectorResult.ok
          ? 'PASS'
          : 'REVIEW'
      ].join(' | ')
    );

    if (
      !connectorResult.ok &&
      !options.continueOnError
    ) {
      break;
    }
  }

  /*
   * Phase 6: final national summary.
   */
  report.completedAt = nowIso();

  const stateFailure = Object.values(
    report.states
  ).some(state => state.ok === false);

  const connectorFailure = Object.values(
    report.connectors
  ).some(connector => connector.ok === false);

  report.ok =
    !stateFailure &&
    !connectorFailure &&
    report.push.ok !== false &&
    report.registryRefresh.ok !== false;

  writeJsonAtomic(
    reportPath,
    report
  );

  console.log('');
  console.log('National build summary');
  console.log('----------------------');
  console.log(
    `States requested:       ${report.counts.statesRequested}`
  );
  console.log(
    `States available:       ${report.counts.statesAvailable}`
  );
  console.log(
    `Missing catalogs:       ${report.counts.statesMissingCatalog}`
  );
  console.log(
    `States built:           ${report.counts.statesBuilt}`
  );
  console.log(
    `Counties requested:     ${report.counts.countiesRequested}`
  );
  console.log(
    `Connectors discovered:  ${report.counts.connectorsDiscovered}`
  );
  console.log(
    `Connectors verified:    ${report.counts.connectorsVerified}`
  );
  console.log(
    `Connectors ready:       ${report.counts.connectorsReady}`
  );
  console.log(
    `Review required:        ${report.counts.connectorsReviewRequired}`
  );
  console.log(
    `Failed:                 ${report.counts.connectorsFailed}`
  );
  console.log(
    `Status:                 ${report.ok ? 'PASS' : 'REVIEW_REQUIRED'}`
  );
  console.log(
    `Report:                 ${path.relative(root, reportPath)}`
  );

  return {
    ok: report.ok,
    reportPath,
    counts: report.counts
  };
}
