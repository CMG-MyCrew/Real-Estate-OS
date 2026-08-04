import fs from 'node:fs';
import path from 'node:path';

const FIELD_RULES = {
  address: {
    required: true,
    patterns: [
      [/^address$/i, 100],
      [/^property_?address$/i, 98],
      [/^street_?address$/i, 96],
      [/^site_?address$/i, 95],
      [/^location1$/i, 94],
      [/^location$/i, 85],
      [/^addr1$/i, 88],
      [/^loc_?add$/i, 82],
      [/address/i, 70],
      [/location/i, 55]
    ],
    valueTests: [
      ['addressLike', 25]
    ]
  },

  city: {
    patterns: [
      [/^city$/i, 100],
      [/^property_?city$/i, 95],
      [/^municipality$/i, 94],
      [/^muni_?name$/i, 93],
      [/^mailing_?city$/i, 75],
      [/city/i, 65],
      [/municip/i, 62],
      [/township/i, 55],
      [/borough/i, 55]
    ],
    valueTests: [
      ['mostlyText', 10]
    ]
  },

  zip: {
    patterns: [
      [/^zip$/i, 100],
      [/^zip_?code$/i, 98],
      [/^zipcode$/i, 98],
      [/^postal_?code$/i, 96],
      [/^zip1_?zip2$/i, 95],
      [/^loc_?zip/i, 90],
      [/zip/i, 65],
      [/postal/i, 60]
    ],
    valueTests: [
      ['zipLike', 30]
    ]
  },

  parcelId: {
    required: true,
    patterns: [
      [/^parcel$/i, 100],
      [/^pin$/i, 100],
      [/^tax_?pin$/i, 99],
      [/^parcel_?id$/i, 99],
      [/^parcel_?num$/i, 99],
      [/^parcel_?number$/i, 99],
      [/^taxpin$/i, 98],
      [/^tax_?pin$/i, 98],
      [/^opa_?number$/i, 96],
      [/^opa_?id$/i, 95],
      [/^account_?number$/i, 88],
      [/^alt_?id$/i, 75],
      [/parcel/i, 72],
      [/taxpin/i, 72],
      [/account/i, 55]
    ],
    valueTests: [
      ['identifierLike', 25]
    ]
  },

  ownerName: {
    patterns: [
      [/^owner$/i, 100],
      [/^owner1$/i, 99],
      [/^own1$/i, 98],
      [/^owner_?name$/i, 97],
      [/^legal_?owner$/i, 94],
      [/^opa_?owner$/i, 92],
      [/owner/i, 70],
      [/^own/i, 65]
    ],
    valueTests: [
      ['mostlyText', 12]
    ]
  },

  coOwnerName: {
    patterns: [
      [/^owner2$/i, 100],
      [/^own2$/i, 99],
      [/^co_?owner$/i, 97],
      [/second_?owner/i, 85]
    ],
    valueTests: [
      ['mostlyText', 8]
    ]
  },

  sourceRecordId: {
    required: true,
    patterns: [
      [/^objectid$/i, 100],
      [/^objectid_1$/i, 96],
      [/^globalid$/i, 94],
      [/^record_?id$/i, 92],
      [/^source_?id$/i, 90],
      [/^id$/i, 85],
      [/^case_?number$/i, 80],
      [/^violation_?number$/i, 80]
    ],
    valueTests: [
      ['uniqueLike', 35]
    ]
  },

  sourceUpdatedAt: {
    patterns: [
      [/^modify_?date$/i, 100],
      [/^modified$/i, 98],
      [/^updated_?at$/i, 97],
      [/^last_?updated$/i, 96],
      [/^date_?updated$/i, 95],
      [/^prop_?info1$/i, 90],
      [/^assmt_?chgd$/i, 88],
      [/update/i, 68],
      [/modif/i, 65],
      [/change.*date/i, 60]
    ],
    valueTests: [
      ['dateLike', 30]
    ]
  },

  estimatedValue: {
    patterns: [
      [/^total_?appr$/i, 100],
      [/^total_?value$/i, 99],
      [/^total_?assessment$/i, 98],
      [/^total_?asse$/i, 97],
      [/^assessment$/i, 94],
      [/^assessed_?value$/i, 94],
      [/^market_?value$/i, 92],
      [/total.*value/i, 78],
      [/assessment/i, 68],
      [/appraisal/i, 65]
    ],
    valueTests: [
      ['numericLike', 20]
    ]
  },

  assessmentValue: {
    patterns: [
      [/^total_?asse$/i, 100],
      [/^total_?assessment$/i, 99],
      [/^assessment$/i, 97],
      [/^assessed_?value$/i, 96]
    ],
    valueTests: [
      ['numericLike', 18]
    ]
  },

  landValue: {
    patterns: [
      [/^land_?value$/i, 100],
      [/^assessed_?land_?value$/i, 98],
      [/land.*value/i, 80]
    ],
    valueTests: [
      ['numericLike', 18]
    ]
  },

  buildingValue: {
    patterns: [
      [/^building_?value$/i, 100],
      [/^improvement_?value$/i, 98],
      [/^structure_?value$/i, 95],
      [/building.*value/i, 80]
    ],
    valueTests: [
      ['numericLike', 18]
    ]
  },

  yearBuilt: {
    patterns: [
      [/^year_?built$/i, 100],
      [/^yr_?built$/i, 98],
      [/^construction_?year$/i, 94],
      [/year.*built/i, 80]
    ],
    valueTests: [
      ['yearLike', 28]
    ]
  },

  landAcres: {
    patterns: [
      [/^land_?acres$/i, 100],
      [/^acres$/i, 98],
      [/^acreage$/i, 96],
      [/acre/i, 70]
    ],
    valueTests: [
      ['numericLike', 15]
    ]
  },

  livingArea: {
    patterns: [
      [/^sfla$/i, 100],
      [/^living_?area$/i, 98],
      [/^living_?square_?feet$/i, 96],
      [/^gross_?living_?area$/i, 95],
      [/square.*feet/i, 75],
      [/sqft/i, 72]
    ],
    valueTests: [
      ['numericLike', 16]
    ]
  },

  saleDate: {
    patterns: [
      [/^sale_?date_?$/i, 100],
      [/^last_?sale_?date$/i, 99],
      [/sale.*date/i, 80]
    ],
    valueTests: [
      ['dateLike', 28]
    ]
  },

  salePrice: {
    patterns: [
      [/^sale_?price$/i, 100],
      [/^considerat$/i, 98],
      [/^consideration$/i, 98],
      [/^last_?sale_?price$/i, 96],
      [/sale.*price/i, 78]
    ],
    valueTests: [
      ['numericLike', 18]
    ]
  }
};

