/**
 * REOS Enterprise — Address Parsing Safety Gate
 *
 * Replaces invalid property-address values with PARSING_EXCEPTION before they
 * are persisted to acquisition, CRM, property, deal, and Zillow lead tables.
 */
var REOS = REOS || {};

REOS.AddressParsingSafety = (function () {
  var EXCEPTION = 'PARSING_EXCEPTION';
  var INSTALLED_FLAG = '__addressParsingSafetyInstalled';

  var PROTECTED_TABLES = {
    ZILLOW_GMAIL_LEADS: true,
    ZILLOW_GMAIL_DOWNSTREAM_QUEUE: true,
    DISTRESS_LEADS: true,
    IA_LEADS: true,
    AI_ACQUISITION_DECISIONS: true,
    AI_DEAL_INTELLIGENCE: true,
    LEADS: true,
    CRM: true,
    PROPERTIES: true,
    DEALS: true,
    ACQUISITION_PIPELINE: true,
    ACQUISITION_OPPORTUNITY_VIEW: true
  };

  var TABLE_IDS = {
    ZILLOW_GMAIL_LEADS: 'Zillow Lead ID',
    ZILLOW_GMAIL_DOWNSTREAM_QUEUE: 'Queue ID',
    DISTRESS_LEADS: 'Distress Lead ID',
    IA_LEADS: 'Lead ID',
    AI_ACQUISITION_DECISIONS: 'Decision ID',
    AI_DEAL_INTELLIGENCE: 'AI Deal ID',
    LEADS: 'Lead ID',
    CRM: 'CRM ID',
    PROPERTIES: 'Property ID',
    DEALS: 'Deal ID',
    ACQUISITION_PIPELINE: 'Acquisition ID',
    ACQUISITION_OPPORTUNITY_VIEW: 'Opportunity ID'
  };

  function text_(value) {
    return String(value === null || value === undefined ? '' : value).trim();
  }

  function isProtected_(tableName) {
    return !!PROTECTED_TABLES[text_(tableName)];
  }

  function invalidReason(address) {
    var value = text_(address);
    var lower = value.toLowerCase();

    if (value === EXCEPTION) return '';
    if (!value) return 'missing address';
    if (value.length > 220) return 'address exceeds maximum length';

    if (
      /https?:\/\//i.test(value) ||
      /www\./i.test(value) ||
      /click\.mail\.zillow\.com/i.test(value) ||
      /zillow\.com\/homedetails/i.test(value) ||
      /notifications?%2f/i.test(value) ||
      /target=https?%3a/i.test(value) ||
      /utm_(campaign|source|medium|content|term)/i.test(value) ||
      /%2f|%3a|%3f|%26|%3d/i.test(value)
    ) {
      return 'URL or encoded tracking value';
    }

    if (
      lower.indexOf("your '") !== -1 ||
      lower.indexOf('your search') !== -1 ||
      lower.indexOf('view all notifications') !== -1 ||
      lower.indexOf('instantsearchdigest') !== -1 ||
      lower.indexOf('recapmodule') !== -1
    ) {
      return 'saved-search or notification text';
    }

    if (!/[0-9]/.test(value)) return 'street number missing';
    if (!/[a-z]/i.test(value)) return 'street name missing';

    return '';
  }

  function sanitize(record) {
    record = Object.assign({}, record || {});

    if (!Object.prototype.hasOwnProperty.call(record, 'Address')) {
      return record;
    }

    var reason = invalidReason(record.Address);
    if (!reason) return record;

    // Preserve the source value only when the receiving schema already has a
    // raw-address field; never add unknown columns to fixed database schemas.
    if (
      Object.prototype.hasOwnProperty.call(record, 'Raw Address') &&
      text_(record.Address) !== EXCEPTION
    ) {
      record['Raw Address'] = text_(record.Address);
    }

    record.Address = EXCEPTION;
    return record;
  }

  function install() {
    if (!REOS.Database) {
      return { ok: false, installed: false, reason: 'REOS.Database unavailable' };
    }

    if (REOS.Database[INSTALLED_FLAG]) {
      return { ok: true, installed: true, alreadyInstalled: true };
    }

    var originalInsert = REOS.Database.insert;
    var originalUpdate = REOS.Database.update;

    if (typeof originalInsert !== 'function' || typeof originalUpdate !== 'function') {
      return { ok: false, installed: false, reason: 'Database insert/update unavailable' };
    }

    REOS.Database.insert = function (tableName, values, options) {
      if (isProtected_(tableName)) values = sanitize(values);
      return originalInsert.call(REOS.Database, tableName, values, options);
    };

    REOS.Database.update = function (tableName, idField, idValue, values) {
      if (isProtected_(tableName)) values = sanitize(values);
      return originalUpdate.call(
        REOS.Database,
        tableName,
        idField,
        idValue,
        values
      );
    };

    REOS.Database[INSTALLED_FLAG] = true;
    return {
      ok: true,
      installed: true,
      replacement: EXCEPTION,
      protectedTables: Object.keys(PROTECTED_TABLES)
    };
  }

  function remediateExisting() {
    if (!REOS.Database) throw new Error('REOS.Database unavailable.');

    var summary = {
      ok: true,
      replacement: EXCEPTION,
      scanned: 0,
      corrected: 0,
      skippedTables: []
    };

    Object.keys(PROTECTED_TABLES).forEach(function (tableName) {
      var idField = TABLE_IDS[tableName];
      if (!idField) return;

      var rows;
      try {
        rows = REOS.Database.getAll(tableName) || [];
      } catch (error) {
        summary.skippedTables.push(tableName);
        return;
      }

      rows.forEach(function (row) {
        summary.scanned++;
        if (!invalidReason(row.Address)) return;
        if (text_(row.Address) === EXCEPTION) return;
        if (!row[idField]) return;

        REOS.Database.update(
          tableName,
          idField,
          row[idField],
          sanitize(row)
        );
        summary.corrected++;
      });
    });

    return summary;
  }

  return {
    install: install,
    sanitize: sanitize,
    invalidReason: invalidReason,
    remediateExisting: remediateExisting
  };
})();

