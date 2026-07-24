#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function readFlag(name, fallback = '') {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  const index = args.findIndex((arg) => arg === exact || arg.startsWith(prefix));
  if (index === -1) return fallback;
  if (args[index].startsWith(prefix)) return args[index].slice(prefix.length);
  const next = args[index + 1];
  return next && !next.startsWith('--') ? next : true;
}

function hasFlag(name) {
  return args.includes(`--${name}`) || args.some((arg) => arg === `--${name}=true`);
}

function numberFlag(name, fallback) {
  const value = Number(readFlag(name, fallback));
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`--${name} must be a positive number.`);
  }
  return Math.floor(value);
}

function usage() {
  console.log(`
REOS County Connector Terminal Sync

Usage:
  npm run county:setup
  npm run county:list
  npm run county:dry -- --connector PA-PHILADELPHIA --dataset tax_delinquent --limit 100
  npm run county:sync -- --connector PA-PHILADELPHIA --dataset tax_delinquent --limit 500 --live
  npm run county:sync-all -- --live

Commands:
  setup       Create connector infrastructure.
  list        List registered connectors and datasets.
  sync        Run one connector dataset. Defaults to dry-run.
  sync-all    Run all registered connectors. Defaults to dry-run.

Options:
  --connector <id>    Connector ID, for example PA-PHILADELPHIA.
  --dataset <name>    Dataset key, for example tax_delinquent.
  --limit <number>    Maximum records, default 100 and maximum 5000.
  --cursor <value>    Optional source pagination cursor.
  --live              Persist records. Without this flag, execution is dry-run.
  --no-push           Skip clasp push before clasp run.
  --json              Print compact JSON output when possible.
`);
}

function run(program, programArgs, options = {}) {
  const result = spawnSync(program, programArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout || ''}${result.stderr || ''}`.trim() : '';
    throw new Error(`${program} exited with code ${result.status}${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

function validateClaspProject() {
  const status = run('npx', ['clasp', 'status'], { capture: true });
  if (!status.stdout && !status.stderr) {
    throw new Error('Unable to validate the clasp project. Run `npx clasp login` and confirm .clasp.json exists.');
  }
}

function invoke(options) {
  validateClaspProject();

  if (!hasFlag('no-push')) {
    console.error('Pushing Apps Script source with clasp...');
    run('npx', ['clasp', 'push']);
  }

  const payload = JSON.stringify([options]);
  const result = run('npx', [
    'clasp',
    'run',
    'REOS_COUNTY_TERMINAL_SYNC',
    '--params',
    payload
  ], { capture: true });

  const output = String(result.stdout || '').trim();
  if (hasFlag('json')) {
    console.log(output.replace(/^Result:\s*/i, ''));
  } else {
    console.log(output || 'County connector command completed.');
  }
}

try {
  if (command === 'help' || command === '--help' || command === '-h') {
    usage();
    process.exit(0);
  }

  if (command === 'setup' || command === 'list') {
    invoke({ action: command, dryRun: true });
    process.exit(0);
  }

  if (command !== 'sync' && command !== 'sync-all') {
    throw new Error(`Unknown command: ${command}`);
  }

  const live = hasFlag('live');
  const options = {
    action: command,
    connectorId: String(readFlag('connector', '') || ''),
    dataset: String(readFlag('dataset', '') || ''),
    limit: Math.min(numberFlag('limit', 100), 5000),
    cursor: String(readFlag('cursor', '') || ''),
    dryRun: !live,
    confirmLive: live
  };

  if (command === 'sync') {
    if (!options.connectorId) throw new Error('--connector is required for sync.');
    if (!options.dataset) throw new Error('--dataset is required for sync.');
  }

  console.error(live
    ? 'LIVE MODE: county records may be inserted or updated.'
    : 'DRY-RUN MODE: no county records will be persisted.');

  invoke(options);
} catch (error) {
  console.error(`County sync failed: ${error.message}`);
  process.exit(1);
}
