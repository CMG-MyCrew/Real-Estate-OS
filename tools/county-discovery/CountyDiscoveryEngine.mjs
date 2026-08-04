import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ARCGIS_SEARCH =
  'https://www.arcgis.com/sharing/rest/search';

const SOCRATA_CATALOG =
  'https://api.us.socrata.com/api/catalog/v1';

const DATASET_RULES = {
  parcel_inventory: {
    labels: [
      'parcel inventory',
      'parcel boundaries',
      'parcel boundary',
      'parcel layer',
      'parcel polygons',
      'land parcels',
      'tax parcels',
      'cadastral parcels',
      'state parcels'
    ],
    requiredSignals: [
      'parcel',
      'parcels',
      'cadastral',
      'tax parcel'
    ]
  },

  property_assessment: {
    labels: [
      'property assessment',
      'property assessments',
      'parcel',
      'parcels',
      'tax parcel',
      'tax parcels',
      'assessment',
      'assessor',
      'real property'
    ],
    requiredSignals: [
      'parcel',
      'assessment',
      'assessor',
      'property'
    ]
  },

  tax_delinquent: {
    labels: [
      'tax delinquent',
      'tax delinquency',
      'delinquent tax',
      'delinquent property',
      'tax balance',
      'tax lien',
      'unpaid real estate tax'
    ],
    requiredSignals: [
      'delinquent',
      'delinquency',
      'tax lien',
      'tax balance',
      'unpaid'
    ]
  },

  code_violations: {
    labels: [
      'code violation',
      'code violations',
      'building violation',
      'property violation',
      'housing violation',
      'l&i violation',
      'inspection violation'
    ],
    requiredSignals: [
      'violation',
      'code enforcement',
      'inspection'
    ]
  },

  vacant_properties: {
    labels: [
      'vacant property',
      'vacant properties',
      'vacant building',
      'vacant buildings',
      'vacant land',
      'vacancy',
      'abandoned property'
    ],
    requiredSignals: [
      'vacant',
      'vacancy',
      'abandoned'
    ]
  },

  sheriff_sales: {
    labels: [
      'sheriff sale',
      'sheriff sales',
      'foreclosure',
      'foreclosure sale',
      'tax sale',
      'mortgage sale',
      'judicial sale'
    ],
    requiredSignals: [
      'sheriff',
      'foreclosure',
      'judicial sale'
    ]
  },

  building_permits: {
    labels: [
      'building permit',
      'building permits',
      'construction permit',
      'permits',
      'demolition permit'
    ],
    requiredSignals: [
      'permit',
      'demolition'
    ]
  }
};

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function encodeQuery(parameters) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(parameters)) {
    if (
      value !== null &&
      typeof value !== 'undefined' &&
      value !== ''
    ) {
      search.set(key, String(value));
    }
  }

  return search.toString();
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 20000);

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'REOS-County-Discovery/1.0',
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const body = await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} from ${url}: ` +
        body.slice(0, 400)
      );
    }

    try {
      return JSON.parse(body);
    } catch {
      throw new Error(
        `Invalid JSON from ${url}: ${body.slice(0, 400)}`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

function classifyDataset(candidate) {
  const combined = normalizeText([
    candidate.title,
    candidate.description,
    candidate.snippet,
    ...(candidate.tags || [])
  ].join(' '));

  let best = {
    dataset: 'unknown',
    score: 0,
    matchedTerms: []
  };

  for (const [dataset, rule] of Object.entries(DATASET_RULES)) {
    const matchedTerms = [];

    for (const term of rule.labels) {
      if (combined.includes(term)) {
        matchedTerms.push(term);
      }
    }

    let score = matchedTerms.length * 12;

    for (const signal of rule.requiredSignals) {
      if (combined.includes(signal)) {
        score += 8;
      }
    }

    if (score > best.score) {
      best = {
        dataset,
        score,
        matchedTerms
      };
    }
  }

  return best;
}

function calculateCompatibility(candidate, locality) {
  const text = normalizeText([
    candidate.title,
    candidate.description,
    candidate.snippet,
    candidate.owner,
    ...(candidate.tags || [])
  ].join(' '));

  const countyName = normalizeText(locality.county);
  const stateName = normalizeText(locality.state);
  const classification = classifyDataset(candidate);

  let score = classification.score;

  if (countyName && text.includes(countyName)) {
    score += 25;
  }

  if (stateName && text.includes(stateName)) {
    score += 8;
  }

  if (candidate.adapter === 'arcgis') {
    score += 12;
  }

  if (candidate.adapter === 'socrata') {
    score += 10;
  }

  if (candidate.endpoint) {
    score += 10;
  }

  if (candidate.isPublic !== false) {
    score += 5;
  }

  if (
    candidate.type === 'Feature Service' ||
    candidate.type === 'Feature Layer'
  ) {
    score += 8;
  }

  score = Math.max(0, Math.min(score, 100));

  return {
    score,
    dataset: classification.dataset,
    matchedTerms: classification.matchedTerms,
    generatorReady:
      score >= 60 &&
      classification.dataset !== 'unknown' &&
      Boolean(candidate.endpoint)
  };
}

async function resolveArcGISItem(item) {
  if (!item?.id) {
    return item || {};
  }

  const currentUrl = String(item.url || '').trim();

  if (currentUrl) {
    return item;
  }

  try {
    const details = await requestJson(
      `https://www.arcgis.com/sharing/rest/content/items/` +
      `${encodeURIComponent(item.id)}?f=json`
    );

    return {
      ...item,
      ...details,
      tags: details.tags || item.tags || []
    };
  } catch (error) {
    var message = String(
      error && error.message
        ? error.message
        : error
    );

    return {
      ...item,
      itemResolutionError: message,
      inaccessible:
        message.includes('HTTP 403') ||
        message.includes('permissions')
    };
  }
}

