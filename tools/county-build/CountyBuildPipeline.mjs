import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const AUTOMAP_ADAPTERS = new Set([
  'arcgis',
  'socrata',
  'json-api',
  'csv'
]);

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDirectory(path.dirname(filePath));

  fs.writeFileSync(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function runClaspTerminal(root, payload, inherit = true) {
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

function countySlug(county) {
  return String(county || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-');
}

function connectorId(state, county) {
  return `${String(state).toUpperCase()}-${countySlug(county)}`;
}

function selectedDatasets(plan) {
  return Object.entries(plan.selections || {})
    .filter(([, selection]) => selection?.selected)
    .map(([dataset, selection]) => ({
      dataset,
      candidate: selection.selected
    }));
}

function createPromotionReport({
  plan,
  selected,
  reportPath
}) {
  const results = selected.map(item => item.candidate);

  writeJson(reportPath, {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    locality: plan.locality,
    sources: plan.sources,
    candidateCount: results.length,
    results
  });

  return selected.map((item, index) => ({
    ...item,
    candidateNumber: index + 1
  }));
}

function buildStage(name, details = {}) {
  return {
    name,
    startedAt: new Date().toISOString(),
    completedAt: '',
    ok: null,
    ...details
  };
}

function finishStage(stage, ok, details = {}) {
  stage.completedAt = new Date().toISOString();
  stage.ok = ok;

  Object.assign(stage, details);

  return stage;
}

function printHeader(state, county, connectorIdValue) {
  console.log('');
  console.log('REOS County Build Pipeline');
  console.log('==========================');
  console.log(`County:    ${county} County, ${state}`);
  console.log(`Connector: ${connectorIdValue}`);
  console.log('');
}

function printSelections(selected) {
  if (!selected.length) {
    console.log('No datasets met automatic selection thresholds.');
    return;
  }

  console.log('Selected datasets:');

  selected.forEach(item => {
    const score =
      item.candidate?.automaticDiscovery?.score ??
      item.candidate?.compatibility?.score ??
      0;

    console.log(
      [
        item.dataset,
        `score=${score}`,
        `adapter=${item.candidate.adapter}`,
        item.candidate.title
      ].join(' | ')
    );

    console.log(`  ${item.candidate.endpoint}`);
  });

  console.log('');
}

export async function runCountyBuildPipeline(options) {
  const root = options.root || process.cwd();
  const state = String(options.state || '').trim().toUpperCase();
  const county = String(options.county || '')
    .trim()
    .replace(/\s+County$/i, '');

  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error(
      'County build requires a two-letter state abbreviation.'
    );
  }

  if (!county) {
    throw new Error('County build requires a county name.');
  }

  const connectorIdValue = connectorId(state, county);
  const slug = countySlug(county);

  const reportsDirectory = path.join(
    root,
    'reports',
    'county-build',
    connectorIdValue
  );

  ensureDirectory(reportsDirectory);

  const discoveryPlanPath = path.join(
    root,
    'reports',
    'county-discovery',
    `${state}-${slug}-AUTOMATIC-DISCOVERY.json`
  );

  const promotionReportPath = path.join(
    reportsDirectory,
    'promotion-input.json'
  );

  const buildReportPath = path.join(
    reportsDirectory,
    'build-report.json'
  );

  const report = {
    schemaVersion: '1.0.0',
    buildId:
      `CBP-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    startedAt: new Date().toISOString(),
    completedAt: '',
    state,
    county,
    connectorId: connectorIdValue,
    mode: options.execute ? 'EXECUTE' : 'PLAN_ONLY',
    requestedDatasets: options.datasets,
    stages: [],
    datasets: {},
    ok: false
  };

  printHeader(state, county, connectorIdValue);

  /*
   * Stage 1: automatic discovery
   */
  const discoveryStage = buildStage('discovery');
  report.stages.push(discoveryStage);

  const discoveryArgs = [
    'county:discover-all',
    '--state',
    state,
    '--county',
    county,
    '--datasets',
    options.datasets.join(','),
    '--results',
    String(options.results),
    '--output',
    path.relative(root, discoveryPlanPath)
  ];

  if (options.health) {
    discoveryArgs.push(
      '--health',
      '--health-limit',
      String(options.healthLimit)
    );
  }

  const discoveryResult = runReos(
    root,
    discoveryArgs,
    true
  );

  if (!discoveryResult.ok) {
    finishStage(discoveryStage, false, {
      exitCode: discoveryResult.exitCode
    });

    report.completedAt = new Date().toISOString();
    writeJson(buildReportPath, report);

    throw new Error(
      'Automatic dataset discovery failed.'
    );
  }

  const plan = readJson(discoveryPlanPath);
  const selected = selectedDatasets(plan);

  finishStage(discoveryStage, true, {
    candidateCount: plan.candidateCount,
    selectedCount: selected.length,
    plan: path.relative(root, discoveryPlanPath)
  });

  printSelections(selected);

  if (!selected.length) {
    report.completedAt = new Date().toISOString();
    report.ok = false;
    writeJson(buildReportPath, report);

    return {
      ok: false,
      connectorId: connectorIdValue,
      reportPath: buildReportPath,
      message: 'No datasets met automatic selection thresholds.'
    };
  }

  if (!options.execute) {
    report.completedAt = new Date().toISOString();
    report.ok = true;
    report.message =
      'Plan created. Rerun with --execute after reviewing selections.';

    writeJson(buildReportPath, report);

    console.log(
      'PLAN_ONLY complete. Review the discovery plan before execution.'
    );

    return {
      ok: true,
      planOnly: true,
      connectorId: connectorIdValue,
      reportPath: buildReportPath
    };
  }

  const promotionCandidates = createPromotionReport({
    plan,
    selected,
    reportPath: promotionReportPath
  });

  /*
   * Stage 2: promote every selected dataset locally.
   */
  for (const item of promotionCandidates) {
    const datasetReport = {
      dataset: item.dataset,
      adapter: item.candidate.adapter,
      endpoint: item.candidate.endpoint,
      title: item.candidate.title,
      stages: []
    };

    report.datasets[item.dataset] = datasetReport;

    const promoteStage = buildStage('promote');
    datasetReport.stages.push(promoteStage);

    const promoteResult = runReos(
      root,
      [
        'county:promote',
        '--report',
        path.relative(root, promotionReportPath),
        '--candidate',
        String(item.candidateNumber),
        '--dataset',
        item.dataset,
        '--replace',
        '--force'
      ],
      true
    );

    finishStage(
      promoteStage,
      promoteResult.ok,
      {
        exitCode: promoteResult.exitCode
      }
    );

    if (!promoteResult.ok) {
      datasetReport.ok = false;

      if (!options.continueOnError) {
        break;
      }

      continue;
    }

    /*
     * Stage 3: automatic field mapping.
     */
    const automapStage = buildStage('automap');
    datasetReport.stages.push(automapStage);

    if (!AUTOMAP_ADAPTERS.has(item.candidate.adapter)) {
      finishStage(automapStage, true, {
        skipped: true,
        reason:
          `Automatic mapping does not support ${item.candidate.adapter}.`
      });
    } else {
      const automapArgs = [
        'county:automap',
        '--connector',
        connectorIdValue,
        '--dataset',
        item.dataset,
        '--endpoint',
        item.candidate.endpoint,
        '--samples',
        String(options.samples),
        '--apply'
      ];

      if (options.replaceMappings) {
        automapArgs.push('--replace');
      }

      if (options.noFilter) {
        automapArgs.push('--no-filter');
      }

      const automapResult = runReos(
        root,
        automapArgs,
        true
      );

      finishStage(
        automapStage,
        automapResult.ok,
        {
          exitCode: automapResult.exitCode
        }
      );

      if (
        !automapResult.ok &&
        !options.continueOnError
      ) {
        datasetReport.ok = false;
        break;
      }
    }

    datasetReport.ok = datasetReport.stages.every(
      stage => stage.ok !== false
    );
  }

  const failedBeforePush = Object.values(report.datasets)
    .some(dataset => dataset.ok === false);

  if (failedBeforePush && !options.continueOnError) {
    report.completedAt = new Date().toISOString();
    report.ok = false;
    writeJson(buildReportPath, report);

    return {
      ok: false,
      connectorId: connectorIdValue,
      reportPath: buildReportPath,
      message: 'Pipeline stopped before deployment.'
    };
  }

  /*
   * Stage 4: regenerate once more from the completed manifest.
   */
  const regenerateStage = buildStage('regenerate');
  report.stages.push(regenerateStage);

  const regenerateResult = runReos(
    root,
    [
      'county:regenerate',
      '--connector',
      connectorIdValue
    ],
    true
  );

  finishStage(
    regenerateStage,
    regenerateResult.ok,
    {
      exitCode: regenerateResult.exitCode
    }
  );

  if (!regenerateResult.ok) {
    report.completedAt = new Date().toISOString();
    writeJson(buildReportPath, report);

    throw new Error('Connector regeneration failed.');
  }

  /*
   * Stage 5: push once after all local generation is complete.
   */
  if (options.push) {
    const pushStage = buildStage('push');
    report.stages.push(pushStage);

    const pushResult = runCommand({
      root,
      command: 'npx',
      args: ['clasp', 'push'],
      inherit: true
    });

    finishStage(
      pushStage,
      pushResult.ok,
      {
        exitCode: pushResult.exitCode
      }
    );

    if (!pushResult.ok) {
      report.completedAt = new Date().toISOString();
      writeJson(buildReportPath, report);

      throw new Error('clasp push failed.');
    }
  }

  /*
   * Stage 6: configure endpoints through Apps Script terminal sync.
   */
  if (options.configure) {
    for (const item of promotionCandidates) {
      const datasetReport = report.datasets[item.dataset];

      if (!datasetReport || datasetReport.ok === false) {
        continue;
      }

      const configureStage = buildStage('configure-endpoint');
      datasetReport.stages.push(configureStage);

      const configureResult = runClaspTerminal(
        root,
        {
          action: 'configure-endpoint',
          connectorId: connectorIdValue,
          dataset: item.dataset,
          endpoint: item.candidate.endpoint
        },
        true
      );

      finishStage(
        configureStage,
        configureResult.ok,
        {
          exitCode: configureResult.exitCode
        }
      );

      if (
        !configureResult.ok &&
        !options.continueOnError
      ) {
        datasetReport.ok = false;
        break;
      }
    }
  }

  /*
   * Stage 7: dataset-specific terminal dry syncs.
   */
  if (options.test) {
    for (const item of promotionCandidates) {
      const datasetReport = report.datasets[item.dataset];

      if (!datasetReport || datasetReport.ok === false) {
        continue;
      }

      const testStage = buildStage('dry-sync');
      datasetReport.stages.push(testStage);

      const testResult = runClaspTerminal(
        root,
        {
          action: 'sync',
          connectorId: connectorIdValue,
          dataset: item.dataset,
          limit: options.testLimit,
          dryRun: true
        },
        false
      );

      const combinedOutput = [
        testResult.stdout,
        testResult.stderr
      ].join('\n');

      const logicalFailure =
        combinedOutput.includes('ok: false') ||
        combinedOutput.includes('Exception:') ||
        /failed:\s*[1-9]\d*/.test(combinedOutput);

      if (testResult.stdout) {
        console.log(testResult.stdout);
      }

      if (testResult.stderr) {
        console.error(testResult.stderr);
      }

      finishStage(
        testStage,
        testResult.ok && !logicalFailure,
        {
          exitCode: testResult.exitCode,
          output: combinedOutput.slice(0, 10000)
        }
      );

      datasetReport.ok = datasetReport.stages.every(
        stage => stage.ok !== false
      );

      if (
        !datasetReport.ok &&
        !options.continueOnError
      ) {
        break;
      }
    }
  }

  /*
   * Stage 8: final summary.
   */
  report.completedAt = new Date().toISOString();

  report.ok =
    report.stages.every(stage => stage.ok !== false) &&
    Object.values(report.datasets).every(
      dataset => dataset.ok !== false
    );

  writeJson(buildReportPath, report);

  console.log('');
  console.log('County build summary');
  console.log('--------------------');
  console.log(`Connector: ${connectorIdValue}`);
  console.log(`Status:    ${report.ok ? 'PASS' : 'REVIEW_REQUIRED'}`);
  console.log(
    `Report:    ${path.relative(root, buildReportPath)}`
  );

  return {
    ok: report.ok,
    connectorId: connectorIdValue,
    reportPath: buildReportPath,
    datasets: Object.keys(report.datasets)
  };
}
