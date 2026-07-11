/**
 * REOS Enterprise v4.2.0 - Intelligent Acquisition Platform
 * Sprint 6: lead ingestion, deduplication, scoring, promotion, daily runs,
 * market intelligence, recommendations, and scheduled automation.
 */
var REOS = REOS || {};

REOS.IntelligentAcquisition = (function () {
  var LEADS = 'IA_LEADS';
  var RUNS = 'IA_RUNS';
  var MARKETS = 'IA_MARKET_SCORES';
  var RECOMMENDATIONS = 'IA_RECOMMENDATIONS';
  var SOURCE_DISTRESS = 'DISTRESS_LEADS';

  var DEFAULTS = {
    promoteThreshold: 70,
    topLimit: 25,
    autoPromote: false,
    assignedTo: ''
  };

  function ensureSheets() {
    REOS.Database.ensureTable(LEADS, [
      'Lead ID','External ID','Source','Address','City','State','Zip','Owner Name',
      'Property Type','Distress Type','Tax Delinquent','Probate','Code Violation',
      'Vacant','Absentee Owner','Foreclosure','Equity %','Estimated Value',
      'Estimated Debt','Estimated Repairs','Asking Price','Motivation Score',
      'Financial Score','Market Score','Data Quality Score','Total Score','Grade',
      'Recommended Action','Status','Promoted Deal ID','Normalized Key',
      'Last Scored At','Created At','Updated At'
    ]);

    REOS.Database.ensureTable(RUNS, [
      'Run ID','Run Type','Status','Rows Found','Rows Imported','Duplicates',
      'Rows Scored','Rows Promoted','Top Score','Average Score','Errors JSON',
      'Summary JSON','Started At','Completed At','Created At'
    ]);

    REOS.Database.ensureTable(MARKETS, [
      'Market Score ID','City','State','Lead Count','Average Score','High Priority Leads',
      'Average Equity %','Projected Opportunity Value','Rank','Generated At'
    ]);

    REOS.Database.ensureTable(RECOMMENDATIONS, [
      'Recommendation ID','Lead ID','Deal ID','Priority','Category','Title','Message',
      'Status','Created At','Resolved At'
    ]);
  }

  function ingestDistressLeads() {
    ensureSheets();
    var sourceRows = safeAll_(SOURCE_DISTRESS);
    var existing = safeAll_(LEADS);
    var keys = {};
    existing.forEach(function (r) { keys[String(r['Normalized Key'] || '')] = true; });

    var imported = 0;
    var duplicates = 0;
    var errors = [];

    sourceRows.forEach(function (r) {
      try {
        var address = first_(r, ['Address','Property Address','Street Address']);
        var city = first_(r, ['City']);
        var state = first_(r, ['State']);
        var zip = first_(r, ['Zip','ZIP','Postal Code']);
        var key = normalizedKey_(address, city, state, zip);
        if (!key) return;
        if (keys[key]) { duplicates++; return; }

        REOS.Database.insert(LEADS, {
          'External ID': first_(r, ['Lead ID','External ID','Record ID']),
          Source: first_(r, ['Source','Source Name']) || SOURCE_DISTRESS,
          Address: address,
          City: city,
          State: state,
          Zip: zip,
          'Owner Name': first_(r, ['Owner Name','Seller Name','Owner']),
          'Property Type': first_(r, ['Property Type']) || 'Single Family',
          'Distress Type': first_(r, ['Distress Type','Signal','Lead Type']),
          'Tax Delinquent': bool_(first_(r, ['Tax Delinquent','Tax Delinquency'])),
          Probate: bool_(first_(r, ['Probate'])),
          'Code Violation': bool_(first_(r, ['Code Violation','Code Violations'])),
          Vacant: bool_(first_(r, ['Vacant','Vacancy'])),
          'Absentee Owner': bool_(first_(r, ['Absentee Owner','Absentee'])),
          Foreclosure: bool_(first_(r, ['Foreclosure','Pre-Foreclosure'])),
          'Equity %': num_(first_(r, ['Equity %','Equity Percentage'])),
          'Estimated Value': num_(first_(r, ['Estimated Value','Market Value','ARV'])),
          'Estimated Debt': num_(first_(r, ['Estimated Debt','Mortgage Balance'])),
          'Estimated Repairs': num_(first_(r, ['Estimated Repairs','Repairs'])),
          'Asking Price': num_(first_(r, ['Asking Price','Price'])),
          Status: 'New',
          'Normalized Key': key,
          'Created At': new Date(),
          'Updated At': new Date()
        }, { idField: 'Lead ID', idPrefix: 'IAL' });

        keys[key] = true;
        imported++;
      } catch (error) {
        errors.push({ row: r._rowNumber || '', message: error.message });
      }
    });

    return {
      ok: errors.length === 0,
      rowsFound: sourceRows.length,
      imported: imported,
      duplicates: duplicates,
      errors: errors
    };
  }

  function scoreLeadRecord_(lead) {
    var motivation = 0;
    if (bool_(lead['Tax Delinquent'])) motivation += 18;
    if (bool_(lead.Probate)) motivation += 18;
    if (bool_(lead['Code Violation'])) motivation += 14;
    if (bool_(lead.Vacant)) motivation += 14;
    if (bool_(lead['Absentee Owner'])) motivation += 12;
    if (bool_(lead.Foreclosure)) motivation += 20;
    motivation = clamp_(motivation, 0, 100);

    var value = num_(lead['Estimated Value']);
    var debt = num_(lead['Estimated Debt']);
    var repairs = num_(lead['Estimated Repairs']);
    var asking = num_(lead['Asking Price']);
    var equityPct = num_(lead['Equity %']);
    if (!equityPct && value > 0) equityPct = ((value - debt) / value) * 100;

    var financial = 0;
    financial += clamp_(equityPct, 0, 100) * 0.55;
    if (value > 0 && asking > 0) financial += clamp_(((value - asking) / value) * 100, 0, 100) * 0.30;
    if (value > 0) financial += clamp_((1 - repairs / value) * 100, 0, 100) * 0.15;
    financial = clamp_(financial, 0, 100);

    var market = marketFactor_(lead.City, lead.State);
    var quality = dataQuality_(lead);
    var total = Math.round((motivation * 0.40) + (financial * 0.35) + (market * 0.15) + (quality * 0.10));

    return {
      motivation: round_(motivation),
      financial: round_(financial),
      market: round_(market),
      quality: round_(quality),
      total: clamp_(total, 0, 100),
      grade: grade_(total),
      action: action_(total)
    };
  }

  function scoreAll() {
    ensureSheets();
    var leads = safeAll_(LEADS);
    var scored = 0;
    var scores = [];

    leads.forEach(function (lead) {
      if (String(lead.Status || '') === 'Archived') return;
      var score = scoreLeadRecord_(lead);
      REOS.Database.update(LEADS, 'Lead ID', lead['Lead ID'], {
        'Motivation Score': score.motivation,
        'Financial Score': score.financial,
        'Market Score': score.market,
        'Data Quality Score': score.quality,
        'Total Score': score.total,
        Grade: score.grade,
        'Recommended Action': score.action,
        Status: lead.Status === 'New' ? 'Scored' : lead.Status,
        'Last Scored At': new Date(),
        'Updated At': new Date()
      });
      scored++;
      scores.push(score.total);
    });

    rebuildMarketScores_();
    rebuildRecommendations_();

    return {
      ok: true,
      scored: scored,
      topScore: scores.length ? Math.max.apply(null, scores) : 0,
      averageScore: scores.length ? round_(scores.reduce(function (s, v) { return s + v; }, 0) / scores.length) : 0
    };
  }

  function promoteLead_(lead, assignedTo) {
    if (lead['Promoted Deal ID']) return { skipped: true, reason: 'Already promoted', dealId: lead['Promoted Deal ID'] };

    var deal = REOS.Database.insert('DEALS', {
      Address: lead.Address || '',
      City: lead.City || '',
      State: lead.State || '',
      Zip: lead.Zip || '',
      Source: 'Intelligent Acquisition: ' + (lead.Source || 'Unknown'),
      'Seller Name': lead['Owner Name'] || '',
      'Deal Status': 'New',
      'Assigned To': assignedTo || currentUser_(),
      'Created At': new Date(),
      'Updated At': new Date()
    }, { idField: 'Deal ID', idPrefix: 'DEAL' });

    REOS.Database.update(LEADS, 'Lead ID', lead['Lead ID'], {
      Status: 'Promoted',
      'Promoted Deal ID': deal['Deal ID'],
      'Updated At': new Date()
    });

    try {
      if (REOS.AcquisitionPipeline && REOS.AcquisitionPipeline.createForDeal) {
        REOS.AcquisitionPipeline.createForDeal(deal['Deal ID']);
      }
    } catch (e) {}

    try {
      if (REOS.AcquisitionWorkflow && REOS.AcquisitionWorkflow.runForDeal) {
        REOS.AcquisitionWorkflow.runForDeal(deal['Deal ID']);
      }
    } catch (e2) {}

    return { skipped: false, dealId: deal['Deal ID'], deal: deal };
  }

  function promoteTop(options) {
    ensureSheets();
    options = Object.assign({}, DEFAULTS, options || {});
    var leads = safeAll_(LEADS).filter(function (r) {
      return !r['Promoted Deal ID'] && num_(r['Total Score']) >= num_(options.promoteThreshold);
    }).sort(function (a, b) { return num_(b['Total Score']) - num_(a['Total Score']); })
      .slice(0, num_(options.topLimit) || 25);

    var promoted = [];
    var skipped = [];
    leads.forEach(function (lead) {
      try {
        var result = promoteLead_(lead, options.assignedTo);
        (result.skipped ? skipped : promoted).push(result);
      } catch (error) {
        skipped.push({ leadId: lead['Lead ID'], reason: error.message });
      }
    });

    return { ok: true, candidates: leads.length, promoted: promoted.length, skipped: skipped.length, deals: promoted, errors: skipped };
  }

  function dailyRun(options) {
    ensureSheets();
    options = Object.assign({}, DEFAULTS, options || {});
    var started = new Date();
    var run = REOS.Database.insert(RUNS, {
      'Run Type': 'Daily Acquisition Intelligence',
      Status: 'Running',
      'Started At': started,
      'Created At': started
    }, { idField: 'Run ID', idPrefix: 'IARUN' });

    var errors = [];
    var ingest = safeStep_(function () { return ingestDistressLeads(); }, errors, 'ingest');
    var scoring = safeStep_(function () { return scoreAll(); }, errors, 'score');
    var promotion = options.autoPromote
      ? safeStep_(function () { return promoteTop(options); }, errors, 'promote')
      : { ok: true, promoted: 0, candidates: 0 };
    var summary = buildSummary_();

    REOS.Database.update(RUNS, 'Run ID', run['Run ID'], {
      Status: errors.length ? 'Completed With Errors' : 'Complete',
      'Rows Found': num_(ingest.rowsFound),
      'Rows Imported': num_(ingest.imported),
      Duplicates: num_(ingest.duplicates),
      'Rows Scored': num_(scoring.scored),
      'Rows Promoted': num_(promotion.promoted),
      'Top Score': num_(scoring.topScore),
      'Average Score': num_(scoring.averageScore),
      'Errors JSON': JSON.stringify(errors),
      'Summary JSON': JSON.stringify(summary),
      'Completed At': new Date()
    });

    publish_('intelligent.acquisition.daily.completed', {
      runId: run['Run ID'], imported: ingest.imported || 0, scored: scoring.scored || 0, promoted: promotion.promoted || 0
    });

    return {
      ok: errors.length === 0,
      runId: run['Run ID'],
      ingest: ingest,
      scoring: scoring,
      promotion: promotion,
      summary: summary,
      errors: errors
    };
  }

  function summary() {
    ensureSheets();
    return buildSummary_();
  }

  function buildSummary_() {
    var leads = safeAll_(LEADS);
    var runs = safeAll_(RUNS);
    var recommendations = safeAll_(RECOMMENDATIONS);
    var scores = leads.map(function (r) { return num_(r['Total Score']); }).filter(function (v) { return v > 0; });
    var top = leads.slice().sort(function (a, b) { return num_(b['Total Score']) - num_(a['Total Score']); }).slice(0, 10).map(function (r) {
      return {
        leadId: r['Lead ID'], address: r.Address, city: r.City, state: r.State,
        score: num_(r['Total Score']), grade: r.Grade, action: r['Recommended Action'], status: r.Status
      };
    });

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      leads: leads.length,
      newLeads: count_(leads, 'Status', 'New'),
      scoredLeads: leads.filter(function (r) { return num_(r['Total Score']) > 0; }).length,
      highPriority: leads.filter(function (r) { return num_(r['Total Score']) >= 80; }).length,
      promoteReady: leads.filter(function (r) { return num_(r['Total Score']) >= DEFAULTS.promoteThreshold && !r['Promoted Deal ID']; }).length,
      promoted: leads.filter(function (r) { return !!r['Promoted Deal ID']; }).length,
      averageScore: scores.length ? round_(scores.reduce(function (s, v) { return s + v; }, 0) / scores.length) : 0,
      recommendations: recommendations.filter(function (r) { return String(r.Status || '') !== 'Resolved'; }).length,
      runs: runs.length,
      latestRun: runs.length ? runs[runs.length - 1] : null,
      topLeads: top
    };
  }

  function rebuildMarketScores_() {
    var sheet = REOS.Database.getSheet(MARKETS);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();

    var groups = {};
    safeAll_(LEADS).forEach(function (r) {
      var key = String(r.City || 'Unknown') + '|' + String(r.State || '');
      if (!groups[key]) groups[key] = { city: r.City || 'Unknown', state: r.State || '', rows: [] };
      groups[key].rows.push(r);
    });

    var markets = Object.keys(groups).map(function (key) {
      var g = groups[key];
      var rows = g.rows;
      var avg = average_(rows.map(function (r) { return num_(r['Total Score']); }));
      var eq = average_(rows.map(function (r) { return num_(r['Equity %']); }));
      var opportunity = rows.reduce(function (s, r) {
        return s + Math.max(0, num_(r['Estimated Value']) - num_(r['Asking Price']) - num_(r['Estimated Repairs']));
      }, 0);
      return { city: g.city, state: g.state, count: rows.length, avg: avg, high: rows.filter(function (r) { return num_(r['Total Score']) >= 80; }).length, equity: eq, opportunity: opportunity };
    }).sort(function (a, b) { return b.avg - a.avg; });

    markets.forEach(function (m, i) {
      REOS.Database.insert(MARKETS, {
        City: m.city, State: m.state, 'Lead Count': m.count, 'Average Score': round_(m.avg),
        'High Priority Leads': m.high, 'Average Equity %': round_(m.equity),
        'Projected Opportunity Value': round_(m.opportunity), Rank: i + 1, 'Generated At': new Date()
      }, { idField: 'Market Score ID', idPrefix: 'IAMKT' });
    });
  }

  function rebuildRecommendations_() {
    var sheet = REOS.Database.getSheet(RECOMMENDATIONS);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();

    safeAll_(LEADS).filter(function (r) { return num_(r['Total Score']) >= 70; })
      .sort(function (a, b) { return num_(b['Total Score']) - num_(a['Total Score']); })
      .slice(0, 50)
      .forEach(function (lead) {
        REOS.Database.insert(RECOMMENDATIONS, {
          'Lead ID': lead['Lead ID'],
          'Deal ID': lead['Promoted Deal ID'] || '',
          Priority: num_(lead['Total Score']) >= 85 ? 'Critical' : 'High',
          Category: 'Acquisition',
          Title: 'Prioritize ' + (lead.Address || lead['Lead ID']),
          Message: 'Score ' + num_(lead['Total Score']) + ' (' + (lead.Grade || '') + '). ' + (lead['Recommended Action'] || ''),
          Status: 'Open',
          'Created At': new Date()
        }, { idField: 'Recommendation ID', idPrefix: 'IAREC' });
      });
  }

  function installDailyTrigger(hour) {
    hour = Math.max(0, Math.min(23, Number(hour == null ? 7 : hour)));
    removeDailyTrigger();
    ScriptApp.newTrigger('reosIntelligentAcquisitionDailyRun')
      .timeBased().everyDays(1).atHour(hour).create();
    return { ok: true, hour: hour, handler: 'reosIntelligentAcquisitionDailyRun' };
  }

  function removeDailyTrigger() {
    var removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === 'reosIntelligentAcquisitionDailyRun') {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });
    return { ok: true, removed: removed };
  }

  function marketFactor_(city, state) {
    var key = (String(city || '') + ',' + String(state || '')).toLowerCase();
    var preferred = ['jacksonville,fl','orlando,fl','houston,tx','atlanta,ga','cleveland,oh','memphis,tn','detroit,mi','kansas city,mo','birmingham,al','charlotte,nc','indianapolis,in'];
    return preferred.indexOf(key) !== -1 ? 85 : 65;
  }

  function dataQuality_(lead) {
    var fields = ['Address','City','State','Zip','Owner Name','Estimated Value','Estimated Debt','Estimated Repairs','Asking Price'];
    var present = fields.filter(function (f) { return lead[f] !== '' && lead[f] !== null && lead[f] !== undefined; }).length;
    return Math.round((present / fields.length) * 100);
  }

  function grade_(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  }

  function action_(score) {
    if (score >= 85) return 'Call immediately and prepare offer strategy.';
    if (score >= 70) return 'Review today and verify ownership, condition, and price.';
    if (score >= 55) return 'Nurture and enrich missing data.';
    return 'Monitor or archive unless new distress signals appear.';
  }

  function first_(row, fields) {
    for (var i = 0; i < fields.length; i++) {
      if (row[fields[i]] !== '' && row[fields[i]] !== null && row[fields[i]] !== undefined) return row[fields[i]];
    }
    return '';
  }

  function normalizedKey_(address, city, state, zip) {
    var value = [address, city, state, zip].join('|').toLowerCase().replace(/[^a-z0-9|]/g, '');
    return value === '|||' ? '' : value;
  }

  function safeAll_(sheet) { try { return REOS.Database.getAll(sheet); } catch (e) { return []; } }
  function safeStep_(fn, errors, step) { try { return fn(); } catch (e) { errors.push({ step: step, message: e.message }); return { ok: false }; } }
  function num_(v) { var n = Number(v || 0); return isNaN(n) ? 0 : n; }
  function bool_(v) { return v === true || ['true','yes','y','1','x'].indexOf(String(v || '').toLowerCase()) !== -1; }
  function clamp_(v, min, max) { return Math.max(min, Math.min(max, Number(v || 0))); }
  function round_(v) { return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100; }
  function average_(values) { return values.length ? values.reduce(function (s, v) { return s + num_(v); }, 0) / values.length : 0; }
  function count_(rows, field, value) { return rows.filter(function (r) { return String(r[field] || '') === value; }).length; }
  function currentUser_() { try { return Session.getActiveUser().getEmail(); } catch (e) { return ''; } }
  function publish_(topic, payload) { try { if (REOS.PluginEventBus && REOS.PluginEventBus.publish) REOS.PluginEventBus.publish(topic, payload, 'intelligent-acquisition'); } catch (e) {} }

  return {
    ensureSheets: ensureSheets,
    ingestDistressLeads: ingestDistressLeads,
    scoreAll: scoreAll,
    promoteTop: promoteTop,
    dailyRun: dailyRun,
    summary: summary,
    installDailyTrigger: installDailyTrigger,
    removeDailyTrigger: removeDailyTrigger
  };
})();

function reosIntelligentAcquisitionEnsureSheets() { return REOS.IntelligentAcquisition.ensureSheets(); }
function reosIntelligentAcquisitionIngest() { return REOS.IntelligentAcquisition.ingestDistressLeads(); }
function reosIntelligentAcquisitionScoreAll() { return REOS.IntelligentAcquisition.scoreAll(); }
function reosIntelligentAcquisitionPromoteTop() { return REOS.IntelligentAcquisition.promoteTop({ promoteThreshold: 70, topLimit: 25 }); }
function reosIntelligentAcquisitionDailyRun() { return REOS.IntelligentAcquisition.dailyRun({ autoPromote: false, promoteThreshold: 70, topLimit: 25 }); }
function reosIntelligentAcquisitionSummary() { return REOS.IntelligentAcquisition.summary(); }
function reosIntelligentAcquisitionInstallTrigger() { return REOS.IntelligentAcquisition.installDailyTrigger(7); }
function reosIntelligentAcquisitionRemoveTrigger() { return REOS.IntelligentAcquisition.removeDailyTrigger(); }