async function expandArcGISService(searchItem) {
  const item = await resolveArcGISItem(searchItem);

  const serviceUrl = String(item.url || '')
    .trim()
    .replace(/\/+$/, '');

  const baseCandidate = {
    adapter: 'arcgis',
    source: 'arcgis-online',
    title: item.title || searchItem.title || '',
    description:
      item.description ||
      searchItem.description ||
      '',
    snippet:
      item.snippet ||
      searchItem.snippet ||
      '',
    tags: item.tags || searchItem.tags || [],
    owner: item.owner || searchItem.owner || '',
    itemId: item.id || searchItem.id || '',
    type: item.type || searchItem.type || '',
    serviceUrl,
    endpoint: '',
    isPublic:
      (item.access || searchItem.access) === 'public'
  };

  if (!serviceUrl) {
    return [{
      ...baseCandidate,
      expansionError:
        item.itemResolutionError ||
        'ArcGIS item did not expose a service URL.'
    }];
  }

  /*
   * A search result can occasionally point directly to a layer.
   */
  const directLayerMatch = serviceUrl.match(
    /\/(FeatureServer|MapServer)\/(\d+)$/i
  );

  if (directLayerMatch) {
    return [{
      ...baseCandidate,
      layerId: Number(directLayerMatch[2]),
      endpoint: `${serviceUrl}/query`
    }];
  }

  let metadata;

  try {
    metadata = await requestJson(
      `${serviceUrl}?${encodeQuery({ f: 'json' })}`
    );
  } catch (error) {
    return [{
      ...baseCandidate,
      expansionError: error.message
    }];
  }

  if (metadata.error) {
    return [{
      ...baseCandidate,
      expansionError:
        `ArcGIS metadata error: ` +
        `${JSON.stringify(metadata.error)}`
    }];
  }

  const layers = [
    ...(Array.isArray(metadata.layers)
      ? metadata.layers
      : []),
    ...(Array.isArray(metadata.tables)
      ? metadata.tables
      : [])
  ];

  if (!layers.length) {
    return [{
      ...baseCandidate,
      expansionError:
        'ArcGIS service exposed no queryable layers.'
    }];
  }

  return layers.map(layer => ({
    ...baseCandidate,
    title:
      `${baseCandidate.title} — ` +
      `${layer.name || `Layer ${layer.id}`}`,
    layerId: layer.id,
    layerName: layer.name || '',
    endpoint:
      `${serviceUrl}/${layer.id}/query`
  }));
}

async function discoverArcGIS(locality, options = {}) {
  const limit = Math.max(
    1,
    Math.min(Number(options.limit || 40), 100)
  );

  const phrases = [
    `${locality.county} County ${locality.state} parcels`,
    `${locality.county} County ${locality.state} property assessment`,
    `${locality.county} County ${locality.state} tax delinquent`,
    `${locality.county} County ${locality.state} code violations`,
    `${locality.county} County ${locality.state} vacant properties`,
    `${locality.county} County ${locality.state} sheriff sale`
  ];

  const itemsById = new Map();

  for (const phrase of phrases) {
    const query = [
      `"${phrase}"`,
      '(type:"Feature Service" OR type:"Feature Layer")'
    ].join(' AND ');

    const url = `${ARCGIS_SEARCH}?${encodeQuery({
      q: query,
      f: 'json',
      num: limit,
      sortField: 'modified',
      sortOrder: 'desc'
    })}`;

    const payload = await requestJson(url);

    for (const item of payload.results || []) {
      if (item && item.id) {
        itemsById.set(item.id, item);
      }
    }
  }

  const expanded = [];

  for (const item of itemsById.values()) {
    const candidates = await expandArcGISService(item);
    expanded.push(...candidates);
  }

  return expanded;
}

