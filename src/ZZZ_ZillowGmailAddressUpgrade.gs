/**
 * REOS Enterprise v4.5.1 - Zillow Gmail Address Normalization Upgrade
 *
 * Late-loading compatibility patch for ZillowGmailConnector.gs. It cleans
 * subject-line prose from imported addresses, separates City/State/ZIP, and
 * provides a controlled backfill for previously imported Zillow Gmail rows.
 */
var REOS = REOS || {};

REOS.ZillowGmailAddressUpgrade = (function () {
  var SOURCE = 'Zillow Gmail';
  var TABLE = 'DISTRESS_LEADS';
  var ID_FIELD = 'Distress Lead ID';

  var STREET_SUFFIX = '(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Parkway|Pkwy|Terrace|Ter|Circle|Cir|Highway|Hwy|Trail|Trl|Square|Sq)';

  function normalize(value, defaults) {
    defaults = defaults || {};
    var raw = cleanup_(value);
    var result = {
      ok: false,
      original: String(value || ''),
      address: raw,
      city: String(defaults.city || ''),
      state: String(defaults.state || '').toUpperCase(),
      zip: String(defaults.zip || ''),
      confidence: 'low'
    };

    if (!raw) return result;

    // Zillow alert subjects commonly begin with labels such as "New Listing:".
    raw = raw.replace(/^(?:new\s+listing|listing|home|property|address)\s*:\s*/i, '');

    // Remove prose that follows a complete US ZIP code.
    var complete = raw.match(/^(.+?\b[A-Z]{2}\s+\d{5}(?:-\d{4})?)\b/i);
    if (complete) raw = complete[1].trim();

    // Standard comma-delimited address: street, city, ST ZIP.
    var comma = raw.match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
    if (comma) {
      return result_(result, comma[1], comma[2], comma[3], comma[4], 'high');
    }

    // Zillow subject format: street suffix + city, ST ZIP.
    var suffixPattern = new RegExp(
      '^(.+?\\b' + STREET_SUFFIX + '\\b(?:\\s+(?:Apt|Apartment|Unit|Suite|#)\\s*[A-Z0-9-]+)?)\\s+([^,]+?),\\s*([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)$',
      'i'
    );
    var suffix = raw.match(suffixPattern);
    if (suffix) {
      return result_(result, suffix[1], suffix[2], suffix[3], suffix[4], 'high');
    }

    // Less-specific fallback: retain everything before the final city/state/ZIP.
    var fallback = raw.match(/^(\d{1,6}\s+.+?)\s+([^,]+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
    if (fallback) {
      return result_(result, fallback[1], fallback[2], fallback[3], fallback[4], 'medium');
    }

    result.address = cleanup_(raw);
    return result;
  }

  function repairLead(leadId) {
    requireDatabase_();
    var rows = REOS.Database.getAll(TABLE);
    var row = rows.filter(function (item) {
      return String(item[ID_FIELD] || '') === String(leadId || '');
    })[0];
    if (!row) return { ok: false, skipped: true, reason: 'Lead not found', leadId: leadId };
    return repairRow_(row);
  }

  function repairImported(limit) {
    requireDatabase_();
    var rows = REOS.Database.getAll(TABLE);
    var max = Math.max(1, Math.min(2000, Number(limit || 500)));
    var candidates = rows.filter(isZillowRow_).slice(-max);
    var summary = { ok: true, scanned: candidates.length, updated: 0, skipped: 0, failed: 0, errors: [] };

    candidates.forEach(function (row) {
      try {
        var result = repairRow_(row);
        if (result.updated) summary.updated += 1;
        else summary.skipped += 1;
      } catch (error) {
        summary.failed += 1;
        summary.errors.push({
          leadId: String(row[ID_FIELD] || ''),
          error: error.message || String(error)
        });
      }
    });

    summary.ok = summary.failed === 0;
    return summary;
  }

  function repairIds(leadIds) {
    var summary = { ok: true, scanned: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    (leadIds || []).forEach(function (leadId) {
      summary.scanned += 1;
      try {
        var result = repairLead(leadId);
        if (result.updated) summary.updated += 1;
        else summary.skipped += 1;
      } catch (error) {
        summary.failed += 1;
        summary.errors.push({ leadId: leadId, error: error.message || String(error) });
      }
    });
    summary.ok = summary.failed === 0;
    return summary;
  }

  function repairRow_(row) {
    var current = String(row.Address || '').trim();
    var parsed = normalize(current, {
      city: row.City,
      state: row.State,
      zip: row.Zip
    });

    if (!parsed.ok) {
      return {
        ok: true,
        updated: false,
        skipped: true,
        reason: 'Address could not be separated safely',
        leadId: String(row[ID_FIELD] || ''),
        address: current
      };
    }

    var changes = {};
    if (String(row.Address || '').trim() !== parsed.address) changes.Address = parsed.address;
    if (String(row.City || '').trim() !== parsed.city) changes.City = parsed.city;
    if (String(row.State || '').trim().toUpperCase() !== parsed.state) changes.State = parsed.state;
    if (String(row.Zip || '').trim() !== parsed.zip) changes.Zip = parsed.zip;

    if (!Object.keys(changes).length) {
      return { ok: true, updated: false, skipped: true, reason: 'Already normalized', leadId: row[ID_FIELD] };
    }

    changes['Updated At'] = new Date();
    REOS.Database.update(TABLE, ID_FIELD, row[ID_FIELD], changes);
    return {
      ok: true,
      updated: true,
      leadId: String(row[ID_FIELD] || ''),
      before: current,
      after: parsed,
      changes: changes
    };
  }

  function install() {
    if (!REOS.ZillowGmailConnector || typeof REOS.ZillowGmailConnector.sync !== 'function') {
      return { ok: false, installed: false, reason: 'ZillowGmailConnector is unavailable.' };
    }
    if (REOS.ZillowGmailConnector.__addressUpgradeInstalled) {
      return { ok: true, installed: true, alreadyInstalled: true };
    }

    var originalSync = REOS.ZillowGmailConnector.sync;
    REOS.ZillowGmailConnector.sync = function (context) {
      var result = originalSync(context || {});
      var ids = result && result.importedLeadIds ? result.importedLeadIds : [];
      result = result || {};
      result.addressNormalization = repairIds(ids);
      return result;
    };
    REOS.ZillowGmailConnector.__addressUpgradeInstalled = true;
    return { ok: true, installed: true };
  }

  function isZillowRow_(row) {
    return String(row.Source || row['Lead Source'] || '').trim() === SOURCE ||
      String(row[ID_FIELD] || '').indexOf('ZIL-') === 0;
  }

  function result_(base, address, city, state, zip, confidence) {
    base.ok = true;
    base.address = cleanup_(address);
    base.city = cleanup_(city);
    base.state = String(state || '').toUpperCase();
    base.zip = String(zip || '');
    base.confidence = confidence;
    return base;
  }

  function cleanup_(value) {
    return String(value || '')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s|–—-]+|[\s|–—-]+$/g, '')
      .replace(/[.;,:\s]+$/, '')
      .trim()
      .substring(0, 220);
  }

  function requireDatabase_() {
    if (!REOS.Database) throw new Error('Database.gs is required.');
  }

  return {
    normalize: normalize,
    repairLead: repairLead,
    repairImported: repairImported,
    repairIds: repairIds,
    install: install
  };
})();

// File name intentionally begins with ZZZ so this executes after the base connector.
REOS.ZillowGmailAddressUpgrade.install();

function reosZillowGmailNormalizeAddress(value) {
  return REOS.ZillowGmailAddressUpgrade.normalize(value || '');
}

function reosZillowGmailRepairLeadAddress(leadId) {
  return REOS.ZillowGmailAddressUpgrade.repairLead(leadId);
}

function reosZillowGmailRepairImportedAddresses(limit) {
  return REOS.ZillowGmailAddressUpgrade.repairImported(limit || 500);
}

function reosZillowGmailAddressParserSelfTest() {
  var cases = [
    {
      input: "New Listing: 13 S Rosedale St Baltimore, MD 21229. Your 'Baltimore, MD' search",
      expected: ['13 S Rosedale St', 'Baltimore', 'MD', '21229']
    },
    {
      input: 'New Listing: 6237 Syringa Ln Jacksonville, FL 32211. Your For Sale search',
      expected: ['6237 Syringa Ln', 'Jacksonville', 'FL', '32211']
    },
    {
      input: 'Property: 14203 Dartwood Dr, Houston, TX 77049',
      expected: ['14203 Dartwood Dr', 'Houston', 'TX', '77049']
    },
    {
      input: '12527 Huntington Venture Dr Houston, TX 77099',
      expected: ['12527 Huntington Venture Dr', 'Houston', 'TX', '77099']
    }
  ];

  var results = cases.map(function (test) {
    var actual = REOS.ZillowGmailAddressUpgrade.normalize(test.input);
    var pass = actual.address === test.expected[0] &&
      actual.city === test.expected[1] &&
      actual.state === test.expected[2] &&
      actual.zip === test.expected[3];
    return { pass: pass, input: test.input, expected: test.expected, actual: actual };
  });

  return {
    ok: results.every(function (item) { return item.pass; }),
    passed: results.filter(function (item) { return item.pass; }).length,
    total: results.length,
    results: results
  };
}