const DATASET_RULES = {
  tax_delinquent: {
    taxDelinquentAmount: {
      patterns: [
        [/^total_?due$/i, 100],
        [/^amount_?due$/i, 98],
        [/^delinquent_?amount$/i, 97],
        [/^balance$/i, 90]
      ],
      valueTests: [['numericLike', 20]]
    },
    taxPrincipal: {
      patterns: [
        [/^principal_?due$/i, 100],
        [/^principal$/i, 92]
      ],
      valueTests: [['numericLike', 18]]
    },
    taxInterest: {
      patterns: [
        [/^interest_?due$/i, 100],
        [/^interest$/i, 92]
      ],
      valueTests: [['numericLike', 18]]
    },
    taxPenalty: {
      patterns: [
        [/^penalty_?due$/i, 100],
        [/^penalty$/i, 92]
      ],
      valueTests: [['numericLike', 18]]
    }
  },

  code_violations: {
    violationNumber: {
      patterns: [
        [/^violationnumber$/i, 100],
        [/^violation_?number$/i, 99],
        [/^case_?number$/i, 80]
      ]
    },
    violationType: {
      patterns: [
        [/^violationcodetitle$/i, 100],
        [/^violation_?type$/i, 98],
        [/^violation_?description$/i, 97],
        [/^code_?description$/i, 90]
      ]
    },
    violationStatus: {
      patterns: [
        [/^violationstatus$/i, 100],
        [/^violation_?status$/i, 99],
        [/^case_?status$/i, 94],
        [/^status$/i, 88]
      ]
    }
  },

  vacant_properties: {
    vacancyStatus: {
      patterns: [
        [/^vacant_?flag$/i, 100],
        [/^vacancy_?status$/i, 98],
        [/^vacant_?status$/i, 97]
      ]
    },
    vacancyRank: {
      patterns: [
        [/^vacant_?rank$/i, 100],
        [/^vacancy_?rank$/i, 98]
      ],
      valueTests: [['numericLike', 15]]
    }
  },

  sheriff_sales: {
    saleDate: {
      patterns: [
        [/^sale_?date$/i, 100],
        [/^auction_?date$/i, 98]
      ],
      valueTests: [['dateLike', 25]]
    },
    saleStatus: {
      patterns: [
        [/^sale_?status$/i, 100],
        [/^auction_?status$/i, 98],
        [/^status$/i, 85]
      ]
    },
    auctionId: {
      patterns: [
        [/^auction_?id$/i, 100],
        [/^sale_?id$/i, 95]
      ],
      valueTests: [['uniqueLike', 25]]
    }
  }
};

