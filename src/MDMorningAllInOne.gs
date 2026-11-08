/**
 * REOS Maryland six-hour scheduler + morning evidence bridge, v1.
 * STAGED: code load does not run/import/install/export anything.
 *
 * ONE operator entry point AFTER separate project identity + authorization:
 *   REOS_MD_MORNING_INSTALL_ALL()
 *
 * In scope: existing MD 24-jurisdiction property_assessment scheduler only.
 * No PA/NJ/DE trigger deletion, no legacy digest modification, no offers.
 */
var REOS = REOS || {};
REOS.MDMorningAllInOne = (function () {
  var P = 'REOS_MD_MORNING_V1_';
  var S = 'REOS_MD_6H_V1_';
  var NAME = 'REOS_MD_Morning_Evidence.json';
  var SIX = 'REOS_MD_MORNING_SIX_HOUR';
  var RESUME = 'REOS_MD_MORNING_RESUME';
  var OLD = ['REOS_MD_SIX_HOUR_TICK', 'REOS_MD_SIX_HOUR_RESUME'];

  function prop_(key) {
    return PropertiesService.getScriptProperties().getProperty(key);
  }
  function approved_(key) { return prop_(key) === 'YES'; }
  function scheduler_() {
    if (!REOS.MDSixHourCountyScheduler ||
        typeof REOS.MDSixHourCountyScheduler.status !== 'function' ||
        typeof REOS.MDSixHourCountyScheduler.tick !== 'function') {
      throw new Error('MD scheduler source unavailable; no triggers installed.');
    }
    return REOS.MDSixHourCountyScheduler;
  }
  function scriptIdentity_() {
    var expected = prop_(P + 'EXPECTED_SCRIPT_ID');
    if (!expected || !ScriptApp || typeof ScriptApp.getScriptId !== 'function' ||
        ScriptApp.getScriptId() !== expected) {
      throw new Error('MD Apps Script project identity not pinned or mismatched.');
    }
    return expected;
  }
  function registration_() {
    if (typeof REOS_COUNTY_LIST !== 'function') {
      throw new Error('County registry entry point unavailable.');
    }
    var status = scheduler_().status();
    var ids = status.jobs.map(function (job) { return job.connectorId; }).sort();
    var actual = REOS_COUNTY_LIST().filter(function (x) {
      return x.state === 'MD' && x.enabled !== false &&
        x.datasets.indexOf('property_assessment') !== -1;
    }).map(function (x) { return x.id; }).sort();
    if (ids.length !== 24 || actual.length !== 24 || ids.join('|') !== actual.join('|')) {
      throw new Error('24 Maryland connector registrations not attested; no trigger install.');
    }
    return status;
  }
  function requireInstallAuthority_() {
    scriptIdentity_();
    if (!approved_(S + 'ENABLED') ||
        !approved_(S + 'EXECUTION_APPROVED') ||
        !approved_(S + 'AUDIT_WRITE_APPROVED') ||
        !approved_(S + 'TRIGGER_INSTALL_APPROVED') ||
        !approved_(P + 'TRIGGER_INSTALL_APPROVED') ||
        !approved_(P + 'EVIDENCE_WRITE_APPROVED')) {
      throw new Error('MD installation / audit / evidence permissions are NOT approved.');
    }
    var mode = scheduler_().status().executionMode;
    if (mode !== 'AUDITED_DRY_RUN' && mode !== 'LIVE') {
      throw new Error('MD scheduler is not in an independently approved run mode.');
    }
    return mode;
  }
  function evidence_() {
    var s = scheduler_().status();
    var now = new Date();
    var cutoff = now.getTime() - 24 * 3600000;
    var complete = 0, active = 0, blocked = 0, notStarted = 0;
    var recentComplete = 0;
    var rows = s.jobs.map(function (job) {
      if (job.status === 'COMPLETE') complete++;
      else if (job.status === 'ACTIVE') active++;
      else if (job.status === 'BLOCKED') blocked++;
      else notStarted++;
      var finished = Date.parse(job.lastCompletedAt || '');
      if (job.status === 'COMPLETE' && isFinite(finished) && finished >= cutoff &&
          finished <= now.getTime()) recentComplete++;
      return {
        jurisdiction: job.connectorId,
        dataset: 'property_assessment',
        checkpointStatus: job.status,
        cycle: job.cycle || '',
        cursor: job.cursor || '',
        lastSuccessAt: job.lastSuccessAt || '',
        lastCompletedAt: job.lastCompletedAt || '',
        failure: job.error || ''
      };
    });
    return {
      schema: 'REOS_MD_MORNING_EVIDENCE_V1',
      generatedAt: now.toISOString(),
      source: 'Apps Script Maryland scheduler checkpoint snapshot',
      provenance: 'SELF_REPORTED_CHECKPOINT_NOT_INDEPENDENTLY_CERTIFIED',
      state: 'MD',
      jurisdictionCount: 24,
      dataset: 'property_assessment',
      datasetClassification: 'NON_DISTRESS_REFERENCE_DATA',
      executionMode: s.executionMode,
      currentCycle: s.currentCycle,
      schedulerSchedule: s.schedule,
      sourceIdentityApproved: approved_(S + 'SOURCE_IDENTITY_CERTIFIED'),
      livePersistenceApproved: approved_(S + 'LIVE_PERSISTENCE_APPROVED'),
      summary: { complete: complete, completedWithin24h: recentComplete,
        active: active, blocked: blocked, notStarted: notStarted },
      distressFeeds: {
        code_violations: 'NOT AVAILABLE / SOURCE CERTIFICATION HOLD',
        vacant_properties: 'NOT AVAILABLE / SOURCE CERTIFICATION HOLD',
        sheriff_tax_sales: 'NOT AVAILABLE / SOURCE CERTIFICATION HOLD',
        sheriff_mortgage_sales: 'NOT AVAILABLE / SOURCE CERTIFICATION HOLD',
        probate: 'NOT AVAILABLE / SOURCE CERTIFICATION HOLD'
      },
      newlyVerifiedDistressLeads: 'NOT AVAILABLE / SOURCE CERTIFICATION HOLD',
      verifiedCanonicalNewOrChanged: 'NOT AVAILABLE / CANONICAL RECONCILIATION HOLD',
      acquisitionOfferAuthority: 'BLOCKED_UNLESS_COMPS_SUPPORTED_ARV_AND_REPAIR_SCOPE_AND_SEPARATE_APPROVAL',
      jurisdictions: rows
    };
  }
  function exportEvidence_() {
    scriptIdentity_();
    if (!approved_(P + 'EVIDENCE_WRITE_APPROVED')) {
      throw new Error('Maryland Drive evidence write not approved.');
    }
    var body = JSON.stringify(evidence_(), null, 2);
    var props = PropertiesService.getScriptProperties();
    var id = prop_(P + 'EVIDENCE_FILE_ID');
    var file;
    if (id) {
      file = DriveApp.getFileById(id); // Invalid pin MUST fail; do not create replacement.
      if (file.getName() !== NAME) {
        throw new Error('Pinned Maryland evidence file name drift.');
      }
      file.setContent(body);
    } else {
      // Never overwrite an existing unpinned Drive file, even with the same name.
      var duplicates = DriveApp.getFilesByName(NAME);
      if (duplicates.hasNext()) {
        throw new Error('Unpinned Maryland evidence file exists; review before linking.');
      }
      file = DriveApp.createFile(NAME, body, 'application/json');
      props.setProperty(P + 'EVIDENCE_FILE_ID', file.getId());
    }
    return { ok: true, fileId: file.getId(), evidenceName: NAME,
      snapshotGeneratedAt: new Date().toISOString() };
  }
  function countHandlers_(triggers) {
    var counts = {};
    triggers.forEach(function (t) {
      var handler = t.getHandlerFunction();
      counts[handler] = (counts[handler] || 0) + 1;
    });
    return counts;
  }
  function installAll() {
    var mode = requireInstallAuthority_();
    registration_();
    var installed = ScriptApp.getProjectTriggers();
    var counts = countHandlers_(installed);
    OLD.forEach(function (handler) {
      if (counts[handler]) {
        throw new Error('Legacy Maryland handler exists; refuse duplicate scheduler: ' + handler);
      }
    });
    [SIX, RESUME].forEach(function (handler) {
      if ((counts[handler] || 0) > 1) {
        throw new Error('Duplicate Maryland triggers require manual review: ' + handler);
      }
    });
    // Publish a clearly labeled HOLD snapshot before creating scheduled triggers.
    // Never modify the existing ChatGPT REOS Daily Acquisition automation here.
    var evidence = exportEvidence_();
    var created = [];
    try {
      if (!counts[SIX]) {
        created.push(ScriptApp.newTrigger(SIX).timeBased().everyHours(6).create());
      }
      if (!counts[RESUME]) {
        created.push(ScriptApp.newTrigger(RESUME).timeBased().everyMinutes(15).create());
      }
      var after = countHandlers_(ScriptApp.getProjectTriggers());
      if (after[SIX] !== 1 || after[RESUME] !== 1) {
        throw new Error('Maryland post-install trigger verification failed.');
      }
      return { ok: true, result: 'MD_TRIGGER_INSTALL_VERIFIED',
        mode: mode, created: created.length, requiredHandlers: [SIX, RESUME],
        evidence: evidence, paNjDeTriggersModified: false,
        morningReport: 'EXISTING_CHATGPT_REOS_DAILY_ACQUISITION_AUTOMATION' };
    } catch (error) {
      created.forEach(function (trigger) {
        try { ScriptApp.deleteTrigger(trigger); } catch (ignored) {}
      });
      throw error;
    }
  }
  function tick_() {
    scriptIdentity_();
    var result = scheduler_().tick();
    var snapshot = exportEvidence_();
    return { ok: result.ok === true, scheduler: result, evidence: snapshot };
  }
  function status() { return evidence_(); } // Read-only, no Google writes.
  return { installAll: installAll, tick: tick_, status: status,
    exportNow: exportEvidence_ };
})();
function REOS_MD_MORNING_INSTALL_ALL() { return REOS.MDMorningAllInOne.installAll(); }
function REOS_MD_MORNING_SIX_HOUR() { return REOS.MDMorningAllInOne.tick(); }
function REOS_MD_MORNING_RESUME() { return REOS.MDMorningAllInOne.tick(); }
function REOS_MD_MORNING_STATUS() { return REOS.MDMorningAllInOne.status(); }
function REOS_MD_MORNING_EXPORT_NOW() { return REOS.MDMorningAllInOne.exportNow(); }
