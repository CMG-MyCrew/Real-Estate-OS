/**
 * REOS Enterprise v3.0 - Async Job Queue Framework
 *
 * Background job queue, workers, retries, scheduled processing, and job logs.
 */

var REOS = REOS || {};

REOS.JobQueue = (function () {
  const JOBS_SHEET = 'JOB_QUEUE';
  const LOG_SHEET = 'JOB_LOG';

  const JOB_HEADERS = [
    'Job ID', 'Queue', 'Job Type', 'Status', 'Priority', 'Payload JSON',
    'Attempts', 'Max Attempts', 'Run After', 'Started At', 'Finished At',
    'Error', 'Created At', 'Updated At'
  ];

  const LOG_HEADERS = [
    'Job Log ID', 'Job ID', 'Timestamp', 'Status', 'Message', 'Details JSON',
    'Created At', 'Updated At'
  ];

  function ensureSheets() {
    ensureTable_(JOBS_SHEET, JOB_HEADERS);
    ensureTable_(LOG_SHEET, LOG_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    return sheet;
  }

  function enqueue(queue, jobType, payload, options) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    options = options || {};
    const job = REOS.Database.insert(JOBS_SHEET, {
      Queue: queue || 'default',
      'Job Type': jobType,
      Status: 'Queued',
      Priority: Number(options.priority || 5),
      'Payload JSON': JSON.stringify(payload || {}),
      Attempts: 0,
      'Max Attempts': Number(options.maxAttempts || 3),
      'Run After': options.runAfter || new Date()
    }, { idField: 'Job ID', idPrefix: 'JOB' });
    log_(job['Job ID'], 'Queued', 'Job queued.', payload || {});
    return job;
  }

  function processNext(queue) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const due = new Date().getTime();
    const jobs = REOS.Database.query(JOBS_SHEET, function (job) {
      const runAfter = job['Run After'] ? new Date(job['Run After']).getTime() : 0;
      return String(job.Status || '') === 'Queued' && (!queue || job.Queue === queue) && runAfter <= due;
    }).sort(function (a, b) {
      return Number(a.Priority || 5) - Number(b.Priority || 5);
    });
    if (!jobs.length) return { processed: false, message: 'No queued jobs.' };
    return processJob_(jobs[0]);
  }

  function processBatch(limit, queue) {
    limit = Number(limit || 10);
    const results = [];
    for (let i = 0; i < limit; i++) {
      const result = processNext(queue);
      results.push(result);
      if (!result.processed) break;
    }
    return results;
  }

  function processJob_(job) {
    const started = Date.now();
    const jobId = job['Job ID'];
    const attempts = Number(job.Attempts || 0) + 1;
    REOS.Database.update(JOBS_SHEET, 'Job ID', jobId, { Status: 'Running', Attempts: attempts, 'Started At': new Date() });
    try {
      const payload = JSON.parse(job['Payload JSON'] || '{}');
      const result = execute_(job['Job Type'], payload);
      REOS.Database.update(JOBS_SHEET, 'Job ID', jobId, { Status: 'Completed', 'Finished At': new Date(), Error: '' });
      log_(jobId, 'Completed', 'Job completed.', { result: result, durationMs: Date.now() - started });
      REOS.Performance.log('JobQueue', job['Job Type'], Date.now() - started, { jobId: jobId });
      return { processed: true, jobId: jobId, status: 'Completed', result: result };
    } catch (error) {
      const finalStatus = attempts >= Number(job['Max Attempts'] || 3) ? 'Failed' : 'Queued';
      REOS.Database.update(JOBS_SHEET, 'Job ID', jobId, { Status: finalStatus, Error: error.message, 'Finished At': new Date() });
      log_(jobId, finalStatus, error.message, {});
      return { processed: true, jobId: jobId, status: finalStatus, error: error.message };
    }
  }

  function execute_(jobType, payload) {
    switch (String(jobType || '')) {
      case 'backup': return REOS.Backup.createSpreadsheetBackup('Queued backup');
      case 'usageSnapshot': return REOS.UsageAnalytics.snapshot();
      case 'healthCheck': return REOS.Monitoring.runHealthSuite();
      case 'biSnapshot': return REOS.BI.createSnapshot();
      case 'webhook': return REOS.Webhooks.receive(payload.source, payload.eventType, payload.payload || {});
      case 'automation': return REOS.Automation.dispatch(payload.eventName, payload.moduleName, payload.payload || {});
      default: throw new Error('Unknown job type: ' + jobType);
    }
  }

  function dashboard() {
    ensureSheets();
    const jobs = REOS.Database.getAll(JOBS_SHEET).slice(-200).reverse();
    return {
      queued: jobs.filter(function (j) { return j.Status === 'Queued'; }).length,
      running: jobs.filter(function (j) { return j.Status === 'Running'; }).length,
      failed: jobs.filter(function (j) { return j.Status === 'Failed'; }).length,
      completed: jobs.filter(function (j) { return j.Status === 'Completed'; }).length,
      recent: jobs.slice(0, 50)
    };
  }

  function installWorkerTrigger() {
    REOS.Security.requirePermission('finance:write');
    ScriptApp.newTrigger('jobQueueProcessBatch').timeBased().everyMinutes(5).create();
    return true;
  }

  function log_(jobId, status, message, details) {
    try {
      REOS.Database.insert(LOG_SHEET, {
        'Job ID': jobId,
        Timestamp: new Date(),
        Status: status,
        Message: message,
        'Details JSON': JSON.stringify(details || {})
      }, { idField: 'Job Log ID', idPrefix: 'JL' });
    } catch (ignore) {}
  }

  return { ensureSheets: ensureSheets, enqueue: enqueue, processNext: processNext, processBatch: processBatch, dashboard: dashboard, installWorkerTrigger: installWorkerTrigger };
})();

function jobQueueEnqueue(queue, jobType, payload, options) { return REOS.JobQueue.enqueue(queue, jobType, payload || {}, options || {}); }
function jobQueueProcessBatch() { return REOS.JobQueue.processBatch(10); }
function jobQueueDashboard() { return REOS.JobQueue.dashboard(); }
function jobQueueInstallWorkerTrigger() { return REOS.JobQueue.installWorkerTrigger(); }