function cleanValue(value) {
  if (value === null || typeof value === 'undefined') {
    return '';
  }

  return String(value).trim();
}

function isNumeric(value) {
  const normalized = cleanValue(value).replace(/[$,%\s,]/g, '');

  return normalized !== '' && Number.isFinite(Number(normalized));
}

function isDateLike(value) {
  if (value instanceof Date) {
    return true;
  }

  const stringValue = cleanValue(value);

  if (!stringValue) {
    return false;
  }

  if (/^\d{10,13}$/.test(stringValue)) {
    return true;
  }

  return !Number.isNaN(Date.parse(stringValue));
}

function isZipLike(value) {
  return /^\d{5}(?:-\d{4})?$/.test(cleanValue(value));
}

function isAddressLike(value) {
  const stringValue = cleanValue(value);

  return (
    /\d/.test(stringValue) &&
    /[A-Za-z]/.test(stringValue) &&
    stringValue.length >= 5
  );
}

function isIdentifierLike(value) {
  const stringValue = cleanValue(value);

  return (
    stringValue.length >= 3 &&
    stringValue.length <= 60 &&
    /^[A-Za-z0-9 ._/-]+$/.test(stringValue)
  );
}

function isYearLike(value) {
  const number = Number(cleanValue(value));
  const currentYear = new Date().getFullYear();

  return (
    Number.isInteger(number) &&
    number >= 1600 &&
    number <= currentYear + 5
  );
}

function testValue(type, value) {
  switch (type) {
    case 'numericLike':
      return isNumeric(value);

    case 'dateLike':
      return isDateLike(value);

    case 'zipLike':
      return isZipLike(value);

    case 'addressLike':
      return isAddressLike(value);

    case 'identifierLike':
      return isIdentifierLike(value);

    case 'yearLike':
      return isYearLike(value);

    case 'mostlyText':
      return (
        cleanValue(value).length >= 2 &&
        /[A-Za-z]/.test(cleanValue(value))
      );

    default:
      return false;
  }
}

function collectFields(records) {
  const fields = new Set();

  for (const record of records) {
    for (const key of Object.keys(record || {})) {
      fields.add(key);
    }
  }

  return [...fields];
}

function valuesForField(records, field) {
  return records
    .map(record => record?.[field])
    .filter(value => cleanValue(value) !== '');
}

function uniquenessRatio(values) {
  if (!values.length) {
    return 0;
  }

  return new Set(values.map(cleanValue)).size / values.length;
}

function completenessRatio(records, field) {
  if (!records.length) {
    return 0;
  }

  const populated = records.filter(
    record => cleanValue(record?.[field]) !== ''
  ).length;

  return populated / records.length;
}

