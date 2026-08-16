#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');

const MANIFEST_DIR = path.join(
  ROOT,
  'config',
  'county-connectors'
);

const GENERATED_DIR = path.join(
  ROOT,
  'src',
  'connectors',
  'generated'
);

function pascalCase(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(
      word =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join('');
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function readManifest(file) {
  const fullPath = path.join(
    MANIFEST_DIR,
    file
  );

  try {
    return JSON.parse(
      fs.readFileSync(fullPath, 'utf8')
    );
  } catch (error) {
    fail(
      `${file} is not valid JSON: ` +
      error.message
    );
    return null;
  }
}

console.log(
  '=== COUNTY CONNECTOR NAMESPACE CONTRACT ==='
);
console.log('');

if (!fs.existsSync(MANIFEST_DIR)) {
  fail(
    `Manifest directory missing: ${MANIFEST_DIR}`
  );
  process.exit();
}

if (!fs.existsSync(GENERATED_DIR)) {
  fail(
    `Generated directory missing: ${GENERATED_DIR}`
  );
  process.exit();
}

const manifestFiles = fs
  .readdirSync(MANIFEST_DIR)
  .filter(file => file.endsWith('.json'))
  .sort();

const expectedFiles = new Map();
const expectedSymbols = new Map();
const connectorIds = new Set();

for (const file of manifestFiles) {
  const manifest = readManifest(file);

  if (!manifest) {
    continue;
  }

  const required = [
    'id',
    'state',
    'county',
    'datasets'
  ];

  const missing = required.filter(
    key =>
      manifest[key] === undefined ||
      manifest[key] === null ||
      manifest[key] === ''
  );

  if (missing.length) {
    fail(
      `${file} missing required fields: ` +
      missing.join(', ')
    );
    continue;
  }

  if (
    typeof manifest.datasets !== 'object' ||
    Array.isArray(manifest.datasets) ||
    Object.keys(manifest.datasets).length === 0
  ) {
    fail(
      `${file} must contain a non-empty datasets object`
    );
    continue;
  }

  if (connectorIds.has(manifest.id)) {
    fail(
      `duplicate connector id: ${manifest.id}`
    );
  }

  connectorIds.add(manifest.id);

  const className =
    `${pascalCase(manifest.state)}` +
    `${pascalCase(manifest.county)}` +
    'CountyConnector';

  const generatedFile =
    `${className}.gs`;

  if (expectedFiles.has(generatedFile)) {
    fail(
      `generated filename collision: ` +
      `${generatedFile} maps both ` +
      `${expectedFiles.get(generatedFile).id} and ` +
      `${manifest.id}`
    );
  }

  if (expectedSymbols.has(className)) {
    fail(
      `REOS symbol collision: ${className}`
    );
  }

  expectedFiles.set(
    generatedFile,
    manifest
  );

  expectedSymbols.set(
    className,
    manifest.id
  );
}

const actualFiles = fs
  .readdirSync(GENERATED_DIR)
  .filter(
    file =>
      file.endsWith('CountyConnector.gs')
  )
  .sort();

const actualSet = new Set(actualFiles);

for (
  const [generatedFile, manifest]
  of expectedFiles.entries()
) {
  const fullPath = path.join(
    GENERATED_DIR,
    generatedFile
  );

  if (!actualSet.has(generatedFile)) {
    fail(
      `missing generated connector: ` +
      `${manifest.id} -> ${generatedFile}`
    );
    continue;
  }

  const source = fs.readFileSync(
    fullPath,
    'utf8'
  );

  const className =
    `${pascalCase(manifest.state)}` +
    `${pascalCase(manifest.county)}` +
    'CountyConnector';

  const symbol =
    `REOS.${className}`;

  if (!source.includes(symbol)) {
    fail(
      `${generatedFile} missing symbol ${symbol}`
    );
  }

  const escapedId =
    String(manifest.id)
      .replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

  const idPattern = new RegExp(
    `\\bid:\\s*["']${escapedId}["']`
  );

  if (!idPattern.test(source)) {
    fail(
      `${generatedFile} does not contain ` +
      `manifest id ${manifest.id}`
    );
  }
}

for (const actualFile of actualFiles) {
  if (!expectedFiles.has(actualFile)) {
    fail(
      `unexpected generated connector: ` +
      actualFile
    );
  }
}

console.log(
  `manifests=${manifestFiles.length}`
);
console.log(
  `generated=${actualFiles.length}`
);
console.log(
  `unique connector IDs=${connectorIds.size}`
);
console.log(
  `unique generated filenames=${expectedFiles.size}`
);
console.log(
  `unique REOS symbols=${expectedSymbols.size}`
);

const contractPasses =
  process.exitCode !== 1 &&
  manifestFiles.length === 94 &&
  actualFiles.length === 94 &&
  connectorIds.size === 94 &&
  expectedFiles.size === 94 &&
  expectedSymbols.size === 94;

console.log('');

if (!contractPasses) {
  if (process.exitCode !== 1) {
    fail(
      'expected exactly 94 manifests, files, IDs, and symbols'
    );
  }

  console.error('');
  console.error(
    'County connector namespace contract FAILED.'
  );
  process.exit(1);
}

console.log(
  'PASS: 94 manifests map one-to-one to ' +
  '94 state-qualified generated connectors.'
);

console.log(
  'PASS: connector IDs, filenames, and ' +
  'REOS symbols are unique.'
);

console.log('');
console.log(
  'County connector namespace contract PASSED.'
);