// Alphabetical load order places this after the core database and acquisition modules.
REOS.AddressParsingSafety.install();

function REOS_ADDRESS_PARSING_SAFETY_INSTALL() {
  return REOS.AddressParsingSafety.install();
}

function REOS_ADDRESS_PARSING_SAFETY_REMEDIATE() {
  return REOS.AddressParsingSafety.remediateExisting();
}

function REOS_ADDRESS_PARSING_SAFETY_TEST() {
  var invalidSamples = [
    '',
    'https://click.mail.zillow.com/f/a/example',
    'notifications%2Fview-all_target%2Fexample',
    "Your 'Baltimore, MD' search",
    'utm_campaign=instantsearchdigest'
  ];

  invalidSamples.forEach(function (address) {
    var result = REOS.AddressParsingSafety.sanitize({ Address: address });
    if (result.Address !== 'PARSING_EXCEPTION') {
      throw new Error('Invalid address was not blocked: ' + address);
    }
  });

  var validSamples = [
    '2280 W 11th St, Jacksonville, FL 32209',
    '489 Starratt Road Lot 234, Jacksonville, FL',
    '3401 Ennis Street #4, Houston, TX 77004'
  ];

  validSamples.forEach(function (address) {
    var result = REOS.AddressParsingSafety.sanitize({ Address: address });
    if (result.Address !== address) {
      throw new Error('Valid address was incorrectly blocked: ' + address);
    }
  });

  return {
    ok: true,
    invalidSamplesBlocked: invalidSamples.length,
    validSamplesPreserved: validSamples.length,
    replacement: EXCEPTION
  };
}