function scoreField(field, rule, records) {
  let score = 0;
  const reasons = [];

  for (const [pattern, points] of rule.patterns || []) {
    if (pattern.test(field)) {
      score += points;
      reasons.push(`name:${pattern}=${points}`);
      break;
    }
  }

  if (
    (
      rule === FIELD_RULES.parcelId ||
      rule === FIELD_RULES.sourceRecordId
    ) &&
    /address|street|city|zip|owner|name/i.test(field)
  ) {
    score -= 100;
    reasons.push('identifier-name-conflict=-100');
  }

  const values = valuesForField(records, field);
  const completeness = completenessRatio(records, field);

  if (completeness >= 0.95) {
    score += 20;
    reasons.push('complete>=95%=20');
  } else if (completeness >= 0.75) {
    score += 14;
    reasons.push('complete>=75%=14');
  } else if (completeness >= 0.5) {
    score += 8;
    reasons.push('complete>=50%=8');
  } else if (completeness > 0) {
    score += 2;
  }

  for (const [testType, points] of rule.valueTests || []) {
    const matching = values.filter(value =>
      testValue(testType, value)
    ).length;

    const ratio = values.length
      ? matching / values.length
      : 0;

    if (ratio >= 0.8) {
      score += points;
      reasons.push(`${testType}>=80%=${points}`);
    } else if (ratio >= 0.5) {
      score += Math.round(points * 0.55);
      reasons.push(`${testType}>=50%`);
    }
  }

  if (
    (rule.valueTests || []).some(
      ([type]) => type === 'uniqueLike'
    )
  ) {
    const uniqueRatio = uniquenessRatio(values);

    if (uniqueRatio >= 0.98) {
      score += 35;
      reasons.push('unique>=98%=35');
    } else if (uniqueRatio >= 0.9) {
      score += 22;
      reasons.push('unique>=90%=22');
    }
  }

  return {
    field,
    score,
    completeness,
    uniqueRatio: uniquenessRatio(values),
    sampleValues: values.slice(0, 3),
    reasons
  };
}

function mergeRules(dataset) {
  const rules = {
    ...FIELD_RULES,
    ...(DATASET_RULES[dataset] || {})
  };

  if (dataset === 'parcel_inventory') {
    return {
      ...rules,
      address: {
        ...rules.address,
        required: false
      },
      parcelId: {
        ...rules.parcelId,
        required: true
      },
      sourceRecordId: {
        ...rules.sourceRecordId,
        required: false
      }
    };
  }

  return rules;
}

export function inferFieldMapping(records, dataset, options = {}) {
  if (!Array.isArray(records) || !records.length) {
    throw new Error('Automatic mapping requires sample records.');
  }

  const minimumScore = Number(options.minimumScore || 65);
  const rules = mergeRules(dataset);
  const fields = collectFields(records);

  const mapping = {};
  const confidence = {};
  const rankedCandidates = {};
  const warnings = [];

  for (const [target, rule] of Object.entries(rules)) {
    const ranked = fields
      .map(field => scoreField(field, rule, records))
      .sort((left, right) => right.score - left.score);

    rankedCandidates[target] = ranked.slice(0, 5);

    const accepted = ranked.filter(
      candidate => candidate.score >= minimumScore
    );

    if (accepted.length) {
      mapping[target] = accepted
        .slice(0, Number(options.maxFields || 3))
        .map(candidate => candidate.field);

      confidence[target] = {
        score: accepted[0].score,
        primaryField: accepted[0].field,
        completeness: accepted[0].completeness,
        alternatives: accepted.slice(1, 3).map(item => item.field)
      };
    } else {
      mapping[target] = [];

      if (rule.required) {
        warnings.push(
          `No confident mapping found for required field ${target}.`
        );
      }
    }
  }

  const recordFilter = buildRecordFilter(mapping);

  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    dataset,
    sampleCount: records.length,
    sourceFields: fields,
    mapping,
    confidence,
    rankedCandidates,
    recordFilter,
    warnings
  };
}

