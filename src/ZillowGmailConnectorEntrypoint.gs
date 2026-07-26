/**
 * Stable connector entry point for the Zillow Gmail Multi-Folder Leads connector.
 *
 * Connector records and time-driven triggers reference this exact global function
 * name. Keep this wrapper stable even when the underlying implementation moves.
 *
 * @return {*} Result returned by the active Zillow Gmail implementation.
 */
function reosConnectorHandleZillowGmail() {
  var args = Array.prototype.slice.call(arguments);
  var implementation = resolveZillowGmailConnectorImplementation_();

  if (!implementation) {
    throw new Error(
      'Zillow Gmail connector implementation unavailable. ' +
      'Expected a callable REOS Zillow Gmail service method. ' +
      'The stable handler reosConnectorHandleZillowGmail is loaded correctly, ' +
      'but the implementation module is missing from this Apps Script deployment.'
    );
  }

  return implementation.fn.apply(implementation.context, args);
}

/**
 * Resolves the current implementation without coupling the connector registry to
 * a single internal module name. This supports incremental REOS refactors while
 * preserving existing connector records and installed triggers.
 *
 * @return {{fn: Function, context: Object}|null}
 * @private
 */
function resolveZillowGmailConnectorImplementation_() {
  var candidates = [];

  if (typeof REOS !== 'undefined' && REOS) {
    candidates = candidates.concat([
      [REOS.ZillowGmailConnector, 'handle'],
      [REOS.ZillowGmailConnector, 'run'],
      [REOS.ZillowGmailConnector, 'scan'],
      [REOS.ZillowGmail, 'handle'],
      [REOS.ZillowGmail, 'run'],
      [REOS.ZillowGmail, 'scan'],
      [REOS.Connectors && REOS.Connectors.ZillowGmail, 'handle'],
      [REOS.Connectors && REOS.Connectors.ZillowGmail, 'run'],
      [REOS.Connectors && REOS.Connectors.ZillowGmail, 'scan']
    ]);
  }

  for (var i = 0; i < candidates.length; i++) {
    var context = candidates[i][0];
    var methodName = candidates[i][1];

    if (context && typeof context[methodName] === 'function') {
      return {
        fn: context[methodName],
        context: context
      };
    }
  }

  var globalCandidates = [
    'reosRunZillowGmailConnector',
    'reosConnectorRunZillowGmail',
    'reosScanZillowGmailFolders',
    'reosZillowGmailMultiFolderScan',
    'runZillowGmailConnector'
  ];

  var root = typeof globalThis !== 'undefined' ? globalThis : this;

  for (var j = 0; j < globalCandidates.length; j++) {
    var functionName = globalCandidates[j];

    if (root && typeof root[functionName] === 'function') {
      return {
        fn: root[functionName],
        context: root
      };
    }
  }

  return null;
}

/**
 * Deployment smoke test. Run manually after clasp push/deployment.
 * It verifies that the stable handler and implementation are both available
 * without scanning Gmail.
 *
 * @return {{ok: boolean, handler: string, implementationFound: boolean}}
 */
function reosTestZillowGmailConnectorHandler() {
  var implementation = resolveZillowGmailConnectorImplementation_();
  var result = {
    ok: Boolean(implementation),
    handler: 'reosConnectorHandleZillowGmail',
    implementationFound: Boolean(implementation)
  };

  console.log(JSON.stringify(result));
  return result;
}
