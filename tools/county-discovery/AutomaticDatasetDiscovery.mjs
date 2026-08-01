import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  discoverCounty,
  saveDiscoveryReport
} from './CountyDiscoveryEngine.mjs';

const DEFAULT_DATASETS = [
  'property_assessment',
  'tax_delinquent',
  'code_violations',
  'vacant_properties',
  'sheriff_sales',
  'building_permits'
];

const DATASET_THRESHOLDS = {
  property_assessment: 60,
  tax_delinquent: 68,
  code_violations: 65,
  vacant_properties: 65,
  sheriff_sales: 70,
  building_permits: 60
};

const NEGATIVE_TERMS = [
  'arboretum',
  'park boundary',
  'campus boundary',
  'school boundary',
  'historic district',
  'trail',
  'watershed',
  'zoning boundary',
  'municipal boundary',
  'election',
  'voting district',
  'transit route',
  'bus route'
];

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function candidateText(candidate) {
  return normalizeText([
    candidate.title,
    candidate.description,
    candidate.snippet,
    candidate.owner,
    ...(candidate.tags || [])
  ].join(' '));
}

const STATE_NAMES = {
  PA: 'pennsylvania',
  NY: 'new york',
  NJ: 'new jersey',
  DE: 'delaware',
  MD: 'maryland'
};

