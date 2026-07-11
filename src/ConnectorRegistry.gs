/**
 * REOS Enterprise v4.2.0 - Connector Registry
 * Sprint 7.1 Increment 1: live acquisition connector definitions.
 */
var REOS = REOS || {};

REOS.ConnectorRegistry = (function () {
  var TABLE = 'ACQUISITION_CONNECTORS';
  var HEADERS = [
    'Connector ID','Connector Key','Name','Type','Source Category','Handler Function',
    'Enabled','Schedule','Priority','Config JSON','Last Run At','Last Status',
    'Last Message','Created At','Updated At'
  ];

  var DEFAULTS = [
    ['county_csv','County CSV Import','CSV','County Records','reosConnectorHandleCountyCsv','false','Manual',50],
    ['tax_delinquent','Tax Delinquent Feed','CSV','Tax Delinquency','reosConnectorHandleTaxDelinquent','false','Manual',90],
    ['probate','Probate Feed','CSV','Probate','reosConnectorHandleProbate','false','Manual',85],
    ['code_violations','Code Violations Feed','CSV','Code Violations','reosConnectorHandleCodeViolations','false','Manual',80],
    ['vacant_properties','Vacant Properties Feed','CSV','Vacancy','reosConnectorHandleVacantProperties','false','Manual',75],
    ['absentee_owners','Absentee Owners Feed','CSV','Absentee Owner','reosConnectorHandleAbsenteeOwners','false','Manual',70]
  ];

  function ensureSheet() {
    REOS.Database.ensureTable(TABLE, HEADERS);
    return TABLE;
  }

  function seedDefaults() {
    ensureSheet();
    var existing = REOS.Database.getAll(TABLE).reduce(function (map, row) {
      map[String(row['Connector Key'] || '')] = true;
      return map;
    }, {});

    var created = [];
    DEFAULTS.forEach(function (d) {
      if (existing[d[0]]) return;
      created.push(REOS.Database.insert(TABLE, {
        'Connector Key': d[0],
        'Name': d[1],
        'Type': d[2],
        'Source Category': d[3],
        'Handler Function': d[4],
        'Enabled': d[5],
        'Schedule': d[6],
        'Priority': d[7],
        'Config JSON': '{}',
        'Last Run At': '',
        'Last Status': 'Never Run',
        'Last Message': ''
      }, { idField: 'Connector ID', idPrefix: 'CONN' }));
    });

    return { ok: true, created: created.length, total: list().length };
  }

  function list() {
    ensureSheet();
    return REOS.Database.getAll(TABLE).sort(function (a, b) {
      return Number(b.Priority || 0) - Number(a.Priority || 0);
    });
  }

  function get(key) {
    var wanted = String(key || '').trim().toLowerCase();
    return list().filter(function (row) {
      return String(row['Connector Key'] || '').trim().toLowerCase() === wanted;
    })[0] || null;
  }

  function update(key, changes) {
    var row = get(key);
    if (!row) throw new Error('Connector not found: ' + key);
    return REOS.Database.update(TABLE, 'Connector ID', row['Connector ID'], changes || {});
  }

  function enable(key, config) {
    var changes = { Enabled: true };
    if (config !== undefined) changes['Config JSON'] = JSON.stringify(config || {});
    return update(key, changes);
  }

  function disable(key) {
    return update(key, { Enabled: false });
  }

  function getConfig(connector) {
    try {
      return JSON.parse(connector['Config JSON'] || '{}');
    } catch (error) {
      return {};
    }
  }

  function isEnabled(connector) {
    var value = connector && connector.Enabled;
    return value === true || String(value).toLowerCase() === 'true';
  }

  return {
    table: TABLE,
    ensureSheet: ensureSheet,
    seedDefaults: seedDefaults,
    list: list,
    get: get,
    update: update,
    enable: enable,
    disable: disable,
    getConfig: getConfig,
    isEnabled: isEnabled
  };
})();

function reosConnectorRegistryEnsure() { return REOS.ConnectorRegistry.ensureSheet(); }
function reosConnectorRegistrySeed() { return REOS.ConnectorRegistry.seedDefaults(); }
function reosConnectorRegistryList() { return REOS.ConnectorRegistry.list(); }
function reosConnectorEnable(key, config) { return REOS.ConnectorRegistry.enable(key, config); }
function reosConnectorDisable(key) { return REOS.ConnectorRegistry.disable(key); }
