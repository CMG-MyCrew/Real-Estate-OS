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

function registryPath(root) {
  return path.join(
    root,
    'config',
    'county-registry',
    'registry.json'
  );
}

function maintenanceReportPath(root) {
  return path.join(
    root,
    'reports',
    'autonomous-maintenance',
    'maintenance-report.json'
  );
}

function loadRegistry(root) {
  return readJson(
    registryPath(root),
    {
      connectors: {}
    }
  );
}

function generatedConnectorEntries(
  registry,
  state
) {
  return Object.values(
    registry.connectors || {}
  )
    .filter(entry => {
      return (
        entry.implementation === 'generated' &&
        entry.enabled !== false
      );
    })
    .filter(entry => {
      if (!state) {
        return true;
      }

      return (
        entry.state ===
        String(state).trim().toUpperCase()
      );
    })
    .sort((left, right) =>
      left.connectorId.localeCompare(
        right.connectorId
      )
    );
}

function connectorNeedsRepair(entry) {
  if (!HEALTHY_STATUSES.has(entry.status)) {
    return true;
  }

  return Object.values(
    entry.datasets || {}
  ).some(dataset => {
    if (dataset.enabled === false) {
      return false;
    }

    return (
      dataset.status === 'ERROR' ||
      dataset.status === 'INACCESSIBLE' ||
      dataset.status === 'REVIEW_REQUIRED' ||
      dataset.health?.ok === false ||
      dataset.lastDrySync?.ok === false ||
      dataset.mapping
        ?.requiredFieldsPresent === false ||
      dataset.schemaDrift
        ?.requiresReview === true
    );
  });
}

