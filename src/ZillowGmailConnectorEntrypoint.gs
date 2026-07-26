/**
 * Stable connector entry point for the Zillow Gmail Multi-Folder Leads connector.
 * Keep this global function name unchanged because registry rows and triggers use it.
 *
 * @param {Object=} context Connector execution context.
 * @return {Object} Connector execution result.
 */
function reosConnectorHandleZillowGmail(context) {
  if (!REOS.ZillowGmailConnector || typeof REOS.ZillowGmailConnector.handle !== 'function') {
    throw new Error('ZillowGmailConnector.gs is required for reosConnectorHandleZillowGmail.');
  }
  return REOS.ZillowGmailConnector.handle(context || {});
}

/**
 * Deployment smoke test. Does not scan Gmail.
 *
 * @return {{ok:boolean,handler:string,implementationFound:boolean}}
 */
function reosTestZillowGmailConnectorHandler() {
  var found = Boolean(
    typeof reosConnectorHandleZillowGmail === 'function' &&
    REOS.ZillowGmailConnector &&
    typeof REOS.ZillowGmailConnector.handle === 'function'
  );
  var result = {
    ok: found,
    handler: 'reosConnectorHandleZillowGmail',
    implementationFound: found
  };
  console.log(JSON.stringify(result));
  return result;
}
