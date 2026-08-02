/**
 * REOS Enterprise — Acquisition Decision Safety Gate
 *
 * Prevents AI_ACQUISITION_DECISIONS from persisting PASS when any required
 * underwriting value is zero or missing:
 *   - ARV
 *   - Asking Price
 *   - Suggested Offer / Recommended Offer
 *
 * The guard is enforced at the database persistence boundary so every current
 * and future decision engine receives the same protection.
 */
var REOS = REOS || {};

REOS.AcquisitionDecisionSafety = (function () {
  var TARGET_TABLE = 'AI_ACQUISITION_DECISIONS';
  var BLOCKED_DECISION = 'MANUAL_REVIEW';
  var BLOCKED_STATUS = 'Blocked - Insufficient Data';
  var INSTALLED_FLAG = '__acquisitionDecisionSafetyInstalled';

  function number_(value) {
    if (value === null || value === undefined || value === '') return 0;
    var normalized = typeof value === 'string'
      ? value.replace(/[$,%\s,]/g, '')
      : value;
    var parsed = Number(normalized);
    return isFinite(parsed) ? parsed : 0;
  }

  function text_(value) {
    return String(value === null || value === undefined ? '' : value).trim();
  }

  function firstNumber_(record, fields) {
    for (var index = 0; index < fields.length; index++) {
      var field = fields[index];
      if (Object.prototype.hasOwnProperty.call(record, field)) {
        return number_(record[field]);
      }
    }
    return 0;
  }

  function underwriting_(record) {
    record = record || {};
    return {
      arv: firstNumber_(record, ['ARV', 'After Repair Value']),
      askingPrice: firstNumber_(record, ['Asking Price', 'AskingPrice']),
      suggestedOffer: firstNumber_(record, [
        'Suggested Offer',
        'Recommended Offer',
        'Offer Amount'
      ])
    };
  }

  function missingFields_(values) {
    var missing = [];
    if (values.arv <= 0) missing.push('ARV');
    if (values.askingPrice <= 0) missing.push('Asking Price');
    if (values.suggestedOffer <= 0) missing.push('Suggested Offer');
    return missing;
  }

  function isPass_(record) {
    return text_(record && record.Decision).toUpperCase() === 'PASS';
  }

  function enforce(record) {
    record = Object.assign({}, record || {});
    if (!isPass_(record)) return record;

    var values = underwriting_(record);
    var missing = missingFields_(values);
    if (!missing.length) return record;

    var reason = 'PASS blocked: required underwriting value is zero or missing (' +
      missing.join(', ') + ').';

    record.Decision = BLOCKED_DECISION;
    record.Status = BLOCKED_STATUS;
    record['Next Action'] = 'Complete underwriting inputs and rerun acquisition intelligence.';

    if (Object.prototype.hasOwnProperty.call(record, 'Explanation')) {
      record.Explanation = reason + (text_(record.Explanation)
        ? ' Previous explanation: ' + text_(record.Explanation)
        : '');
    }

    if (Object.prototype.hasOwnProperty.call(record, 'Reasoning')) {
      record.Reasoning = reason + (text_(record.Reasoning)
        ? ' Previous reasoning: ' + text_(record.Reasoning)
        : '');
    }

    record['Safety Gate'] = 'BLOCKED_ZERO_UNDERWRITING';
    record['Updated At'] = new Date();
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
      if (text_(tableName) === TARGET_TABLE) values = enforce(values);
      return originalInsert.call(REOS.Database, tableName, values, options);
    };

    REOS.Database.update = function (tableName, idField, idValue, values) {
      if (text_(tableName) === TARGET_TABLE) values = enforce(values);
      return originalUpdate.call(
        REOS.Database,
        tableName,
        idField,
        idValue,
        values
      );
    };

    REOS.Database[INSTALLED_FLAG] = true;
    return { ok: true, installed: true, targetTable: TARGET_TABLE };
  }

  function remediateExisting() {
    if (!REOS.Database) {
      throw new Error('REOS.Database unavailable.');
    }

    var rows = REOS.Database.getAll(TARGET_TABLE) || [];
    var corrected = 0;

    rows.forEach(function (row) {
      if (!isPass_(row)) return;
      var sanitized = enforce(row);
      if (text_(sanitized.Decision).toUpperCase() === 'PASS') return;

      var decisionId = row['Decision ID'];
      if (!decisionId) return;

      REOS.Database.update(
        TARGET_TABLE,
        'Decision ID',
        decisionId,
        sanitized
      );
      corrected++;
    });

    return {
      ok: true,
      scanned: rows.length,
      corrected: corrected,
      targetTable: TARGET_TABLE
    };
  }

  return {
    install: install,
    enforce: enforce,
    remediateExisting: remediateExisting
  };
})();

// zzz_ file naming intentionally places the safety patch after core modules.
REOS.AcquisitionDecisionSafety.install();

function REOS_ACQUISITION_DECISION_SAFETY_INSTALL() {
  return REOS.AcquisitionDecisionSafety.install();
}

function REOS_ACQUISITION_DECISION_SAFETY_REMEDIATE() {
  return REOS.AcquisitionDecisionSafety.remediateExisting();
}

function REOS_ACQUISITION_DECISION_SAFETY_TEST() {
  var guarded = REOS.AcquisitionDecisionSafety.enforce({
    Decision: 'PASS',
    ARV: 0,
    'Asking Price': 125000,
    'Suggested Offer': 75000
  });

  if (guarded.Decision === 'PASS') {
    throw new Error('Safety gate failed to block PASS with zero ARV.');
  }

  var valid = REOS.AcquisitionDecisionSafety.enforce({
    Decision: 'PASS',
    ARV: 200000,
    'Asking Price': 125000,
    'Suggested Offer': 90000
  });

  if (valid.Decision !== 'PASS') {
    throw new Error('Safety gate incorrectly blocked a complete decision.');
  }

  return {
    ok: true,
    blockedDecision: guarded.Decision,
    validDecision: valid.Decision
  };
}
