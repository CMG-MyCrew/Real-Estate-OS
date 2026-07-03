/**
 * REOS Enterprise v3.0 - Validation Framework
 */

var REOS = REOS || {};

REOS.Validation = (function () {
  function result(ok, errors, warnings) {
    return {
      ok: ok,
      errors: errors || [],
      warnings: warnings || []
    };
  }

  function requireFields(record, fields) {
    const errors = [];
    (fields || []).forEach(function (field) {
      const value = record ? record[field] : null;
      if (value === null || value === undefined || String(value).trim() === '') {
        errors.push(field + ' is required.');
      }
    });
    return errors;
  }

  function validateEmail(email, required) {
    if (!email && !required) return result(true);
    if (!email && required) return result(false, ['Email is required.']);
    return REOS.isValidEmail_(email)
      ? result(true)
      : result(false, ['Email is invalid.']);
  }

  function validatePhone(phone, required) {
    const normalized = REOS.normalizePhone_(phone);
    if (!normalized && !required) return result(true);
    if (!normalized && required) return result(false, ['Phone is required.']);
    if (normalized.length < 10) return result(false, ['Phone must contain at least 10 digits.']);
    return result(true);
  }

  function validateDate(value, fieldName, required) {
    if (!value && !required) return result(true);
    if (!value && required) return result(false, [fieldName + ' is required.']);
    const date = new Date(value);
    return isNaN(date.getTime())
      ? result(false, [fieldName + ' must be a valid date.'])
      : result(true);
  }

  function validateRecord(record, rules) {
    const errors = [];
    const warnings = [];

    if (rules.required) {
      errors.push.apply(errors, requireFields(record, rules.required));
    }

    if (rules.emailField && record[rules.emailField]) {
      const emailResult = validateEmail(record[rules.emailField], false);
      errors.push.apply(errors, emailResult.errors);
    }

    if (rules.phoneField && record[rules.phoneField]) {
      const phoneResult = validatePhone(record[rules.phoneField], false);
      errors.push.apply(errors, phoneResult.errors);
    }

    if (rules.dateFields) {
      rules.dateFields.forEach(function (field) {
        const dateResult = validateDate(record[field], field, false);
        errors.push.apply(errors, dateResult.errors);
      });
    }

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

  return {
    result: result,
    requireFields: requireFields,
    validateEmail: validateEmail,
    validatePhone: validatePhone,
    validateDate: validateDate,
    validateRecord: validateRecord,
    findDuplicate: findDuplicate
  };
})();
