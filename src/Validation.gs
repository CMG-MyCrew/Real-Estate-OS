/**
 * REOS Enterprise v3.0 - Validation Framework
 *
 * Centralized validation helpers for records, lookup values, duplicates,
 * primitive fields, and clean error responses across REOS modules.
 */

var REOS = REOS || {};

REOS.Validation = (function () {
  function result(ok, errors, warnings, data) {
    return {
      ok: ok,
      errors: errors || [],
      warnings: warnings || [],
      data: data || null
    };
  }

  function success(data, warnings) {
    return result(true, [], warnings || [], data || null);
  }

  function failure(errors, warnings, data) {
    return result(false, Array.isArray(errors) ? errors : [String(errors)], warnings || [], data || null);
  }

  function throwIfInvalid(validation) {
    if (!validation || validation.ok) return true;
    throw new Error(validation.errors.join(' '));
  }

  function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  function requireFields(record, fields) {
    const errors = [];
    (fields || []).forEach(function (field) {
      const value = record ? record[field] : null;
      if (isBlank(value)) errors.push(field + ' is required.');
    });
    return errors;
  }

  function validateEmail(email, required) {
    if (isBlank(email) && !required) return success();
    if (isBlank(email) && required) return failure('Email is required.');
    return REOS.isValidEmail_(email) ? success() : failure('Email is invalid.');
  }

  function validatePhone(phone, required) {
    const normalized = REOS.normalizePhone_(phone);
    if (!normalized && !required) return success();
    if (!normalized && required) return failure('Phone is required.');
    if (normalized.length < 10) return failure('Phone must contain at least 10 digits.');
    return success({ normalized: normalized });
  }

  function validateDate(value, fieldName, required) {
    if (isBlank(value) && !required) return success();
    if (isBlank(value) && required) return failure(fieldName + ' is required.');
    const date = new Date(value);
    return isNaN(date.getTime()) ? failure(fieldName + ' must be a valid date.') : success({ date: date });
  }

  function validateNumber(value, fieldName, options) {
    options = options || {};
    if (isBlank(value) && !options.required) return success();
    if (isBlank(value) && options.required) return failure(fieldName + ' is required.');

    const number = Number(value);
    if (isNaN(number)) return failure(fieldName + ' must be a valid number.');
    if (options.min !== undefined && number < options.min) return failure(fieldName + ' must be at least ' + options.min + '.');
    if (options.max !== undefined && number > options.max) return failure(fieldName + ' must be no more than ' + options.max + '.');

    return success({ number: number });
  }

  function validateBoolean(value, fieldName, options) {
    options = options || {};
    if (isBlank(value) && !options.required) return success();
    if (isBlank(value) && options.required) return failure(fieldName + ' is required.');

    const normalized = String(value).toLowerCase();
    const valid = value === true || value === false || ['true', 'false', 'yes', 'no', '1', '0'].indexOf(normalized) !== -1;
    return valid ? success() : failure(fieldName + ' must be true or false.');
  }

  function getLookupValues(category) {
    if (!REOS.CONFIG || !REOS.CONFIG.SHEETS || !REOS.CONFIG.SHEETS.LOOKUPS) return [];
    const records = REOS.Database.getAll(REOS.CONFIG.SHEETS.LOOKUPS);
    return records
      .filter(function (record) {
        return String(record.Category || '') === String(category || '') && record.Active !== false;
      })
      .sort(function (a, b) { return Number(a['Sort Order'] || 999) - Number(b['Sort Order'] || 999); })
      .map(function (record) { return String(record.Value || '').trim(); })
      .filter(Boolean);
  }

  function validateAllowedValue(value, fieldName, allowedValues, required) {
    if (isBlank(value) && !required) return success();
    if (isBlank(value) && required) return failure(fieldName + ' is required.');

    const normalized = String(value || '').trim().toLowerCase();
    const allowed = (allowedValues || []).map(function (item) { return String(item || '').trim(); }).filter(Boolean);
    const allowedNormalized = allowed.map(function (item) { return item.toLowerCase(); });

    if (allowedNormalized.indexOf(normalized) === -1) {
      return failure(fieldName + ' must be one of: ' + allowed.join(', ') + '.');
    }

    return success();
  }

  function validateLookupValue(value, fieldName, category, required) {
    const allowed = getLookupValues(category);
    if (!allowed.length) return success(null, [category + ' lookup has no configured values.']);
    return validateAllowedValue(value, fieldName, allowed, required);
  }

  function validateRecord(record, rules) {
    rules = rules || {};
    const errors = [];
    const warnings = [];

    if (rules.required) errors.push.apply(errors, requireFields(record, rules.required));

    if (rules.emailField && !isBlank(record[rules.emailField])) {
      errors.push.apply(errors, validateEmail(record[rules.emailField], false).errors);
    }

    if (rules.phoneField && !isBlank(record[rules.phoneField])) {
      errors.push.apply(errors, validatePhone(record[rules.phoneField], false).errors);
    }

    (rules.dateFields || []).forEach(function (field) {
      errors.push.apply(errors, validateDate(record[field], field, false).errors);
    });

    (rules.numberFields || []).forEach(function (rule) {
      if (typeof rule === 'string') rule = { field: rule };
      errors.push.apply(errors, validateNumber(record[rule.field], rule.field, rule).errors);
    });

    (rules.booleanFields || []).forEach(function (rule) {
      if (typeof rule === 'string') rule = { field: rule };
      errors.push.apply(errors, validateBoolean(record[rule.field], rule.field, rule).errors);
    });

    (rules.allowedValues || []).forEach(function (rule) {
      errors.push.apply(errors, validateAllowedValue(record[rule.field], rule.field, rule.values, rule.required).errors);
    });

    (rules.lookupValues || []).forEach(function (rule) {
      const lookupResult = validateLookupValue(record[rule.field], rule.field, rule.category, rule.required);
      errors.push.apply(errors, lookupResult.errors);
      warnings.push.apply(warnings, lookupResult.warnings);
    });

    return result(errors.length === 0, errors, warnings);
  }

  function findDuplicate(sheetName, fieldName, value, excludeIdField, excludeIdValue) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;

    const records = REOS.Database.getAll(sheetName);
    return records.find(function (record) {
      const sameValue = String(record[fieldName] || '').trim().toLowerCase() === normalized;
      const excluded = excludeIdField && String(record[excludeIdField] || '') === String(excludeIdValue || '');
      return sameValue && !excluded;
    }) || null;
  }

  function assertUnique(sheetName, fieldName, value, excludeIdField, excludeIdValue) {
    const duplicate = findDuplicate(sheetName, fieldName, value, excludeIdField, excludeIdValue);
    return duplicate ? failure('Duplicate value found for ' + fieldName + ': ' + value + '.') : success();
  }

  function sanitizeText(value, maxLength) {
    let text = String(value || '').trim();
    if (maxLength && text.length > maxLength) text = text.substring(0, maxLength);
    return text;
  }

  function cleanRecord(record, fields) {
    const cleaned = Object.assign({}, record || {});
    (fields || []).forEach(function (field) {
      if (cleaned[field] !== undefined && cleaned[field] !== null) cleaned[field] = sanitizeText(cleaned[field]);
    });
    return cleaned;
  }

  return {
    result: result,
    success: success,
    failure: failure,
    throwIfInvalid: throwIfInvalid,
    isBlank: isBlank,
    requireFields: requireFields,
    validateEmail: validateEmail,
    validatePhone: validatePhone,
    validateDate: validateDate,
    validateNumber: validateNumber,
    validateBoolean: validateBoolean,
    validateAllowedValue: validateAllowedValue,
    validateLookupValue: validateLookupValue,
    validateRecord: validateRecord,
    getLookupValues: getLookupValues,
    findDuplicate: findDuplicate,
    assertUnique: assertUnique,
    sanitizeText: sanitizeText,
    cleanRecord: cleanRecord
  };
})();

function reosValidateRecord(record, rules) {
  return REOS.Validation.validateRecord(record || {}, rules || {});
}
