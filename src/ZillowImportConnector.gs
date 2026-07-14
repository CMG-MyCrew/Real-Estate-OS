/**
 * REOS Enterprise v4.2.4 - Authorized Zillow-Format Import Connector
 * Imports user-supplied or licensed CSV data. Does not scrape Zillow pages.
 */
var REOS = REOS || {};

REOS.ZillowImportConnector = (function () {
  var KEY = 'zillow_authorized_import';

  function ensureReady_() {
    if (!REOS.CSVImportEngine || typeof REOS.CSVImportEngine.importConnector !== 'function') {
      throw new Error('CSVImportEngine.gs is required.');
    }
    if (!REOS.ConnectorRegistry) {
      throw new Error('ConnectorRegistry.gs is required.');
    }
  }

  function preview(fileIdOrUrl, options) {
    ensureReady_();
    return REOS.CSVImportEngine.previewFile(fileIdOrUrl, Object.assign({
      sourceName: 'Authorized Zillow-Format Import',
      connectorKey: KEY
    }, options || {}));
  }

  function validate(fileIdOrUrl, options) {
    ensureReady_();
    return REOS.CSVImportEngine.validateFile(fileIdOrUrl, Object.assign({
      sourceName: 'Authorized Zillow-Format Import',
      connectorKey: KEY
    }, options || {}));
  }

  function importFile(fileIdOrUrl, options) {
    ensureReady_();
    return REOS.CSVImportEngine.importFile(fileIdOrUrl, Object.assign({
      connectorKey: KEY,
      sourceName: 'Authorized Zillow-Format Import',
      distressType: 'Listing Data'
    }, options || {}));
  }

  function importConnector(context) {
    ensureReady_();
    context = context || {};
    context.connector = context.connector || {
      'Connector Key': KEY,
      Name: 'Authorized Zillow-Format Import',
      'Source Category': 'Listing Data'
    };
    return REOS.CSVImportEngine.importConnector(context);
  }

  function configure(config) {
    ensureReady_();
    config = Object.assign({
      filePattern: '.csv',
      maxFilesPerRun: 10,
      defaultState: ''
    }, config || {});
    return REOS.ConnectorRegistry.enable(KEY, config);
  }

  function disable() {
    ensureReady_();
    return REOS.ConnectorRegistry.disable(KEY);
  }

  return {
    key: KEY,
    preview: preview,
    validate: validate,
    importFile: importFile,
    importConnector: importConnector,
    configure: configure,
    disable: disable
  };
})();

function reosZillowImportPreview(fileIdOrUrl, options) {
  return REOS.ZillowImportConnector.preview(fileIdOrUrl, options);
}
function reosZillowImportValidate(fileIdOrUrl, options) {
  return REOS.ZillowImportConnector.validate(fileIdOrUrl, options);
}
function reosZillowImportFile(fileIdOrUrl, options) {
  return REOS.ZillowImportConnector.importFile(fileIdOrUrl, options);
}
function reosZillowImportConfigure(config) {
  return REOS.ZillowImportConnector.configure(config);
}
function reosZillowImportDisable() {
  return REOS.ZillowImportConnector.disable();
}
function reosConnectorHandleZillowImport(context) {
  return REOS.ZillowImportConnector.importConnector(context || {});
}

function reosConfigureZillowAuthorizedFolder() {
  return REOS.ZillowImportConnector.configure({
    driveFolderId: '1YEvMuOtz55nrm92ux2PhVIIqWkkE6nfn',
    filePattern: '.csv',
    maxFilesPerRun: 10,
    defaultState: ''
  });
}
