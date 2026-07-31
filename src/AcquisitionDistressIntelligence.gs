/*
 * REOS Enterprise v3.5.0
 * Acquisition Distress Intelligence Engine
 *
 * Adds parcel-level distress scoring, repair estimates, MAO/suggested offers,
 * Philadelphia dataset consolidation, and active AI acquisition outputs.
 */

var REOS = REOS || {};

REOS.AcquisitionDistressIntelligence = (function () {
  var VERSION = '3.5.0';
  var RUNS = 'AI_ACQUISITION_RUNS';
  var INTELLIGENCE = 'AI_DEAL_INTELLIGENCE';
  var DECISIONS = 'AI_ACQUISITION_DECISIONS';
  var OFFER_QUEUE = 'AI_OFFER_QUEUE';
  var SIGNALS = 'PHILADELPHIA_DISTRESS_SIGNALS';

  var DATASET_SHEETS = {
    TAX_DELINQUENT: 'PHILA_TAX_DELINQUENT',
    VACANT: 'PHILA_VACANT_PROPERTIES',
    CODE_VIOLATION: 'PHILA_CODE_VIOLATIONS',
    SHERIFF_SALE: 'PHILA_SHERIFF_SALES',
    DEMOLITION_PERMIT: 'PHILA_DEMOLITION_PERMITS',
    LI_VIOLATION: 'PHILA_LI_VIOLATIONS',
    PROBATE: 'PHILA_PROBATE',
    WATER_LIEN: 'PHILA_WATER_LIENS',
    ASSESSMENT: 'PHILA_ASSESSMENTS'
  };

  var OUTPUT_HEADERS = {
    AI_ACQUISITION_RUNS: [
      'Run ID','Started At','Completed At','Status','Source Sheets','Properties Scanned',
      'Properties Updated','Signals Matched','Decisions Created','Offers Queued','Errors','Version'
    ],
    AI_DEAL_INTELLIGENCE: [
      'Intelligence ID','Property Key','OPA Account','Deal ID','Address','City','State','Zip',
      'Distress Score','Distress Tier','Distress Signals','Signal Count','Estimated Repairs',
      'Repair $/Sq Ft','Repair Confidence','ARV','Holding Costs','Closing Costs','Desired Profit',
      'Suggested Offer','Equity Estimate','Equity %','Opportunity Score','Risk Level',
      'Recommended Strategy','Reasoning','Source Sheet','Source Row','Updated At'
    ],
    AI_ACQUISITION_DECISIONS: [
      'Decision ID','Property Key','Deal ID','Address','Decision','Priority','Opportunity Score',
      'Distress Score','Suggested Offer','ARV','Estimated Repairs','Risk Level','Strategy',
      'Reasoning','Next Action','Decision At','Updated At'
    ],
    AI_OFFER_QUEUE: [
      'Queue ID','Property Key','Deal ID','Address','Priority','Status','Offer Type',
      'Suggested Offer','ARV','Estimated Repairs','Distress Score','Opportunity Score',
      'Owner Name','Owner Mailing Address','Phone','Email','Reasoning','Queued At','Updated At'
    ],
    PHILADELPHIA_DISTRESS_SIGNALS: [
      'Signal ID','Property Key','OPA Account','Address','Signal Type','Signal Weight',
      'Signal Date','Source Dataset','Source Record ID','Details','Imported At','Updated At'
    ]
  };

  var TARGET_COLUMNS = [
    'Distress Score','Distress Tier','Distress Signals','Estimated Repairs',
    'Repair $/Sq Ft','Repair Confidence','ARV','Holding Costs','Closing Costs',
    'Desired Profit','Suggested Offer','Opportunity Score','AI Decision','AI Reasoning',
    'Intelligence Updated At'
  ];

  var SIGNAL_WEIGHTS = {
    ABSENTEE_OWNER: 25,
    TAX_DELINQUENT: 40,
    VACANT: 35,
    CODE_VIOLATION: 30,
    LI_VIOLATION: 30,
    PROBATE: 30,
    SHERIFF_SALE: 60,
    DEMOLITION_PERMIT: 45,
    WATER_LIEN: 25,
    LOW_ASSESSED_VALUE: 10,
    HIGH_EQUITY: 20
  };

  function ensureSheets() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(OUTPUT_HEADERS).forEach(function (name) {
      ensureSheet_(ss, name, OUTPUT_HEADERS[name]);
    });
    Object.keys(DATASET_SHEETS).forEach(function (key) {
      ensureSheet_(ss, DATASET_SHEETS[key], [
        'Property Key','OPA Account','Address','Record ID','Record Date','Details','Imported At'
      ]);
    });
    return { ok: true, version: VERSION, message: 'Acquisition intelligence sheets ready.' };
  }

  function run(options) {
    options = options || {};
    ensureSheets();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var started = new Date();
    var runId = id_('AIRUN');
    var errors = [];
    var sourceSheets = findPropertySheets_(ss, options.sourceSheets);
    var signalIndex = buildSignalIndex_(ss);
    var stats = {
      propertiesScanned: 0,
      propertiesUpdated: 0,
      signalsMatched: 0,
      decisionsCreated: 0,
      offersQueued: 0
    };

    sourceSheets.forEach(function (sheet) {
      try {
        var result = processSheet_(sheet, signalIndex, runId, options);
        stats.propertiesScanned += result.scanned;
        stats.propertiesUpdated += result.updated;
        stats.signalsMatched += result.signals;
        stats.decisionsCreated += result.decisions;
        stats.offersQueued += result.offers;
      } catch (error) {
        errors.push(sheet.getName() + ': ' + error.message);
      }
    });

    var completed = new Date();
    upsertByKey_(ss.getSheetByName(RUNS), 'Run ID', {
      'Run ID': runId,
      'Started At': started,
      'Completed At': completed,
      'Status': errors.length ? 'Completed With Errors' : 'Completed',
      'Source Sheets': sourceSheets.map(function (s) { return s.getName(); }).join(', '),
      'Properties Scanned': stats.propertiesScanned,
      'Properties Updated': stats.propertiesUpdated,
      'Signals Matched': stats.signalsMatched,
      'Decisions Created': stats.decisionsCreated,
      'Offers Queued': stats.offersQueued,
      'Errors': errors.join('\n'),
      'Version': VERSION
    });

    var summary = {
      ok: errors.length === 0,
      runId: runId,
      status: errors.length ? 'Completed With Errors' : 'Completed',
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      sourceSheets: sourceSheets.map(function (s) { return s.getName(); }),
      stats: stats,
      errors: errors
    };
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  function processSheet_(sheet, signalIndex, runId, options) {
    var data = readTable_(sheet);
    if (!data.rows.length) return { scanned: 0, updated: 0, signals: 0, decisions: 0, offers: 0 };

    ensureColumns_(sheet, TARGET_COLUMNS);
    data = readTable_(sheet);
    var output = [];
    var stats = { scanned: 0, updated: 0, signals: 0, decisions: 0, offers: 0 };

    data.rows.forEach(function (row, index) {
      if (isBlankRow_(row)) return;
      stats.scanned++;
      var profile = buildProfile_(row, sheet.getName(), index + 2, signalIndex, options);
      stats.signals += profile.signalCount;
      output.push({ rowNumber: index + 2, profile: profile });
      writeIntelligence_(profile);
      writeDecision_(profile);
      stats.decisions++;
      if (profile.queueOffer) {
        writeOfferQueue_(profile);
        stats.offers++;
      }
      stats.updated++;
    });

    writeProfilesToSource_(sheet, data.headers, output);
    return stats;
  }

  function buildProfile_(row, sourceSheet, sourceRow, signalIndex, options) {
    var propertyKey = propertyKey_(row);
    var signals = (signalIndex[propertyKey] || []).slice();
    addInlineSignals_(signals, row);
    signals = dedupeSignals_(signals);

    var distress = distressScore_(row, signals);
    var repairs = estimateRepairs_(row, options);
    var arv = firstNumber_(row, ['ARV','After Repair Value','Estimated ARV','Market Value','Market Value Estimate','Estimated Market Value']);
    var assessed = firstNumber_(row, ['Assessed Value','Market Value','Total Assessment','Total Assessed Value']);
    if (!arv) arv = assessed > 0 ? round_(assessed * 1.18) : 0;

    var holding = firstNumber_(row, ['Holding Costs','Holding Cost']);
    if (!holding && arv) holding = round_(arv * 0.03);
    var closing = firstNumber_(row, ['Closing Costs','Closing Cost']);
    if (!closing && arv) closing = round_(arv * 0.025);
    var desiredProfit = firstNumber_(row, ['Desired Profit','Target Profit']);
    if (!desiredProfit && arv) desiredProfit = round_(Math.max(arv * 0.15, 15000));

    var suggestedOffer = Math.max(0, round_(arv - repairs.amount - holding - closing - desiredProfit));
    var mortgage = firstNumber_(row, ['Mortgage Balance','Estimated Mortgage Balance','Loan Balance']);
    var equity = arv > 0 ? Math.max(0, round_(arv - mortgage)) : 0;
    var equityPct = arv > 0 ? round2_(equity / arv * 100) : 0;
    var opportunity = opportunityScore_(distress.score, equityPct, arv, suggestedOffer, repairs.confidence);
    var decision = decision_(opportunity, distress.score, suggestedOffer, arv, repairs.amount);
    var strategy = strategy_(row, distress.score, equityPct, repairs.amount, arv);
    var risk = risk_(distress.score, repairs.confidence, arv, suggestedOffer);
    var address = firstText_(row, ['Address','Property Address','Street Address','Location']);
    var dealId = firstText_(row, ['Deal ID','Lead ID','Property ID']);

    return {
      runId: options.runId || '',
      propertyKey: propertyKey,
      opaAccount: firstText_(row, ['OPA Account','OPA Number','Parcel Number','Parcel ID','Account Number']),
      dealId: dealId,
      address: address,
      city: firstText_(row, ['City']) || 'Philadelphia',
      state: firstText_(row, ['State']) || 'PA',
      zip: firstText_(row, ['Zip','ZIP','Zip Code','Postal Code']),
      ownerName: firstText_(row, ['Owner Name','Owner','Seller Name']),
      ownerMailingAddress: firstText_(row, ['Owner Mailing Address','Mailing Address']),
      phone: firstText_(row, ['Phone','Owner Phone','Seller Phone']),
      email: firstText_(row, ['Email','Owner Email','Seller Email']),
      sourceSheet: sourceSheet,
      sourceRow: sourceRow,
      distressScore: distress.score,
      distressTier: distress.tier,
      signals: distress.signals,
      signalCount: distress.signals.length,
      estimatedRepairs: repairs.amount,
      repairPerSqFt: repairs.perSqFt,
      repairConfidence: repairs.confidence,
      arv: arv,
      holdingCosts: holding,
      closingCosts: closing,
      desiredProfit: desiredProfit,
      suggestedOffer: suggestedOffer,
      equityEstimate: equity,
      equityPercent: equityPct,
      opportunityScore: opportunity,
      riskLevel: risk,
      strategy: strategy,
      decision: decision.decision,
      priority: decision.priority,
      nextAction: decision.nextAction,
      reasoning: reasoning_(distress, repairs, arv, suggestedOffer, equityPct, opportunity, strategy),
      queueOffer: decision.decision === 'BUY' && suggestedOffer > 0
    };
  }

  function distressScore_(row, signals) {
    var score = 0;
    var labels = [];
    signals.forEach(function (signal) {
      score += number_(signal.weight);
      labels.push(signal.type);
    });

    if (truthyField_(row, ['Absentee Owner','Absentee','Owner Occupied'], true)) {
      score += SIGNAL_WEIGHTS.ABSENTEE_OWNER;
      labels.push('ABSENTEE_OWNER');
    }

    var assessed = firstNumber_(row, ['Assessed Value','Total Assessment','Market Value']);
    if (assessed > 0 && assessed < 75000) {
      score += SIGNAL_WEIGHTS.LOW_ASSESSED_VALUE;
      labels.push('LOW_ASSESSED_VALUE');
    }

    var market = firstNumber_(row, ['ARV','Market Value','Estimated Market Value']);
    var mortgage = firstNumber_(row, ['Mortgage Balance','Estimated Mortgage Balance','Loan Balance']);
    if (market > 0 && (market - mortgage) / market >= 0.5) {
      score += SIGNAL_WEIGHTS.HIGH_EQUITY;
      labels.push('HIGH_EQUITY');
    }

    score = Math.min(100, Math.round(score));
    return {
      score: score,
      tier: score >= 80 ? 'Critical' : score >= 60 ? 'High' : score >= 35 ? 'Moderate' : score > 0 ? 'Low' : 'None',
      signals: unique_(labels)
    };
  }

  function estimateRepairs_(row, options) {
    options = options || {};
    var sqft = firstNumber_(row, ['Square Feet','Sq Ft','Building Sq Ft','Living Area','Gross Area']);
    var year = firstNumber_(row, ['Year Built','Built Year']);
    var buildingClass = firstText_(row, ['Building Class','Class','Property Class']).toUpperCase();
    var permits = firstNumber_(row, ['Permit Count','Permits','Permit History Count']);
    var neighborhoodRate = firstNumber_(row, ['Neighborhood Repair $/Sq Ft','Neighborhood Repair Rate','Average Repair $/Sq Ft']);

    var rate = neighborhoodRate || 28;
    if (year && year < 1920) rate += 22;
    else if (year && year < 1950) rate += 16;
    else if (year && year < 1980) rate += 10;
    else if (year && year < 2000) rate += 5;

    if (/D|POOR|HEAVY|DETERIORATED/.test(buildingClass)) rate += 20;
    else if (/C|FAIR|AVERAGE/.test(buildingClass)) rate += 8;
    else if (/A|B|GOOD|EXCELLENT/.test(buildingClass)) rate -= 4;

    if (permits >= 5) rate += 8;
    else if (permits >= 2) rate += 4;

    rate = Math.max(12, Math.min(95, rate));
    var fallbackSqft = firstNumber_(row, ['Lot Area','Lot Sq Ft']) || 1200;
    var usedSqft = sqft || Math.min(2500, Math.max(700, fallbackSqft * 0.35));
    var amount = round_(usedSqft * rate);
    var confidence = sqft && year ? 'High' : sqft || year ? 'Medium' : 'Low';
    return { amount: amount, perSqFt: round2_(rate), confidence: confidence };
  }

  function opportunityScore_(distress, equityPct, arv, offer, repairConfidence) {
    var score = distress * 0.45;
    score += Math.min(25, Math.max(0, equityPct) * 0.35);
    if (arv > 0 && offer > 0) score += Math.min(20, Math.max(0, (arv - offer) / arv * 30));
    score += repairConfidence === 'High' ? 10 : repairConfidence === 'Medium' ? 6 : 2;
    return Math.min(100, Math.round(score));
  }

  function decision_(opportunity, distress, offer, arv, repairs) {
    if (opportunity >= 70 && offer > 0) return { decision: 'BUY', priority: 'P1', nextAction: 'Prepare outreach and review offer.' };
    if (opportunity >= 50) return { decision: 'REVIEW', priority: 'P2', nextAction: 'Verify ownership, ARV, repairs, and title.' };
    if (distress >= 50 && !arv) return { decision: 'RESEARCH', priority: 'P2', nextAction: 'Obtain ARV and property condition data.' };
    return { decision: 'PASS', priority: 'P3', nextAction: 'Monitor for new distress signals.' };
  }

  function strategy_(row, distress, equityPct, repairs, arv) {
    if (equityPct >= 60 && distress >= 50) return 'Wholesale';
    if (arv > 0 && repairs / arv <= 0.18) return 'Light Rehab / Wholetail';
    if (arv > 0 && repairs / arv <= 0.35) return 'Fix and Flip';
    if (firstNumber_(row, ['Monthly Rent','Rent Estimate']) > 0) return 'Rental / BRRRR';
    return 'Direct Acquisition Review';
  }

  function risk_(distress, confidence, arv, offer) {
    if (!arv || !offer || confidence === 'Low') return 'High';
    if (distress >= 75 || confidence === 'Medium') return 'Medium';
    return 'Low';
  }

  function reasoning_(distress, repairs, arv, offer, equityPct, opportunity, strategy) {
    return [
      'Distress ' + distress.score + '/100 (' + distress.tier + ') from ' + (distress.signals.join(', ') || 'no confirmed signals') + '.',
      'Repairs estimated at $' + repairs.amount + ' ($' + repairs.perSqFt + '/sq ft, ' + repairs.confidence + ' confidence).',
      'ARV $' + arv + '; suggested offer $' + offer + '; estimated equity ' + equityPct + '%.',
      'Opportunity score ' + opportunity + '/100. Recommended strategy: ' + strategy + '.'
    ].join(' ');
  }

  function writeProfilesToSource_(sheet, headers, output) {
    var refreshed = readTable_(sheet);
    var map = headerMap_(refreshed.headers);
    output.forEach(function (item) {
      var p = item.profile;
      var values = {
        'Distress Score': p.distressScore,
        'Distress Tier': p.distressTier,
        'Distress Signals': p.signals.join(', '),
        'Estimated Repairs': p.estimatedRepairs,
        'Repair $/Sq Ft': p.repairPerSqFt,
        'Repair Confidence': p.repairConfidence,
        'ARV': p.arv,
        'Holding Costs': p.holdingCosts,
        'Closing Costs': p.closingCosts,
        'Desired Profit': p.desiredProfit,
        'Suggested Offer': p.suggestedOffer,
        'Opportunity Score': p.opportunityScore,
        'AI Decision': p.decision,
        'AI Reasoning': p.reasoning,
        'Intelligence Updated At': new Date()
      };
      Object.keys(values).forEach(function (header) {
        sheet.getRange(item.rowNumber, map[normalize_(header)] + 1).setValue(values[header]);
      });
    });
  }

  function writeIntelligence_(p) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    upsertByKey_(ss.getSheetByName(INTELLIGENCE), 'Property Key', {
      'Intelligence ID': idFromKey_('INTEL', p.propertyKey),
      'Property Key': p.propertyKey,
      'OPA Account': p.opaAccount,
      'Deal ID': p.dealId,
      'Address': p.address,
      'City': p.city,
      'State': p.state,
      'Zip': p.zip,
      'Distress Score': p.distressScore,
      'Distress Tier': p.distressTier,
      'Distress Signals': p.signals.join(', '),
      'Signal Count': p.signalCount,
      'Estimated Repairs': p.estimatedRepairs,
      'Repair $/Sq Ft': p.repairPerSqFt,
      'Repair Confidence': p.repairConfidence,
      'ARV': p.arv,
      'Holding Costs': p.holdingCosts,
      'Closing Costs': p.closingCosts,
      'Desired Profit': p.desiredProfit,
      'Suggested Offer': p.suggestedOffer,
      'Equity Estimate': p.equityEstimate,
      'Equity %': p.equityPercent,
      'Opportunity Score': p.opportunityScore,
      'Risk Level': p.riskLevel,
      'Recommended Strategy': p.strategy,
      'Reasoning': p.reasoning,
      'Source Sheet': p.sourceSheet,
      'Source Row': p.sourceRow,
      'Updated At': new Date()
    });
  }

  function writeDecision_(p) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    upsertByKey_(ss.getSheetByName(DECISIONS), 'Property Key', {
      'Decision ID': idFromKey_('DEC', p.propertyKey),
      'Property Key': p.propertyKey,
      'Deal ID': p.dealId,
      'Address': p.address,
      'Decision': p.decision,
      'Priority': p.priority,
      'Opportunity Score': p.opportunityScore,
      'Distress Score': p.distressScore,
      'Suggested Offer': p.suggestedOffer,
      'ARV': p.arv,
      'Estimated Repairs': p.estimatedRepairs,
      'Risk Level': p.riskLevel,
      'Strategy': p.strategy,
      'Reasoning': p.reasoning,
      'Next Action': p.nextAction,
      'Decision At': new Date(),
      'Updated At': new Date()
    });
  }

  function writeOfferQueue_(p) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    upsertByKey_(ss.getSheetByName(OFFER_QUEUE), 'Property Key', {
      'Queue ID': idFromKey_('OQ', p.propertyKey),
      'Property Key': p.propertyKey,
      'Deal ID': p.dealId,
      'Address': p.address,
      'Priority': p.priority,
      'Status': 'Ready For Review',
      'Offer Type': 'Cash',
      'Suggested Offer': p.suggestedOffer,
      'ARV': p.arv,
      'Estimated Repairs': p.estimatedRepairs,
      'Distress Score': p.distressScore,
      'Opportunity Score': p.opportunityScore,
      'Owner Name': p.ownerName,
      'Owner Mailing Address': p.ownerMailingAddress,
      'Phone': p.phone,
      'Email': p.email,
      'Reasoning': p.reasoning,
      'Queued At': new Date(),
      'Updated At': new Date()
    });
  }

  function mergeDataset(datasetType, rows, options) {
    options = options || {};
    ensureSheets();
    datasetType = String(datasetType || '').toUpperCase().replace(/[\s-]+/g, '_');
    if (!DATASET_SHEETS[datasetType]) throw new Error('Unsupported dataset type: ' + datasetType);
    if (!Array.isArray(rows)) throw new Error('rows must be an array of objects.');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rawSheet = ss.getSheetByName(DATASET_SHEETS[datasetType]);
    var signalSheet = ss.getSheetByName(SIGNALS);
    var weight = SIGNAL_WEIGHTS[datasetType] || 0;
    var imported = 0;

    rows.forEach(function (row) {
      var key = propertyKey_(row);
      if (!key) return;
      var recordId = firstText_(row, ['Record ID','ID','Violation ID','Case ID','Account Number']) || idFromKey_(datasetType, key);
      var address = firstText_(row, ['Address','Property Address','Street Address','Location']);
      var date = firstText_(row, ['Record Date','Date','Violation Date','Sale Date','Filing Date','Permit Date']);
      var details = firstText_(row, ['Details','Description','Violation','Status','Notes']) || JSON.stringify(row).slice(0, 1500);

      upsertByKey_(rawSheet, 'Record ID', {
        'Property Key': key,
        'OPA Account': firstText_(row, ['OPA Account','OPA Number','Parcel Number','Parcel ID','Account Number']),
        'Address': address,
        'Record ID': recordId,
        'Record Date': date,
        'Details': details,
        'Imported At': new Date()
      });

      upsertByKey_(signalSheet, 'Signal ID', {
        'Signal ID': datasetType + '-' + recordId,
        'Property Key': key,
        'OPA Account': firstText_(row, ['OPA Account','OPA Number','Parcel Number','Parcel ID','Account Number']),
        'Address': address,
        'Signal Type': datasetType,
        'Signal Weight': weight,
        'Signal Date': date,
        'Source Dataset': DATASET_SHEETS[datasetType],
        'Source Record ID': recordId,
        'Details': details,
        'Imported At': new Date(),
        'Updated At': new Date()
      });
      imported++;
    });

    var result = { ok: true, datasetType: datasetType, rowsImported: imported };
    if (options.runAfterMerge !== false) result.intelligenceRun = run({});
    return result;
  }

  function installTrigger() {
    removeTriggers();
    ScriptApp.newTrigger('reosAcquisitionIntelligenceScheduledRun')
      .timeBased()
      .everyHours(1)
      .create();
    return { ok: true, message: 'Hourly acquisition intelligence trigger installed.' };
  }

  function removeTriggers() {
    var names = ['reosAcquisitionIntelligenceScheduledRun'];
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (names.indexOf(trigger.getHandlerFunction()) !== -1) {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });
    return { ok: true, removed: removed };
  }

  function summary() {
    ensureSheets();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var intel = readTable_(ss.getSheetByName(INTELLIGENCE)).rows;
    var decisions = readTable_(ss.getSheetByName(DECISIONS)).rows;
    var queue = readTable_(ss.getSheetByName(OFFER_QUEUE)).rows;
    return {
      ok: true,
      intelligenceProfiles: intel.length,
      buy: decisions.filter(function (r) { return String(r.Decision) === 'BUY'; }).length,
      review: decisions.filter(function (r) { return String(r.Decision) === 'REVIEW'; }).length,
      research: decisions.filter(function (r) { return String(r.Decision) === 'RESEARCH'; }).length,
      pass: decisions.filter(function (r) { return String(r.Decision) === 'PASS'; }).length,
      offerQueue: queue.length,
      averageDistressScore: average_(intel, 'Distress Score'),
      averageOpportunityScore: average_(intel, 'Opportunity Score'),
      updatedAt: new Date().toISOString()
    };
  }

  function buildSignalIndex_(ss) {
    var rows = readTable_(ss.getSheetByName(SIGNALS)).rows;
    var index = {};
    rows.forEach(function (row) {
      var key = String(row['Property Key'] || '');
      if (!key) return;
      index[key] = index[key] || [];
      index[key].push({
        type: String(row['Signal Type'] || ''),
        weight: number_(row['Signal Weight']),
        date: row['Signal Date'],
        source: row['Source Dataset']
      });
    });
    return index;
  }

  function addInlineSignals_(signals, row) {
    var mappings = [
      ['Tax Delinquent','TAX_DELINQUENT'],['Tax Delinquency','TAX_DELINQUENT'],
      ['Vacant','VACANT'],['Vacancy Status','VACANT'],
      ['Code Violations','CODE_VIOLATION'],['Violation Count','CODE_VIOLATION'],
      ['L&I Violations','LI_VIOLATION'],['LI Violations','LI_VIOLATION'],
      ['Probate','PROBATE'],['Probate Flag','PROBATE'],
      ['Sheriff Sale','SHERIFF_SALE'],['Sheriff Sale Flag','SHERIFF_SALE'],
      ['Demolition Permit','DEMOLITION_PERMIT'],['Water Lien','WATER_LIEN']
    ];
    mappings.forEach(function (mapping) {
      var value = firstValue_(row, [mapping[0]]);
      if (isPositiveSignal_(value)) signals.push({ type: mapping[1], weight: SIGNAL_WEIGHTS[mapping[1]] || 0 });
    });
  }

  function findPropertySheets_(ss, requested) {
    var excluded = {};
    Object.keys(OUTPUT_HEADERS).forEach(function (name) { excluded[name] = true; });
    Object.keys(DATASET_SHEETS).forEach(function (key) { excluded[DATASET_SHEETS[key]] = true; });
    if (Array.isArray(requested) && requested.length) {
      return requested.map(function (name) { return ss.getSheetByName(name); }).filter(Boolean);
    }
    return ss.getSheets().filter(function (sheet) {
      if (excluded[sheet.getName()]) return false;
      var headers = readHeaders_(sheet);
      var normalized = headers.map(normalize_);
      var hasPropertyKey = ['opaaccount','opanumber','parcelnumber','parcelid','propertykey','address','propertyaddress','dealid'].some(function (key) {
        return normalized.indexOf(key) !== -1;
      });
      var hasTarget = ['distressscore','estimatedrepairs','suggestedoffer'].some(function (key) {
        return normalized.indexOf(key) !== -1;
      });
      var likelySource = /LEAD|PROPERTY|ASSESS|DEAL|ACQUISITION|PHILA/i.test(sheet.getName());
      return hasPropertyKey && (hasTarget || likelySource);
    });
  }

  function ensureSheet_(ss, name, headers) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    ensureColumns_(sheet, headers);
    sheet.setFrozenRows(1);
    return sheet;
  }

  function ensureColumns_(sheet, columns) {
    var headers = readHeaders_(sheet);
    if (!headers.length) {
      sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
      return;
    }
    var normalized = headers.map(normalize_);
    var additions = columns.filter(function (column) { return normalized.indexOf(normalize_(column)) === -1; });
    if (additions.length) sheet.getRange(1, headers.length + 1, 1, additions.length).setValues([additions]);
  }

  function readHeaders_(sheet) {
    if (!sheet || sheet.getLastColumn() < 1) return [];
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (v) { return String(v || '').trim(); });
  }

  function readTable_(sheet) {
    if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return { headers: [], rows: [] };
    var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    var headers = values.shift().map(function (v) { return String(v || '').trim(); });
    return {
      headers: headers,
      rows: values.map(function (valuesRow) {
        var row = {};
        headers.forEach(function (header, index) { row[header] = valuesRow[index]; });
        return row;
      })
    };
  }

  function upsertByKey_(sheet, keyHeader, record) {
    ensureColumns_(sheet, Object.keys(record));
    var table = readTable_(sheet);
    var map = headerMap_(table.headers);
    var key = String(record[keyHeader] || '');
    var rowNumber = 0;
    table.rows.some(function (row, index) {
      if (String(row[keyHeader] || '') === key) {
        rowNumber = index + 2;
        return true;
      }
      return false;
    });
    var values = table.headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : (rowNumber ? table.rows[rowNumber - 2][header] : '');
    });
    if (rowNumber) sheet.getRange(rowNumber, 1, 1, table.headers.length).setValues([values]);
    else sheet.appendRow(values);
  }

  function headerMap_(headers) {
    var map = {};
    headers.forEach(function (header, index) { map[normalize_(header)] = index; });
    return map;
  }

  function propertyKey_(row) {
    var parcel = firstText_(row, ['Property Key','OPA Account','OPA Number','Parcel Number','Parcel ID','Account Number']);
    if (parcel) return normalizeKey_(parcel);
    var address = firstText_(row, ['Address','Property Address','Street Address','Location']);
    var zip = firstText_(row, ['Zip','ZIP','Zip Code','Postal Code']);
    return normalizeKey_(address + '|' + zip);
  }

  function firstValue_(row, aliases) {
    var keys = Object.keys(row || {});
    for (var i = 0; i < aliases.length; i++) {
      var target = normalize_(aliases[i]);
      for (var j = 0; j < keys.length; j++) {
        if (normalize_(keys[j]) === target && row[keys[j]] !== '' && row[keys[j]] !== null && row[keys[j]] !== undefined) return row[keys[j]];
      }
    }
    return '';
  }

  function firstText_(row, aliases) { return String(firstValue_(row, aliases) || '').trim(); }
  function firstNumber_(row, aliases) { return number_(firstValue_(row, aliases)); }
  function truthyField_(row, aliases, absenteeMode) {
    var value = firstValue_(row, aliases);
    if (absenteeMode && normalize_(aliases[aliases.length - 1]) === 'owneroccupied') {
      var ownerOccupied = String(value || '').toLowerCase();
      if (ownerOccupied === 'no' || ownerOccupied === 'false' || ownerOccupied === '0') return true;
    }
    return isPositiveSignal_(value);
  }

  function isPositiveSignal_(value) {
    if (value === true) return true;
    if (typeof value === 'number') return value > 0;
    var text = String(value || '').toLowerCase().trim();
    return ['yes','true','y','1','active','open','delinquent','vacant','probate','scheduled','pending'].indexOf(text) !== -1 || number_(value) > 0;
  }

  function number_(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    var parsed = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
    return isFinite(parsed) ? parsed : 0;
  }

  function normalize_(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function normalizeKey_(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function round_(value) { return Math.round(number_(value)); }
  function round2_(value) { return Math.round(number_(value) * 100) / 100; }
  function unique_(values) { return values.filter(function (v, i, a) { return v && a.indexOf(v) === i; }); }
  function dedupeSignals_(signals) {
    var seen = {};
    return signals.filter(function (signal) {
      var key = String(signal.type || '');
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function isBlankRow_(row) { return !Object.keys(row).some(function (key) { return row[key] !== '' && row[key] !== null; }); }
  function id_(prefix) { return prefix + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 10000); }
  function idFromKey_(prefix, key) { return prefix + '-' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, key)).replace(/=/g, '').slice(0, 18); }
  function average_(rows, field) {
    var values = rows.map(function (r) { return number_(r[field]); }).filter(function (v) { return v > 0; });
    return values.length ? round2_(values.reduce(function (a, b) { return a + b; }, 0) / values.length) : 0;
  }

  return {
    ensureSheets: ensureSheets,
    run: run,
    mergeDataset: mergeDataset,
    installTrigger: installTrigger,
    removeTriggers: removeTriggers,
    summary: summary
  };
})();

function reosAcquisitionIntelligenceEnsureSheets() {
  return REOS.AcquisitionDistressIntelligence.ensureSheets();
}

function reosAcquisitionIntelligenceRun() {
  return REOS.AcquisitionDistressIntelligence.run({});
}

function reosAcquisitionIntelligenceScheduledRun() {
  return REOS.AcquisitionDistressIntelligence.run({});
}

function reosAcquisitionIntelligenceMergePhiladelphiaDataset(datasetType, rows, options) {
  return REOS.AcquisitionDistressIntelligence.mergeDataset(datasetType, rows, options || {});
}

function reosAcquisitionIntelligenceInstallTrigger() {
  return REOS.AcquisitionDistressIntelligence.installTrigger();
}

function reosAcquisitionIntelligenceRemoveTriggers() {
  return REOS.AcquisitionDistressIntelligence.removeTriggers();
}

function reosAcquisitionIntelligenceSummary() {
  return REOS.AcquisitionDistressIntelligence.summary();
}