function endpointHost(candidate) {
  try {
    return new URL(
      String(candidate.endpoint || candidate.serviceUrl || '')
    ).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function localityMatch(candidate, locality) {
  const text = candidateText(candidate);
  const county = normalizeText(locality.county);
  const stateCode = String(locality.state || '')
    .trim()
    .toUpperCase();
  const stateName = STATE_NAMES[stateCode] || '';
  const host = endpointHost(candidate);

  const countyPhrases = [
    `${county} county`,
    `county of ${county}`
  ];

  const countyMatch = countyPhrases.some(
    phrase => phrase && text.includes(phrase)
  );

  const explicitStateMatch =
    Boolean(stateName) &&
    (
      text.includes(`${county} county ${stateName}`) ||
      text.includes(`${county}, ${stateName}`) ||
      text.includes(`${county} ${stateName}`) ||
      text.includes(stateName)
    );

  const statePortalMatch =
    stateCode === 'PA'
      ? (
          host.endsWith('.pa.gov') ||
          host.includes('pennsylvania')
        )
      : stateCode === 'NY'
        ? (
            host === 'data.ny.gov' ||
            host.endsWith('.ny.gov')
          )
        : stateCode === 'NJ'
          ? host.endsWith('.nj.gov')
          : false;

  const conflictingState =
    stateCode !== 'NY' &&
    (
      host === 'data.ny.gov' ||
      host.endsWith('.ny.gov') ||
      text.includes('new york state')
    );

  return {
    countyMatch,
    stateMatch:
      explicitStateMatch ||
      statePortalMatch,
    conflictingState,
    host
  };
}

function negativePenalty(candidate) {
  const text = candidateText(candidate);

  const matched = NEGATIVE_TERMS.filter(term =>
    text.includes(term)
  );

  return {
    matched,
    penalty: matched.length * 25
  };
}

function endpointQuality(candidate) {
  const endpoint = String(candidate.endpoint || '');

  let score = 0;

  if (endpoint.startsWith('https://')) {
    score += 5;
  }

  if (
    candidate.adapter === 'arcgis' &&
    /FeatureServer\/\d+\/query$/i.test(endpoint)
  ) {
    score += 12;
  }

  if (
    candidate.adapter === 'socrata' &&
    /\/resource\/[\w-]+\.json/i.test(endpoint)
  ) {
    score += 10;
  }

  return score;
}

function rescoreCandidate(candidate, locality) {
  const compatibility = candidate.compatibility || {};
  const localityResult = localityMatch(candidate, locality);
  const negativeResult = negativePenalty(candidate);

  let score = Number(compatibility.score || 0);

  if (localityResult.countyMatch) {
    score += 20;
  } else {
    score -= 18;
  }

  if (localityResult.stateMatch) {
    score += 15;
  } else {
    score -= 20;
  }

  if (localityResult.conflictingState) {
    score = 0;
  }

  score += endpointQuality(candidate);
  score -= negativeResult.penalty;

  if (
    candidate.health &&
    candidate.health.ok === true
  ) {
    score += 12;
  }

  if (
    candidate.health &&
    candidate.health.ok === false
  ) {
    score -= 30;
  }

  score = Math.max(0, Math.min(score, 100));

  return {
    ...candidate,
    automaticDiscovery: {
      score,
      originalScore: Number(compatibility.score || 0),
      countyMatch: localityResult.countyMatch,
      stateMatch: localityResult.stateMatch,
      negativeTerms: negativeResult.matched,
      endpointQuality: endpointQuality(candidate),
      eligible:
        Boolean(candidate.endpoint) &&
        localityResult.countyMatch &&
        localityResult.stateMatch &&
        !localityResult.conflictingState &&
        !negativeResult.matched.length
    }
  };
}

function groupByDataset(candidates, datasets) {
  const groups = {};

  datasets.forEach(dataset => {
    groups[dataset] = [];
  });

  candidates.forEach(candidate => {
    const dataset =
      candidate.compatibility?.dataset ||
      'unknown';

    if (!groups[dataset]) {
      groups[dataset] = [];
    }

    groups[dataset].push(candidate);
  });

  Object.values(groups).forEach(group => {
    group.sort((left, right) => {
      return (
        Number(right.automaticDiscovery?.score || 0) -
        Number(left.automaticDiscovery?.score || 0)
      );
    });
  });

  return groups;
}

function selectCandidates(groups, datasets) {
  const selections = {};

  datasets.forEach(dataset => {
    const threshold =
      DATASET_THRESHOLDS[dataset] || 65;

    const candidates = groups[dataset] || [];

    const selected = candidates.find(candidate => {
      return (
        candidate.automaticDiscovery?.eligible === true &&
        Number(
          candidate.automaticDiscovery?.score || 0
        ) >= threshold
      );
    });

    selections[dataset] = {
      threshold,
      status: selected ? 'SELECTED' : 'NOT_FOUND',
      selected: selected || null,
      reviewedCandidates: candidates.slice(0, 5)
    };
  });

  return selections;
}

function runHealthCheck(root, candidate) {
  if (!candidate?.endpoint || !candidate?.adapter) {
    return {
      ok: false,
      skipped: true,
      message: 'Missing adapter or endpoint.'
    };
  }

  const result = spawnSync(
    'npx',
    [
      'clasp',
      'run',
      'REOS_COUNTY_TERMINAL_SYNC',
      '--params',
      JSON.stringify([{
        action: 'adapter-health',
        adapter: candidate.adapter,
        endpoint: candidate.endpoint
      }])
    ],
    {
      cwd: root,
      encoding: 'utf8',
      shell: false
    }
  );

  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const combined = `${stdout}\n${stderr}`;

  return {
    ok:
      result.status === 0 &&
      !combined.includes('ok: false') &&
      !combined.includes('Exception:'),
    exitCode: result.status,
    stdout,
    stderr
  };
}

function printPlan(plan) {
  console.log('');
  console.log(
    `${plan.locality.county} County, ` +
    `${plan.locality.state} automatic discovery`
  );

  console.log(
    `Candidates analyzed: ${plan.candidateCount}`
  );

  console.log('');

  for (
    const [dataset, selection]
    of Object.entries(plan.selections)
  ) {
    const candidate = selection.selected;

    if (!candidate) {
      console.log(
        `${dataset.padEnd(24)} | NOT_FOUND | ` +
        `threshold=${selection.threshold}`
      );

      continue;
    }

    console.log(
      [
        dataset.padEnd(24),
        'SELECTED',
        `score=${candidate.automaticDiscovery.score}`,
        `adapter=${candidate.adapter}`,
        candidate.title
      ].join(' | ')
    );

    console.log(`    ${candidate.endpoint}`);

    if (candidate.health) {
      console.log(
        `    health=${candidate.health.ok ? 'PASS' : 'FAIL'}`
      );
    }
  }
}

export async function discoverAllDatasets(options) {
  const root = options.root || process.cwd();

  const datasets = Array.isArray(options.datasets)
    ? options.datasets
    : DEFAULT_DATASETS;

  const discoveryReport = await discoverCounty({
    root,
    state: options.state,
    county: options.county,
    sources:
      options.sources ||
      'arcgis,socrata',
    limit: Number(options.limit || 50),
    results: Number(options.results || 100),
    health: false
  });

  let candidates = discoveryReport.results.map(candidate =>
    rescoreCandidate(
      candidate,
      discoveryReport.locality
    )
  );

  if (options.health === true) {
    const healthLimit = Math.max(
      1,
      Math.min(
        Number(options.healthLimit || 20),
        50
      )
    );

    const healthCandidates = candidates
      .filter(candidate =>
        candidate.automaticDiscovery?.eligible === true
      )
      .sort((left, right) => {
        return (
          right.automaticDiscovery.score -
          left.automaticDiscovery.score
        );
      })
      .slice(0, healthLimit);

    for (const candidate of healthCandidates) {
      candidate.health = runHealthCheck(
        root,
        candidate
      );
    }

    candidates = candidates.map(candidate =>
      rescoreCandidate(
        candidate,
        discoveryReport.locality
      )
    );
  }

  const groups = groupByDataset(
    candidates,
    datasets
  );

  const selections = selectCandidates(
    groups,
    datasets
  );

  const plan = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    locality: discoveryReport.locality,
    sources: discoveryReport.sources,
    datasets,
    candidateCount: candidates.length,
    selections,
    candidates
  };

  printPlan(plan);

  return plan;
}

export function saveAutomaticDiscoveryPlan(
  plan,
  outputPath
) {
  fs.mkdirSync(
    path.dirname(outputPath),
    { recursive: true }
  );

  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(plan, null, 2)}\n`,
    'utf8'
  );
}

export function saveUnderlyingDiscoveryReport(
  plan,
  outputPath
) {
  saveDiscoveryReport(
    {
      schemaVersion: plan.schemaVersion,
      generatedAt: plan.generatedAt,
      locality: plan.locality,
      sources: plan.sources,
      candidateCount: plan.candidateCount,
      results: plan.candidates
    },
    outputPath
  );
}