function buildRecordFilter(mapping) {
  const requireAny = [];

  if (mapping.address?.length) {
    requireAny.push(mapping.address);
  }

  if (mapping.parcelId?.length) {
    requireAny.push(mapping.parcelId);
  } else if (mapping.sourceRecordId?.length) {
    requireAny.push(mapping.sourceRecordId);
  }

  return requireAny.length
    ? { requireAny }
    : null;
}

export function fetchArcGISRecords(
  endpoint,
  sampleCount = 25,
  options = {}
) {
  const url = new URL(endpoint);

  const sourceWhere = String(
    options.sourceQuery?.where || ''
  ).trim();

  url.searchParams.set(
    'where',
    sourceWhere || '1=1'
  );
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set(
    'resultRecordCount',
    String(sampleCount)
  );
  url.searchParams.set('resultOffset', '0');
  url.searchParams.set('f', 'json');

  return fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'REOS-Automatic-Field-Mapper/1.0'
    }
  })
    .then(async response => {
      const text = await response.text();

      if (!response.ok) {
        throw new Error(
          `ArcGIS sample request failed with HTTP ` +
          `${response.status}: ${text.slice(0, 400)}`
        );
      }

      const payload = JSON.parse(text);

      if (payload.error) {
        throw new Error(
          `ArcGIS sample error: ${JSON.stringify(payload.error)}`
        );
      }

      return (payload.features || []).map(feature =>
        feature?.attributes || feature
      );
    });
}

export async function fetchJSONRecords(
  endpoint,
  sampleCount = 25
) {
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'REOS-Automatic-Field-Mapper/1.0'
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `JSON sample request failed with HTTP ` +
      `${response.status}: ${text.slice(0, 400)}`
    );
  }

  const payload = JSON.parse(text);

  const records = Array.isArray(payload)
    ? payload
    : payload.records ||
      payload.results ||
      payload.data ||
      [];

  return records.slice(0, sampleCount);
}

export async function fetchSocrataRecords(
  endpoint,
  sampleCount = 25
) {
  const url = new URL(endpoint);

  url.searchParams.set('$limit', String(sampleCount));
  url.searchParams.set('$offset', '0');

  return fetchJSONRecords(url.toString(), sampleCount);
}

export async function fetchCSVRecords(
  endpoint,
  sampleCount = 25
) {
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'text/csv',
      'User-Agent': 'REOS-Automatic-Field-Mapper/1.0'
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `CSV sample request failed with HTTP ` +
      `${response.status}: ${text.slice(0, 400)}`
    );
  }

  const rows = parseCSV(text);

  if (!rows.length) {
    return [];
  }

  const headers = rows.shift();

  return rows.slice(0, sampleCount).map(row => {
    const record = {};

    headers.forEach((header, index) => {
      record[header] =
        typeof row[index] === 'undefined'
          ? ''
          : row[index];
    });

    return record;
  });
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === ',' && !quoted) {
      row.push(value);
      value = '';
      continue;
    }

    if (
      (character === '\n' || character === '\r') &&
      !quoted
    ) {
      if (character === '\r' && next === '\n') {
        index += 1;
      }

      row.push(value);
      value = '';

      if (row.some(cell => cell !== '')) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    value += character;
  }

  if (value !== '' || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

export async function fetchSampleRecords({
  adapter,
  endpoint,
  sampleCount
}) {
  switch (adapter) {
    case 'arcgis':
      return fetchArcGISRecords(endpoint, sampleCount);

    case 'socrata':
      return fetchSocrataRecords(endpoint, sampleCount);

    case 'json-api':
      return fetchJSONRecords(endpoint, sampleCount);

    case 'csv':
      return fetchCSVRecords(endpoint, sampleCount);

    default:
      throw new Error(
        `Automatic field mapping does not yet support ` +
        `adapter "${adapter}".`
      );
  }
}

export function saveMappingReport(report, outputPath) {
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