function connectorNeedsDriftScan(entry) {
  return Object.values(
    entry.datasets || {}
  ).some(dataset => {
    return (
      dataset.enabled !== false &&
      Boolean(dataset.endpoint)
    );
  });
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

function printConnectorLine(result) {
  console.log(
    [
      result.connectorId.padEnd(24),
      String(result.initialStatus || '')
        .padEnd(18),
      String(result.finalStatus || '')
        .padEnd(18),
      result.ok ? 'PASS' : 'REVIEW'
    ].join(' | ')
  );
}

export async function runAutonomousMaintenance(
  options = {}
) {
  const root = options.root || process.cwd();

  const reportPath =
    maintenanceReportPath(root);

  const report = {
    schemaVersion: '1.0.0',
    maintenanceId:
      `AME-${Date.now()}-` +
      `${Math.floor(Math.random() * 10000)}`,
    startedAt: nowIso(),
    completedAt: '',
    mode: options.execute
      ? 'EXECUTE'
      : 'PLAN_ONLY',
    state:
      String(options.state || '')
        .trim()
        .toUpperCase(),
    stages: [],
    connectors: {},
    counts: {
      discovered: 0,
      verifiedInitially: 0,
      driftScanned: 0,
      repairPlanned: 0,
      repairAttempted: 0,
      repaired: 0,
      finalReady: 0,
      reviewRequired: 0,
      failed: 0
    },
    finalStatus: '',
    ok: false
  };

  console.log('');
  console.log('REOS Autonomous Maintenance Engine');
  console.log('==================================');
  console.log(
    `Mode:  ${report.mode}`
  );

  if (report.state) {
    console.log(
      `State: ${report.state}`
    );
  }

  console.log('');

  /*
   * Stage 1: refresh structural registry state.
   */
  const initialRefresh =
    stage('initial-registry-refresh');

  report.stages.push(initialRefresh);

  const refreshResult = runReos(
    root,
    ['county:registry-refresh'],
    true
  );

  finishStage(
    initialRefresh,
    refreshResult.ok,
    {
      exitCode: refreshResult.exitCode
    }
  );

  if (!refreshResult.ok) {
    report.completedAt = nowIso();
    report.finalStatus = 'FAILED';

    writeJsonAtomic(
      reportPath,
      report
    );

    return {
      ok: false,
      reportPath,
      message:
        'Initial registry refresh failed.'
    };
  }

  /*
   * Stage 2: health and dry-sync verification.
   */
  const initialVerification =
    stage('initial-registry-verification');

  report.stages.push(initialVerification);

  const verificationArgs = [
    'county:registry-update',
    '--all',
    '--generated-only',
    '--health',
    '--test',
    '--limit',
    String(options.testLimit),
    '--continue-on-error'
  ];

  const verifyResult = runReos(
    root,
    verificationArgs,
    true
  );

  /*
   * The registry-update command intentionally exits nonzero when
   * review is required. Continue using the resulting registry.
   */
  finishStage(
    initialVerification,
    true,
    {
      commandExitCode:
        verifyResult.exitCode
    }
  );

  let registry = loadRegistry(root);

  const connectors =
    generatedConnectorEntries(
      registry,
      report.state
    );

  report.counts.discovered =
    connectors.length;

  report.counts.verifiedInitially =
    connectors.length;

  /*
   * Stage 3: schema-drift detection.
   */
  for (const entry of connectors) {
    const connectorReport = {
      connectorId: entry.connectorId,
      initialStatus: entry.status,
      finalStatus: entry.status,
      drift: {
        attempted: false,
        ok: null
      },
      repair: {
        needed: false,
        attempted: false,
        ok: null
      },
      stages: [],
      ok: false
    };

    report.connectors[
      entry.connectorId
    ] = connectorReport;

    if (!connectorNeedsDriftScan(entry)) {
      connectorReport.drift = {
        attempted: false,
        ok: true,
        skipped: true,
        reason:
          'No enabled datasets with configured endpoints.'
      };

      continue;
    }

    const driftStage =
      stage('schema-drift-scan');

    connectorReport.stages.push(
      driftStage
    );

    connectorReport.drift.attempted =
      true;

    const driftArgs = [
      'county:schema-drift',
      '--connector',
      entry.connectorId,
      '--samples',
      String(options.schemaSamples),
      '--continue-on-error'
    ];

    if (options.acceptBaseline === true) {
      driftArgs.push('--accept');
    }

    const driftResult = runReos(
      root,
      driftArgs,
      true
    );

    /*
     * A nonzero exit means review may be required, not necessarily
     * that the maintenance engine itself crashed.
     */
    connectorReport.drift.ok =
      driftResult.exitCode === 0;

    finishStage(
      driftStage,
      true,
      {
        commandExitCode:
          driftResult.exitCode,
        reviewDetected:
          driftResult.exitCode !== 0
      }
    );

    report.counts.driftScanned += 1;
  }

  /*
   * Refresh so drift state is reflected in registry decisions.
   */
  runReos(
    root,
    ['county:registry-refresh'],
    true
  );

  registry = loadRegistry(root);

  /*
   * Stage 4: build repair plans.
   */
  const repairQueue = [];

  for (
    const entry of generatedConnectorEntries(
      registry,
      report.state
    )
  ) {
    const connectorReport =
      report.connectors[
        entry.connectorId
      ];

    connectorReport.finalStatus =
      entry.status;

    const needsRepair =
      connectorNeedsRepair(entry);

    connectorReport.repair.needed =
      needsRepair;

    if (!needsRepair) {
      connectorReport.ok = true;
      continue;
    }

    report.counts.repairPlanned += 1;

    const planStage =
      stage('self-healing-plan');

    connectorReport.stages.push(
      planStage
    );

    const planResult = runReos(
      root,
      [
        'county:self-heal',
        '--connector',
        entry.connectorId
      ],
      false
    );

    finishStage(
      planStage,
      planResult.ok,
      {
        exitCode:
          planResult.exitCode,
        output: [
          planResult.stdout,
          planResult.stderr
        ].join('\n').slice(0, 10000)
      }
    );

    if (!planResult.ok) {
      connectorReport.ok = false;

      if (!options.continueOnError) {
        break;
      }

      continue;
    }

    repairQueue.push(entry.connectorId);
  }

  if (!options.execute) {
    report.completedAt = nowIso();

    report.finalStatus =
      repairQueue.length
        ? 'REPAIR_PLANNED'
        : 'HEALTHY';

    report.ok = true;

    writeJsonAtomic(
      reportPath,
      report
    );

    console.log('');
    console.log(
      `Repair plans: ${repairQueue.length}`
    );
    console.log(
      `Report: ${path.relative(root, reportPath)}`
    );

    return {
      ok: true,
      planOnly: true,
      repairCount:
        repairQueue.length,
      reportPath
    };
  }

  /*
   * Stage 5: execute conservative self-healing.
   */
  for (const connectorId of repairQueue) {
    const connectorReport =
      report.connectors[connectorId];

    connectorReport.repair.attempted =
      true;

    report.counts.repairAttempted += 1;

    const repairStage =
      stage('self-healing-execution');

    connectorReport.stages.push(
      repairStage
    );

    const args = [
      'county:self-heal',
      '--connector',
      connectorId,
      '--execute',
      '--samples',
      String(options.mappingSamples),
      '--results',
      String(options.discoveryResults),
      '--health-limit',
      String(options.healthLimit),
      '--test-limit',
      String(options.testLimit)
    ];

    if (options.push === true) {
      args.push('--push');
    }

    if (
      options.allowEndpointReplacement === true
    ) {
      args.push(
        '--allow-endpoint-replacement'
      );
    }

    if (
      options.replaceMappings === true
    ) {
      args.push('--replace-mappings');
    }

    if (options.continueOnError) {
      args.push('--continue-on-error');
    }

    const repairResult = runReos(
      root,
      args,
      true
    );

    connectorReport.repair.ok =
      repairResult.ok;

    finishStage(
      repairStage,
      repairResult.ok,
      {
        exitCode:
          repairResult.exitCode
      }
    );

    if (repairResult.ok) {
      report.counts.repaired += 1;
    }

    if (
      !repairResult.ok &&
      !options.continueOnError
    ) {
      break;
    }
  }

  /*
   * Stage 6: final refresh and verification.
   */
  const finalRefresh =
    stage('final-registry-refresh');

  report.stages.push(finalRefresh);

  const finalRefreshResult = runReos(
    root,
    ['county:registry-refresh'],
    true
  );

  finishStage(
    finalRefresh,
    finalRefreshResult.ok,
    {
      exitCode:
        finalRefreshResult.exitCode
    }
  );

  const finalVerification =
    stage('final-registry-verification');

  report.stages.push(
    finalVerification
  );

  const finalVerifyResult = runReos(
    root,
    [
      'county:registry-update',
      '--all',
      '--generated-only',
      '--health',
      '--test',
      '--limit',
      String(options.testLimit),
      '--continue-on-error'
    ],
    true
  );

  finishStage(
    finalVerification,
    true,
    {
      commandExitCode:
        finalVerifyResult.exitCode
    }
  );

  registry = loadRegistry(root);

  for (
    const entry of generatedConnectorEntries(
      registry,
      report.state
    )
  ) {
    const connectorReport =
      report.connectors[
        entry.connectorId
      ] || {
        connectorId:
          entry.connectorId,
        initialStatus:
          entry.status,
        stages: [],
        drift: {},
        repair: {}
      };

    connectorReport.finalStatus =
      entry.status;

    connectorReport.ok =
      HEALTHY_STATUSES.has(
        entry.status
      );

    report.connectors[
      entry.connectorId
    ] = connectorReport;

    if (connectorReport.ok) {
      report.counts.finalReady += 1;
    } else if (
      entry.status ===
        'REVIEW_REQUIRED' ||
      entry.status ===
        'INACCESSIBLE'
    ) {
      report.counts.reviewRequired += 1;
    } else {
      report.counts.failed += 1;
    }

    printConnectorLine(
      connectorReport
    );
  }

  report.completedAt = nowIso();

  report.ok =
    report.counts.reviewRequired === 0 &&
    report.counts.failed === 0 &&
    report.stages.every(
      item => item.ok !== false
    );

  report.finalStatus = report.ok
    ? 'HEALTHY'
    : 'MANUAL_REVIEW_REQUIRED';

  writeJsonAtomic(
    reportPath,
    report
  );

  console.log('');
  console.log('Autonomous maintenance summary');
  console.log('------------------------------');
  console.log(
    `Connectors:       ${report.counts.discovered}`
  );
  console.log(
    `Drift scanned:    ${report.counts.driftScanned}`
  );
  console.log(
    `Repair planned:   ${report.counts.repairPlanned}`
  );
  console.log(
    `Repair attempted: ${report.counts.repairAttempted}`
  );
  console.log(
    `Repaired:         ${report.counts.repaired}`
  );
  console.log(
    `Ready:            ${report.counts.finalReady}`
  );
  console.log(
    `Review required:  ${report.counts.reviewRequired}`
  );
  console.log(
    `Failed:           ${report.counts.failed}`
  );
  console.log(
    `Status:           ${report.finalStatus}`
  );
  console.log(
    `Report:           ${path.relative(root, reportPath)}`
  );

  return {
    ok: report.ok,
    status:
      report.finalStatus,
    reportPath,
    counts:
      report.counts
  };
}
