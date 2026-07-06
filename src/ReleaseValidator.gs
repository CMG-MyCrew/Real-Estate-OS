/**
 * REOS Enterprise v3.0 - Sprint 17 Release Validator
 */
var REOS = REOS || {};

REOS.ReleaseValidator = (function () {
  function validateReleaseCandidate(options) {
    REOS.Security.requireAdmin();
    options = options || {};
    const checks = [];
    add_(checks, 'Health Check', REOS.healthCheck_().ok, 'Core workbook health check.');
    add_(checks, 'Production Hardening', hardeningOk_(), 'Latest or current production hardening readiness.');
    add_(checks, 'Environment Config', REOS.Environment ? REOS.Environment.validate().ok : false, 'Current environment is selected.');
    add_(checks, 'Backup Available', backupOk_(), 'At least one backup/rollback point exists.');
    add_(checks, 'Documents Ready', sheetExists_('DOCUMENTS'), 'Document registry exists.');
    add_(checks, 'Dashboard Exports Ready', sheetExists_('DASHBOARD_EXPORTS'), 'Dashboard export registry exists.');
    add_(checks, 'Automation Templates Ready', sheetExists_('AUTOMATION_TEMPLATES'), 'Automation templates registry exists.');
    add_(checks, 'External Integrations Safe', integrationsSafe_(), 'No live integration is missing base URL.');
    const failed = checks.filter(c => !c.pass);
    return { ok: failed.length === 0, score: Math.max(0, 100 - failed.length * 12), checks: checks, failed: failed, generatedAt: REOS.nowIso_() };
  }
  function add_(checks, name, pass, message){ checks.push({ name:name, pass:!!pass, status:pass?'Pass':'Fail', message:message }); }
  function sheetExists_(name){ return !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
  function hardeningOk_(){ try { const r = REOS.ProductionHardening.runReadinessAudit({}); return r.status !== 'Blocked'; } catch(e){ return false; } }
  function backupOk_(){ try { return REOS.BackupManager.list({limit:1}).length > 0; } catch(e){ return false; } }
  function integrationsSafe_(){ try { return REOS.Database.getAll('EXTERNAL_PROVIDERS').filter(p => p.Enabled === true && p['Dry Run'] === false && !p['Base URL']).length === 0; } catch(e){ return true; } }
  return { validateReleaseCandidate:validateReleaseCandidate };
})();

function reosReleaseValidateCandidate(options){ return REOS.ReleaseValidator.validateReleaseCandidate(options || {}); }
