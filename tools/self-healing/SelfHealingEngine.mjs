import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HEALTHY_STATUSES = new Set([
  'READY',
  'PRODUCTION',
  'DISABLED'
]);

function nowIso() {
  return new Date().toISOString();
}

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

function runTerminal(
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

  return match
    ? match[1] === 'true'
    : null;
}

function terminalLogicalSuccess(result) {
  const output = [
    result.stdout,
    result.stderr
  ].join('\n');

  return (
    result.ok &&
    parseBoolean(output, 'ok') !== false &&
    !output.includes('Exception:') &&
    !output.includes('ok: false')
  );
}

function parseDrySync(result) {
  const output = [
    result.stdout,
    result.stderr
  ].join('\n');

  const failed = parseNumber(
    output,
    'failed'
  );

  return {
    ok:
      terminalLogicalSuccess(result) &&
      failed === 0,
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

function registryPath(root) {
  return path.join(
    root,
    'config',
    'county-registry',
    'registry.json'
  );
}

function manifestPath(root, connectorId) {
  return path.join(
    root,
    'config',
    'county-connectors',
    `${connectorId}.json`
  );
}

function reportDirectory(root, connectorId) {
  return path.join(
    root,
    'reports',
    'self-healing',
    connectorId
  );
}

function isEndpointHealthy(datasetEntry) {
  return (
    Boolean(datasetEntry.endpoint) &&
    datasetEntry.health?.ok !== false
  );
}

function schemaRequiresReview(datasetEntry) {
  return (
    datasetEntry.schemaDrift
      ?.requiresReview === true
  );
}

function diagnosisForDataset(datasetEntry) {
  if (datasetEntry.enabled === false) {
    return {
      action: 'NONE',
      reason: 'Dataset is intentionally disabled.'
    };
  }

  if (!datasetEntry.endpoint) {
    return {
      action: 'REDISCOVER_ENDPOINT',
      reason: 'Enabled dataset has no endpoint.'
    };
  }

  if (
    datasetEntry.health &&
    datasetEntry.health.ok === false
  ) {
    return {
      action: 'REDISCOVER_ENDPOINT',
      reason: 'Current endpoint failed health verification.'
    };
  }

  if (
    datasetEntry.mapping
      ?.requiredFieldsPresent === false
  ) {
    return {
      action: 'REMAP_CURRENT_ENDPOINT',
      reason: 'Required mappings are missing.'
    };
  }

  if (schemaRequiresReview(datasetEntry)) {
    return {
      action: 'REMAP_CURRENT_ENDPOINT',
      reason: 'High-severity schema drift was detected.'
    };
  }

  if (
    datasetEntry.lastDrySync &&
    datasetEntry.lastDrySync.ok === false
  ) {
    return {
      action: 'REMAP_CURRENT_ENDPOINT',
      reason: 'The latest dry sync failed.'
    };
  }

  if (
    datasetEntry.status ===
      'REVIEW_REQUIRED' ||
    datasetEntry.status === 'ERROR'
  ) {
    return {
      action: isEndpointHealthy(datasetEntry)
        ? 'REMAP_CURRENT_ENDPOINT'
        : 'REDISCOVER_ENDPOINT',
      reason:
        `Dataset registry status is ${datasetEntry.status}.`
    };
  }

  return {
    action: 'NONE',
    reason: 'Dataset is healthy.'
  };
}

function buildRepairPlan(entry, options) {
  const datasets = [];

  for (
    const datasetEntry
    of Object.values(entry.datasets || {})
  ) {
    const diagnosis =
      diagnosisForDataset(datasetEntry);

    if (
      options.dataset &&
      datasetEntry.dataset !== options.dataset
    ) {
      continue;
    }

    if (
      diagnosis.action === 'NONE' &&
      options.forceRemap === true &&
      datasetEntry.enabled !== false
    ) {
      diagnosis.action =
        'REMAP_CURRENT_ENDPOINT';

      diagnosis.reason =
        'Forced remapping requested.';
    }

    datasets.push({
      dataset: datasetEntry.dataset,
      enabled: datasetEntry.enabled !== false,
      adapter: datasetEntry.adapter,
      endpoint: datasetEntry.endpoint || '',
      currentStatus: datasetEntry.status,
      diagnosis
    });
  }

  return {
    connectorId: entry.connectorId,
    state: entry.state,
    county: entry.county,
    connectorStatus: entry.status,
    datasets,
    repairCount: datasets.filter(
      dataset =>
        dataset.diagnosis.action !== 'NONE'
    ).length
  };
}

function discoveryPlanPath(
  root,
  state,
  county
) {
  const countySlug = String(county)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-');

  return path.join(
    root,
    'reports',
    'self-healing',
    `${state}-${countySlug}-DISCOVERY.json`
  );
}

function discoverReplacement({
  root,
  entry,
  dataset,
  results,
  healthLimit
}) {
  const outputPath = discoveryPlanPath(
    root,
    entry.state,
    entry.county
  );

  const command = runReos(
    root,
    [
      'county:discover-all',
      '--state',
      entry.state,
      '--county',
      entry.county,
      '--datasets',
      dataset,
      '--health',
      '--health-limit',
      String(healthLimit),
      '--results',
      String(results),
      '--output',
      path.relative(root, outputPath)
    ],
    true
  );

  if (!command.ok) {
    return {
      ok: false,
      error: 'Automatic discovery command failed.'
    };
  }

  const discovery = readJson(
    outputPath,
    null
  );

  const selection =
    discovery?.selections?.[dataset];

  const candidate =
    selection?.selected || null;

  if (!candidate) {
    return {
      ok: false,
      error:
        'No eligible replacement endpoint was discovered.',
      report:
        path.relative(root, outputPath)
    };
  }

  const automatic =
    candidate.automaticDiscovery || {};

  if (
    automatic.eligible !== true ||
    candidate.health?.ok !== true
  ) {
    return {
      ok: false,
      error:
        'Replacement candidate did not pass eligibility and health gates.',
      candidate,
      report:
        path.relative(root, outputPath)
    };
  }

  if (
    candidate.adapter === 'arcgis' &&
    !/\/(?:FeatureServer|MapServer)\/\d+\/query$/i
      .test(String(candidate.endpoint || ''))
  ) {
    return {
      ok: false,
      error:
        'ArcGIS replacement is not a numbered query layer.',
      candidate,
      report:
        path.relative(root, outputPath)
    };
  }

  return {
    ok: true,
    candidate,
    report:
      path.relative(root, outputPath)
  };
}

function createPromotionInput({
  root,
  entry,
  dataset,
  candidate
}) {
  const outputPath = path.join(
    reportDirectory(root, entry.connectorId),
    `${dataset}-promotion-input.json`
  );

  writeJsonAtomic(
    outputPath,
    {
      schemaVersion: '1.0.0',
      generatedAt: nowIso(),
      locality: {
        state: entry.state,
        county: entry.county
      },
      candidateCount: 1,
      results: [candidate]
    }
  );

  return outputPath;
}

function promoteReplacement({
  root,
  entry,
  dataset,
  candidate
}) {
  const promotionInput =
    createPromotionInput({
      root,
      entry,
      dataset,
      candidate
    });

  return runReos(
    root,
    [
      'county:promote',
      '--report',
      path.relative(root, promotionInput),
      '--candidate',
      '1',
      '--dataset',
      dataset,
      '--replace',
      '--force'
    ],
    true
  );
}

function applyAutomaticMapping({
  root,
  entry,
  dataset,
  endpoint,
  samples,
  replaceMappings
}) {
  const args = [
    'county:automap',
    '--connector',
    entry.connectorId,
    '--dataset',
    dataset,
    '--endpoint',
    endpoint,
    '--samples',
    String(samples),
    '--apply'
  ];

  if (replaceMappings) {
    args.push('--replace');
  }

  return runReos(
    root,
    args,
    true
  );
}

function regenerateConnector(
  root,
  connectorId
) {
  return runReos(
    root,
    [
      'county:regenerate',
      '--connector',
      connectorId
    ],
    true
  );
}

function configureEndpoint({
  root,
  connectorId,
  dataset,
  endpoint
}) {
  return runTerminal(
    root,
    {
      action: 'configure-endpoint',
      connectorId,
      dataset,
      endpoint
    },
    false
  );
}

function testRepair({
  root,
  connectorId,
  dataset,
  limit
}) {
  return parseDrySync(
    runTerminal(
      root,
      {
        action: 'sync',
        connectorId,
        dataset,
        limit,
        dryRun: true
      },
      false
    )
  );
}

function stage(name, details = {}) {
  return {
    name,
    startedAt: nowIso(),
    completedAt: '',
    ok: null,
    ...details
  };
}

function finishStage(
  value,
  ok,
  details = {}
) {
  value.completedAt = nowIso();
  value.ok = ok;

  Object.assign(value, details);

  return value;
}

export function loadRegistryEntry(
  root,
  connectorId
) {
  const registry = readJson(
    registryPath(root),
    null
  );

  return (
    registry?.connectors?.[
      String(connectorId)
        .trim()
        .toUpperCase()
    ] || null
  );
}

export function planConnectorRepair(
  options = {}
) {
  const root = options.root || process.cwd();

  const entry = loadRegistryEntry(
    root,
    options.connectorId
  );

  if (!entry) {
    throw new Error(
      `Registry entry not found: ${options.connectorId}`
    );
  }

  return {
    generatedAt: nowIso(),
    mode: 'PLAN_ONLY',
    plan: buildRepairPlan(
      entry,
      options
    )
  };
}

export async function healConnector(
  options = {}
) {
  const root = options.root || process.cwd();

  const entry = loadRegistryEntry(
    root,
    options.connectorId
  );

  if (!entry) {
    throw new Error(
      `Registry entry not found: ${options.connectorId}`
    );
  }

  if (entry.implementation !== 'generated') {
    throw new Error(
      'Automatic repair currently supports generated connectors only.'
    );
  }

  if (!fs.existsSync(
    manifestPath(root, entry.connectorId)
  )) {
    throw new Error(
      `Manifest not found for ${entry.connectorId}.`
    );
  }

  const plan = buildRepairPlan(
    entry,
    options
  );

  const outputDirectory = reportDirectory(
    root,
    entry.connectorId
  );

  ensureDirectory(outputDirectory);

  const reportPath = path.join(
    outputDirectory,
    'repair-report.json'
  );

  const report = {
    schemaVersion: '1.0.0',
    repairId:
      `SHR-${Date.now()}-` +
      `${Math.floor(Math.random() * 10000)}`,
    startedAt: nowIso(),
    completedAt: '',
    connectorId: entry.connectorId,
    mode: options.execute
      ? 'EXECUTE'
      : 'PLAN_ONLY',
    initialStatus: entry.status,
    plan,
    datasets: {},
    deployment: {
      requested: options.push === true,
      attempted: false,
      ok: null
    },
    finalRegistryStatus: '',
    ok: false
  };

  if (!options.execute) {
    report.completedAt = nowIso();
    report.ok = true;

    writeJsonAtomic(
      reportPath,
      report
    );

    return {
      ok: true,
      planOnly: true,
      reportPath,
      plan
    };
  }

  let localChangesMade = false;

  for (const item of plan.datasets) {
    const datasetReport = {
      dataset: item.dataset,
      initialStatus: item.currentStatus,
      diagnosis: item.diagnosis,
      originalEndpoint: item.endpoint,
      repairedEndpoint: item.endpoint,
      stages: [],
      ok: true
    };

    report.datasets[item.dataset] =
      datasetReport;

    if (
      item.diagnosis.action === 'NONE'
    ) {
      datasetReport.skipped = true;
      continue;
    }

    if (
      item.diagnosis.action ===
      'REDISCOVER_ENDPOINT'
    ) {
      if (
        options.allowEndpointReplacement !== true
      ) {
        datasetReport.ok = false;
        datasetReport.manualReviewRequired = true;
        datasetReport.message =
          'Endpoint replacement requires --allow-endpoint-replacement.';

        if (!options.continueOnError) {
          break;
        }

        continue;
      }

      const discoveryStage =
        stage('rediscover-endpoint');

      datasetReport.stages.push(
        discoveryStage
      );

      const discovery =
        discoverReplacement({
          root,
          entry,
          dataset: item.dataset,
          results: options.results,
          healthLimit:
            options.healthLimit
        });

      finishStage(
        discoveryStage,
        discovery.ok,
        {
          report: discovery.report || '',
          error: discovery.error || '',
          candidate:
            discovery.candidate || null
        }
      );

      if (!discovery.ok) {
        datasetReport.ok = false;

        if (!options.continueOnError) {
          break;
        }

        continue;
      }

      const promotionStage =
        stage('promote-replacement');

      datasetReport.stages.push(
        promotionStage
      );

      const promotion =
        promoteReplacement({
          root,
          entry,
          dataset: item.dataset,
          candidate:
            discovery.candidate
        });

      finishStage(
        promotionStage,
        promotion.ok,
        {
          exitCode:
            promotion.exitCode
        }
      );

      if (!promotion.ok) {
        datasetReport.ok = false;

        if (!options.continueOnError) {
          break;
        }

        continue;
      }

      datasetReport.repairedEndpoint =
        discovery.candidate.endpoint;

      localChangesMade = true;
    }

    const mappingStage =
      stage('automatic-remapping');

    datasetReport.stages.push(
      mappingStage
    );

    const mapping =
      applyAutomaticMapping({
        root,
        entry,
        dataset: item.dataset,
        endpoint:
          datasetReport.repairedEndpoint,
        samples: options.samples,
        replaceMappings:
          options.replaceMappings
      });

    finishStage(
      mappingStage,
      mapping.ok,
      {
        exitCode: mapping.exitCode
      }
    );

    if (!mapping.ok) {
      datasetReport.ok = false;

      if (!options.continueOnError) {
        break;
      }

      continue;
    }

    localChangesMade = true;
  }

  const localFailure =
    Object.values(report.datasets)
      .some(dataset => dataset.ok === false);

  if (
    localFailure &&
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
        'Self-healing stopped before deployment.'
    };
  }

  if (localChangesMade) {
    const regenerationStage =
      stage('regenerate');

    report.regeneration =
      regenerationStage;

    const regeneration =
      regenerateConnector(
        root,
        entry.connectorId
      );

    finishStage(
      regenerationStage,
      regeneration.ok,
      {
        exitCode:
          regeneration.exitCode
      }
    );

    if (!regeneration.ok) {
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
          'Connector regeneration failed.'
      };
    }
  }

  if (options.push && localChangesMade) {
    report.deployment.attempted = true;

    const push = runCommand({
      root,
      command: 'npx',
      args: ['clasp', 'push'],
      inherit: true
    });

    report.deployment.ok = push.ok;

    if (!push.ok) {
      report.completedAt = nowIso();
      report.ok = false;

      writeJsonAtomic(
        reportPath,
        report
      );

      return {
        ok: false,
        reportPath,
        message: 'clasp push failed.'
      };
    }
  }

  for (
    const datasetReport
    of Object.values(report.datasets)
  ) {
    if (
      datasetReport.skipped ||
      datasetReport.ok === false
    ) {
      continue;
    }

    if (options.configure !== false) {
      const configureStage =
        stage('configure-endpoint');

      datasetReport.stages.push(
        configureStage
      );

      const configured =
        configureEndpoint({
          root,
          connectorId:
            entry.connectorId,
          dataset:
            datasetReport.dataset,
          endpoint:
            datasetReport.repairedEndpoint
        });

      const configureOk =
        terminalLogicalSuccess(
          configured
        );

      finishStage(
        configureStage,
        configureOk,
        {
          output: [
            configured.stdout,
            configured.stderr
          ].join('\n').slice(0, 5000)
        }
      );

      if (!configureOk) {
        datasetReport.ok = false;

        if (!options.continueOnError) {
          break;
        }

        continue;
      }
    }

    if (options.test !== false) {
      const testStage =
        stage('terminal-dry-sync');

      datasetReport.stages.push(
        testStage
      );

      const test = testRepair({
        root,
        connectorId:
          entry.connectorId,
        dataset:
          datasetReport.dataset,
        limit:
          options.testLimit
      });

      finishStage(
        testStage,
        test.ok,
        {
          stats: test.stats,
          output: test.output
        }
      );

      datasetReport.ok = test.ok;

      if (
        !test.ok &&
        !options.continueOnError
      ) {
        break;
      }
    }
  }

  const registryRefresh = runReos(
    root,
    ['county:registry-refresh'],
    true
  );

  const registryUpdate = runReos(
    root,
    [
      'county:registry-update',
      '--connector',
      entry.connectorId,
      '--health',
      '--test',
      '--limit',
      String(options.testLimit)
    ],
    false
  );

  if (registryUpdate.stdout) {
    console.log(registryUpdate.stdout);
  }

  if (registryUpdate.stderr) {
    console.error(registryUpdate.stderr);
  }

  const finalEntry = loadRegistryEntry(
    root,
    entry.connectorId
  );

  report.completedAt = nowIso();
  report.finalRegistryStatus =
    finalEntry?.status || '';

  report.ok =
    registryRefresh.ok &&
    registryUpdate.ok &&
    HEALTHY_STATUSES.has(
      report.finalRegistryStatus
    ) &&
    Object.values(report.datasets)
      .every(dataset =>
        dataset.ok !== false
      );

  writeJsonAtomic(
    reportPath,
    report
  );

  return {
    ok: report.ok,
    connectorId:
      entry.connectorId,
    finalStatus:
      report.finalRegistryStatus,
    reportPath
  };
}

