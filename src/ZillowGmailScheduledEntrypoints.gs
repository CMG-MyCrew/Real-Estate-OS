/**
 * Backward-compatible scheduled entry points for existing Apps Script triggers.
 * Keep these global function names stable until old triggers are intentionally migrated.
 */

/**
 * Existing scheduled Zillow Gmail sync trigger.
 *
 * @return {Object} Connector execution result.
 */
function reosZillowGmailScheduledSync() {
  return reosConnectorHandleZillowGmail({
    config: {
      labels: ['Zillow'],
      query: 'newer_than:30d',
      maxThreads: 100
    },
    options: {
      maxThreads: 100,
      scheduled: true
    }
  });
}

/**
 * Existing downstream scheduled trigger.
 * Runs the Gmail import first, then invokes an optional downstream processor when present.
 *
 * @return {Object} Combined scheduled execution result.
 */
function reosZillowGmailProductionDownstreamScheduled() {
  var scanResult = reosZillowGmailScheduledSync();
  var downstreamResult = null;

  if (typeof reosZillowGmailProcessDownstream === 'function') {
    downstreamResult = reosZillowGmailProcessDownstream(scanResult);
  } else if (
    typeof REOS !== 'undefined' &&
    REOS.ZillowGmailConnector &&
    typeof REOS.ZillowGmailConnector.processDownstream === 'function'
  ) {
    downstreamResult = REOS.ZillowGmailConnector.processDownstream(scanResult);
  }

  return {
    ok: scanResult && scanResult.ok !== false,
    scan: scanResult,
    downstream: downstreamResult,
    message: downstreamResult === null
      ? 'Zillow Gmail scan completed; no downstream processor is currently configured.'
      : 'Zillow Gmail scan and downstream processing completed.'
  };
}

/**
 * Verifies that all trigger-facing Zillow Gmail functions are deployed.
 *
 * @return {Object}
 */
function reosTestZillowGmailScheduledEntrypoints() {
  var result = {
    ok: typeof reosZillowGmailScheduledSync === 'function' &&
      typeof reosZillowGmailProductionDownstreamScheduled === 'function' &&
      typeof reosConnectorHandleZillowGmail === 'function',
    scheduledSyncFound: typeof reosZillowGmailScheduledSync === 'function',
    downstreamScheduledFound: typeof reosZillowGmailProductionDownstreamScheduled === 'function',
    connectorHandlerFound: typeof reosConnectorHandleZillowGmail === 'function'
  };

  console.log(JSON.stringify(result));
  return result;
}