async function discoverSocrata(locality, options = {}) {
  const limit = Math.max(
    1,
    Math.min(Number(options.limit || 50), 100)
  );

  const query =
    `${locality.county} County ${locality.state} ` +
    'parcel assessment tax delinquent violation vacant';

  const url = `${SOCRATA_CATALOG}?${encodeQuery({
    q: query,
    limit
  })}`;

  let payload;

  try {
    payload = await requestJson(url);
  } catch (error) {
    return [{
      adapter: 'socrata',
      source: 'socrata-catalog',
      title: 'Socrata discovery error',
      endpoint: '',
      discoveryError: error.message
    }];
  }

  return (payload.results || []).map(result => {
    const resource = result.resource || {};
    const metadata = result.metadata || {};
    const domain =
      metadata.domain ||
      result.permalink?.match(/^https?:\/\/([^/]+)/)?.[1] ||
      '';

    const resourceId = resource.id || '';

    return {
      adapter: 'socrata',
      source: 'socrata-catalog',
      title: resource.name || resourceId,
      description: resource.description || '',
      snippet: '',
      tags: resource.tags || [],
      owner:
        metadata.custom_fields?.Data?.['Data Owner'] ||
        metadata.contact_email ||
        '',
      domain,
      resourceId,
      type: resource.type || '',
      endpoint:
        domain && resourceId
          ? `https://${domain}/resource/${resourceId}.json`
          : '',
      isPublic: true,
      permalink: result.permalink || ''
    };
  });
}

function deduplicateCandidates(candidates) {
  const seen = new Set();
  const output = [];

  for (const candidate of candidates) {
    const key = [
      candidate.adapter,
      candidate.endpoint,
      candidate.itemId,
      candidate.layerId,
      candidate.resourceId
    ].join('|');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(candidate);
  }

  return output;
}

function rankCandidates(candidates, locality) {
  return candidates
    .map(candidate => ({
      ...candidate,
      compatibility: calculateCompatibility(
        candidate,
        locality
      )
    }))
    .sort((left, right) => {
      return (
        right.compatibility.score -
        left.compatibility.score
      );
    });
}

function runAdapterHealth(root, candidate) {
  if (!candidate.endpoint) {
    return {
      ok: false,
      skipped: true,
      message: 'Candidate has no endpoint.'
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

  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim()
  };
}

export async function discoverCounty(options) {
  const root = options.root || process.cwd();

  const locality = {
    state: String(options.state || '').trim().toUpperCase(),
    county: String(options.county || '')
      .trim()
      .replace(/\s+County$/i, '')
  };

  if (!/^[A-Z]{2}$/.test(locality.state)) {
    throw new Error(
      'Discovery requires a two-letter --state.'
    );
  }

  if (!locality.county) {
    throw new Error('Discovery requires --county.');
  }

  const sourceNames = new Set(
    String(options.sources || 'arcgis,socrata')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );

  const candidates = [];

  if (sourceNames.has('arcgis')) {
    candidates.push(
      ...(await discoverArcGIS(locality, options))
    );
  }

  if (sourceNames.has('socrata')) {
    candidates.push(
      ...(await discoverSocrata(locality, options))
    );
  }

  const ranked = rankCandidates(
    deduplicateCandidates(candidates),
    locality
  );

  const maxResults = Math.max(
    1,
    Math.min(Number(options.results || 30), 200)
  );

  const selected = ranked.slice(0, maxResults);

  if (options.health === true) {
    const healthLimit = Math.max(
      1,
      Math.min(Number(options.healthLimit || 10), 25)
    );

    for (
      let index = 0;
      index < Math.min(healthLimit, selected.length);
      index += 1
    ) {
      selected[index].health = runAdapterHealth(
        root,
        selected[index]
      );
    }
  }

  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    locality,
    sources: [...sourceNames],
    candidateCount: ranked.length,
    results: selected
  };
}

export function saveDiscoveryReport(report, outputPath) {
  fs.mkdirSync(
    path.dirname(outputPath),
    { recursive: true }
  );

  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
}