export async function healAllConnectors(
  options = {}
) {
  const root = options.root || process.cwd();

  const registry = readJson(
    registryPath(root),
    null
  );

  const connectorIds = Object.values(
    registry?.connectors || {}
  )
    .filter(entry =>
      entry.implementation === 'generated'
    )
    .filter(entry => {
      if (options.state) {
        return (
          entry.state ===
          String(options.state).toUpperCase()
        );
      }

      return true;
    })
    .filter(entry => {
      return (
        options.forceRemap === true ||
        !HEALTHY_STATUSES.has(entry.status)
      );
    })
    .map(entry => entry.connectorId)
    .sort();

  const results = [];

  for (const connectorId of connectorIds) {
    try {
      const result = await healConnector({
        ...options,
        connectorId
      });

      results.push(result);

      if (
        !result.ok &&
        !options.continueOnError
      ) {
        break;
      }
    } catch (error) {
      results.push({
        connectorId,
        ok: false,
        error: error.message
      });

      if (!options.continueOnError) {
        break;
      }
    }
  }

  const summary = {
    checkedAt: nowIso(),
    connectorCount:
      results.length,
    passed:
      results.filter(result => result.ok).length,
    failed:
      results.filter(result => !result.ok).length,
    results
  };

  const outputPath = path.join(
    root,
    'reports',
    'self-healing',
    'summary.json'
  );

  writeJsonAtomic(
    outputPath,
    summary
  );

  return {
    ...summary,
    reportPath: outputPath
  };
}
