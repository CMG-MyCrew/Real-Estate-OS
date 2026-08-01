import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(
    fs.readFileSync(filePath, 'utf8')
  );
}

function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));

  fs.writeFileSync(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

function countySlug(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-');
}

function connectorId(state, county) {
  return `${state}-${countySlug(county)}`;
}

function manifestPath(root, state, county) {
  return path.join(
    root,
    'config',
    'county-connectors',
    `${connectorId(state, county)}.json`
  );
}

function connectorPath(root, county) {
  const className = String(county || '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word =>
      word.charAt(0).toUpperCase() +
      word.slice(1)
    )
    .join('');

  return path.join(
    root,
    'src',
    'connectors',
    'generated',
    `${className}CountyConnector.gs`
  );
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

function runTerminalSync(
  root,
  payload,
  inherit = false
) {
  return runCommand({
    root,
    command: 'npx',
    args: [
      'clasp',
      'run',
      'REOS_COUNTY_TERMINAL_SYNC',
      '--params',
      JSON.stringify([payload])
    ],
    inherit
  });
}

function isExistingConnector(
  root,
  state,
  county
) {
  return (
    fs.existsSync(
      manifestPath(root, state, county)
    ) &&
    fs.existsSync(
      connectorPath(root, county)
    )
  );
}

function parseSyncResult(output) {
  const text = String(output || '');

  const readNumber = label => {
    const match = text.match(
      new RegExp(`${label}:\\s*(\\d+)`)
    );

    return match
      ? Number(match[1])
      : null;
  };

  return {
    ok:
      text.includes('ok: true') &&
      !text.includes('Exception:') &&
      !text.includes('ok: false'),
    fetched: readNumber('fetched'),
    valid: readNumber('valid'),
    failed: readNumber('failed'),
    skipped: readNumber('skipped'),
    inserted: readNumber('inserted'),
    updated: readNumber('updated')
  };
}

function printStateHeader(stateConfig) {
  console.log('');
  console.log('REOS State Build Pipeline');
  console.log('=========================');
  console.log(
    `State:    ${stateConfig.name} ` +
    `(${stateConfig.state})`
  );
  console.log(
    `Counties: ${stateConfig.counties.length}`
  );
  console.log('');
}

function printCountyResult(countyResult) {
  console.log(
    [
      countyResult.county.padEnd(20),
      countyResult.status.padEnd(18),
      countyResult.connectorId
    ].join(' | ')
  );
}

export async function runStateBuildPipeline(options) {
  const root = options.root || process.cwd();

  const state = String(options.state || '')
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error(
      'State builder requires a two-letter state code.'
    );
  }

  const stateConfigPath = path.join(
    root,
    'config',
    'states',
    `${state}.json`
  );

  if (!fs.existsSync(stateConfigPath)) {
    throw new Error(
      `State catalog not found: ` +
      `${path.relative(root, stateConfigPath)}`
    );
  }

  const stateConfig = readJson(stateConfigPath);

  const requestedCounties =
    Array.isArray(options.counties) &&
    options.counties.length
      ? options.counties
      : stateConfig.counties;

  const reportsDirectory = path.join(
    root,
    'reports',
    'state-build',
    state
  );

  ensureDirectory(reportsDirectory);

  const buildId =
    `SBP-${state}-${Date.now()}-` +
    `${Math.floor(Math.random() * 10000)}`;

  const reportPath = path.join(
    reportsDirectory,
    'build-report.json'
  );

  const report = {
    schemaVersion: '1.0.0',
    buildId,
    state,
    stateName: stateConfig.name,
    mode: options.execute
      ? 'EXECUTE'
      : 'PLAN_ONLY',
    startedAt: new Date().toISOString(),
    completedAt: '',
    datasets: options.datasets,
    countiesRequested:
      requestedCounties.length,
    counts: {
      planned: 0,
      skippedExisting: 0,
      generated: 0,
      passed: 0,
      reviewRequired: 0,
      failed: 0
    },
    counties: [],
    push: {
      requested: options.push === true,
      attempted: false,
      ok: null
    },
    ok: false
  };

  printStateHeader(stateConfig);

  /*
   * Phase 1: plan the entire state.
   */
  const queue = [];

  for (const county of requestedCounties) {
    const id = connectorId(state, county);
    const exists = isExistingConnector(
      root,
      state,
      county
    );

    const countyResult = {
      county,
      connectorId: id,
      existedBeforeBuild: exists,
      status: '',
      buildReport: '',
      syncs: [],
      ok: null
    };

    if (
      exists &&
      options.rebuild !== true
    ) {
      countyResult.status =
        'SKIPPED_EXISTING';

      countyResult.ok = true;

      report.counts.skippedExisting += 1;
      report.counties.push(countyResult);

      printCountyResult(countyResult);
      continue;
    }

    countyResult.status = options.execute
      ? 'QUEUED'
      : 'PLANNED';

    report.counts.planned += 1;
    report.counties.push(countyResult);

    queue.push({
      county,
      connectorId: id,
      result: countyResult
    });

    printCountyResult(countyResult);
  }

  if (!options.execute) {
    report.completedAt =
      new Date().toISOString();

    report.ok = true;

    writeJson(reportPath, report);

    console.log('');
    console.log('State build plan complete.');
    console.log(
      `Report: ${path.relative(root, reportPath)}`
    );

    return {
      ok: true,
      planOnly: true,
      reportPath
    };
  }

  /*
   * Phase 2: build counties locally.
   *
   * County builds do not push or terminal-test yet.
   * The state pipeline performs one push after all
   * local manifests/connectors are generated.
   */
  for (const item of queue) {
    console.log('');
    console.log(
      `===== Building ${item.county} County =====`
    );

    const args = [
      'county:build',
      '--state',
      state,
      '--county',
      item.county,
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

    if (options.continueOnError) {
      args.push('--continue-on-error');
    }

    if (options.replaceMappings) {
      args.push('--replace-mappings');
    }

    if (options.noFilter) {
      args.push('--no-filter');
    }

    const build = runReos(
      root,
      args,
      true
    );

    item.result.buildReport = path.join(
      'reports',
      'county-build',
      item.connectorId,
      'build-report.json'
    );

    if (!build.ok) {
      item.result.status = 'BUILD_FAILED';
      item.result.ok = false;
      report.counts.failed += 1;

      if (!options.continueOnError) {
        break;
      }

      continue;
    }

    item.result.status = 'GENERATED';
    item.result.ok = true;
    report.counts.generated += 1;
  }

  const buildFailure = report.counties.some(
    county => county.status === 'BUILD_FAILED'
  );

  if (
    buildFailure &&
    !options.continueOnError
  ) {
    report.completedAt =
      new Date().toISOString();

    report.ok = false;

    writeJson(reportPath, report);

    return {
      ok: false,
      reportPath,
      message:
        'State build stopped after a county build failure.'
    };
  }

  /*
   * Phase 3: push once.
   */
  if (options.push) {
    console.log('');
    console.log('===== Pushing state build =====');

    report.push.attempted = true;

    const push = runClaspPush(root);

    report.push.ok = push.ok;

    if (!push.ok) {
      report.completedAt =
        new Date().toISOString();

      report.ok = false;

      writeJson(reportPath, report);

      throw new Error(
        'State-level clasp push failed.'
      );
    }
  }

  /*
   * Phase 4: configure endpoints and dry-test.
   *
   * County manifests are read after generation so the
   * state builder uses their authoritative dataset list.
   */
  for (const item of queue) {
    if (
      item.result.status !== 'GENERATED'
    ) {
      continue;
    }

    const countyManifestPath = manifestPath(
      root,
      state,
      item.county
    );

    if (!fs.existsSync(countyManifestPath)) {
      item.result.status =
        'MANIFEST_MISSING';

      item.result.ok = false;
      report.counts.failed += 1;

      if (!options.continueOnError) {
        break;
      }

      continue;
    }

    const manifest = readJson(
      countyManifestPath
    );

    const datasets = Object.entries(
      manifest.datasets || {}
    );

    for (const [dataset, definition] of datasets) {
      const endpoint = String(
        definition.endpoint ||
        definition.discovery?.endpoint ||
        ''
      ).trim();

      if (!endpoint) {
        item.result.syncs.push({
          dataset,
          status: 'ENDPOINT_MISSING',
          ok: false
        });

        item.result.ok = false;

        if (!options.continueOnError) {
          break;
        }

        continue;
      }

      console.log('');
      console.log(
        `Configuring ${item.connectorId}/${dataset}`
      );

      const configure = runTerminalSync(
        root,
        {
          action: 'configure-endpoint',
          connectorId: item.connectorId,
          dataset,
          endpoint
        },
        true
      );

      if (!configure.ok) {
        item.result.syncs.push({
          dataset,
          status:
            'CONFIGURATION_FAILED',
          ok: false
        });

        item.result.ok = false;

        if (!options.continueOnError) {
          break;
        }

        continue;
      }

      if (!options.test) {
        item.result.syncs.push({
          dataset,
          status: 'CONFIGURED',
          ok: true
        });

        continue;
      }

      console.log(
        `Testing ${item.connectorId}/${dataset}`
      );

      const sync = runTerminalSync(
        root,
        {
          action: 'sync',
          connectorId: item.connectorId,
          dataset,
          limit: options.testLimit,
          dryRun: true
        },
        false
      );

      const output = [
        sync.stdout,
        sync.stderr
      ].join('\n');

      if (sync.stdout) {
        console.log(sync.stdout);
      }

      if (sync.stderr) {
        console.error(sync.stderr);
      }

      const parsed = parseSyncResult(output);

      const syncOk =
        sync.ok &&
        parsed.ok &&
        parsed.failed === 0;

      item.result.syncs.push({
        dataset,
        status: syncOk
          ? 'PASS'
          : 'REVIEW_REQUIRED',
        ok: syncOk,
        stats: parsed,
        output: output.slice(0, 10000)
      });

      if (!syncOk) {
        item.result.ok = false;

        if (!options.continueOnError) {
          break;
        }
      }
    }

    const allSyncsPass =
      item.result.syncs.length > 0 &&
      item.result.syncs.every(
        sync => sync.ok === true
      );

    if (allSyncsPass) {
      item.result.status = options.test
        ? 'PASS'
        : 'CONFIGURED';

      item.result.ok = true;
      report.counts.passed += 1;
    } else {
      item.result.status =
        'REVIEW_REQUIRED';

      item.result.ok = false;
      report.counts.reviewRequired += 1;
    }

    printCountyResult(item.result);
  }

  report.completedAt =
    new Date().toISOString();

  report.ok =
    report.counties.every(county =>
      county.ok !== false
    ) &&
    report.push.ok !== false;

  writeJson(reportPath, report);

  console.log('');
  console.log('State build summary');
  console.log('-------------------');
  console.log(`State:      ${state}`);
  console.log(
    `Requested:  ${report.countiesRequested}`
  );
  console.log(
    `Existing:   ${report.counts.skippedExisting}`
  );
  console.log(
    `Generated:  ${report.counts.generated}`
  );
  console.log(
    `Passed:     ${report.counts.passed}`
  );
  console.log(
    `Review:     ${report.counts.reviewRequired}`
  );
  console.log(
    `Failed:     ${report.counts.failed}`
  );
  console.log(
    `Status:     ${report.ok ? 'PASS' : 'REVIEW_REQUIRED'}`
  );
  console.log(
    `Report:     ${path.relative(root, reportPath)}`
  );

  return {
    ok: report.ok,
    state,
    reportPath,
    counts: report.counts
  };
}
