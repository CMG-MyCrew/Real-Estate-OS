/**
 * REOS Enterprise v3.0 - Sprint 17 Environment Management
 */
var REOS = REOS || {};

REOS.Environment = (function () {
  const SHEET = 'ENVIRONMENTS';
  const ID_FIELD = 'Environment ID';
  const HEADERS = ['Environment ID','Name','Type','Workbook ID','Script ID','Status','Is Current','Config JSON','Created At','Updated At'];
  const DEFAULTS = [
    { Name:'Development', Type:'dev', Status:'Active', 'Is Current':true },
    { Name:'Test', Type:'test', Status:'Planned', 'Is Current':false },
    { Name:'Staging', Type:'staging', Status:'Planned', 'Is Current':false },
    { Name:'Production', Type:'production', Status:'Planned', 'Is Current':false }
  ];

  function ensureSheets() { ensure_(SHEET, HEADERS); }
  function ensure_(name, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1,1,1,headers.length).setValues([headers]);
      sh.setFrozenRows(1); sh.getRange(1,1,1,headers.length).setFontWeight('bold');
    }
  }
  function seed() {
    REOS.Security.requireAdmin(); ensureSheets();
    const existing = REOS.Database.getAll(SHEET).map(r => String(r.Type || '').toLowerCase());
    let created = 0;
    DEFAULTS.forEach(e => {
      if (existing.indexOf(e.Type) !== -1) return;
      REOS.Database.insert(SHEET, Object.assign({ 'Workbook ID': SpreadsheetApp.getActiveSpreadsheet().getId(), 'Script ID':'', 'Config JSON':'{}', 'Created At':new Date(), 'Updated At':new Date() }, e), { idField:ID_FIELD, idPrefix:'ENV' });
      created++;
    });
    return { ok:true, created:created };
  }
  function list() { REOS.Security.requireAdmin(); ensureSheets(); return REOS.Database.getAll(SHEET); }
  function current() { return list().filter(r => r['Is Current'] === true)[0] || null; }
  function setCurrent(environmentId) {
    REOS.Security.requireAdmin(); ensureSheets();
    REOS.Database.getAll(SHEET).forEach(r => REOS.Database.update(SHEET, ID_FIELD, r[ID_FIELD], { 'Is Current': r[ID_FIELD] === environmentId, 'Updated At': new Date() }));
    return current();
  }
  function validate() {
    const env = current();
    return { ok: !!env, environment: env, issues: env ? [] : ['No current environment selected.'] };
  }
  return { ensureSheets:ensureSheets, seed:seed, list:list, current:current, setCurrent:setCurrent, validate:validate };
})();

function reosEnvironmentEnsureSheets(){ return REOS.Environment.ensureSheets(); }
function reosEnvironmentSeed(){ return REOS.Environment.seed(); }
function reosEnvironmentList(){ return REOS.Environment.list(); }
function reosEnvironmentCurrent(){ return REOS.Environment.current(); }
function reosEnvironmentSetCurrent(environmentId){ return REOS.Environment.setCurrent(environmentId); }
function reosEnvironmentValidate(){ return REOS.Environment.validate(); }
