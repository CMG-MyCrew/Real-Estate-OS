/**
 * REOS Enterprise v3.0 - Sprint 17 Backup Manager
 */
var REOS = REOS || {};

REOS.BackupManager = (function () {
  const SHEET = 'BACKUPS';
  const ID_FIELD = 'Backup ID';
  const HEADERS = ['Backup ID','Type','Status','Source Workbook ID','Backup File ID','Backup URL','Config JSON','Created By','Created At','Updated At'];
  function ensureSheets(){ ensure_(SHEET, HEADERS); }
  function ensure_(name, headers){ const ss=SpreadsheetApp.getActiveSpreadsheet(); let sh=ss.getSheetByName(name); if(!sh) sh=ss.insertSheet(name); if(sh.getLastRow()===0){ sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); sh.getRange(1,1,1,headers.length).setFontWeight('bold'); } }
  function createWorkbookBackup(label){
    REOS.Security.requireAdmin(); ensureSheets();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const name = 'REOS Backup - ' + (label || Utilities.formatDate(new Date(), REOS.CONFIG.APP.TIME_ZONE, 'yyyyMMdd_HHmmss'));
    const file = DriveApp.getFileById(ss.getId()).makeCopy(name);
    const row = REOS.Database.insert(SHEET, { Type:'Workbook', Status:'Created', 'Source Workbook ID':ss.getId(), 'Backup File ID':file.getId(), 'Backup URL':file.getUrl(), 'Config JSON':REOS.toJson_({ label:label || '' }), 'Created By':Session.getActiveUser().getEmail() || '', 'Created At':new Date(), 'Updated At':new Date() }, { idField:ID_FIELD, idPrefix:'BKP' });
    REOS.Logger.audit('Workbook backup created', { backupId: row[ID_FIELD], fileId:file.getId() });
    return row;
  }
  function createConfigBackup(){
    REOS.Security.requireAdmin(); ensureSheets();
    const props = PropertiesService.getScriptProperties().getProperties();
    return REOS.Database.insert(SHEET, { Type:'Config', Status:'Created', 'Source Workbook ID':SpreadsheetApp.getActiveSpreadsheet().getId(), 'Backup File ID':'', 'Backup URL':'', 'Config JSON':REOS.toJson_(props), 'Created By':Session.getActiveUser().getEmail() || '', 'Created At':new Date(), 'Updated At':new Date() }, { idField:ID_FIELD, idPrefix:'BKP' });
  }
  function createRollbackPoint(label){ return { workbook:createWorkbookBackup(label || 'Rollback Point'), config:createConfigBackup() }; }
  function list(options){ REOS.Security.requireAdmin(); ensureSheets(); options=options||{}; return REOS.Database.getAll(SHEET).slice().sort((a,b)=>(new Date(b['Created At']||0))-(new Date(a['Created At']||0))).slice(0, Number(options.limit||50)); }
  function validateBackup(backupId){
    REOS.Security.requireAdmin(); ensureSheets();
    const row = REOS.Database.findById(SHEET, ID_FIELD, backupId);
    if(!row) throw new Error('Backup not found: '+backupId);
    let ok = true, message = 'Backup metadata exists.';
    if(row['Backup File ID']) { try { DriveApp.getFileById(row['Backup File ID']); message = 'Backup file accessible.'; } catch(e){ ok=false; message=e.message; } }
    return { ok:ok, backup:row, message:message };
  }
  return { ensureSheets:ensureSheets, createWorkbookBackup:createWorkbookBackup, createConfigBackup:createConfigBackup, createRollbackPoint:createRollbackPoint, list:list, validateBackup:validateBackup };
})();

function reosBackupEnsureSheets(){ return REOS.BackupManager.ensureSheets(); }
function reosBackupCreateWorkbook(label){ return REOS.BackupManager.createWorkbookBackup(label); }
function reosBackupCreateConfig(){ return REOS.BackupManager.createConfigBackup(); }
function reosBackupCreateRollbackPoint(label){ return REOS.BackupManager.createRollbackPoint(label); }
function reosBackupList(options){ return REOS.BackupManager.list(options||{}); }
function reosBackupValidate(backupId){ return REOS.BackupManager.validateBackup(backupId); }
