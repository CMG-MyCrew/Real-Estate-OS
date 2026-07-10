/**
 * REOS Enterprise v3.0 - Sprint 17 Release Center
 */
var REOS = REOS || {};

REOS.ReleaseCenter = (function () {
  const RELEASES = 'RELEASE_CANDIDATES';
  const DEPLOYMENTS = 'DEPLOYMENTS';
  const ID_FIELD = 'Release ID';
  const RELEASE_HEADERS = ['Release ID','Version','Build','Status','Environment','Readiness Score','Validation JSON','Backup ID','Approved By','Approved At','Created By','Created At','Updated At'];
  const DEPLOY_HEADERS = ['Deployment ID','Release ID','Version','Environment','Status','Started At','Finished At','Duration Ms','User','Notes'];
  function ensureSheets(){ ensure_(RELEASES, RELEASE_HEADERS); ensure_(DEPLOYMENTS, DEPLOY_HEADERS); }
  function ensure_(name, headers){ const ss=SpreadsheetApp.getActiveSpreadsheet(); let sh=ss.getSheetByName(name); if(!sh) sh=ss.insertSheet(name); if(sh.getLastRow()===0){ sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); sh.getRange(1,1,1,headers.length).setFontWeight('bold'); } }
  function getDashboard(){
    REOS.Security.requireAdmin(); ensureSheets();
    return { ok:true, generatedAt:REOS.nowIso_(), currentEnvironment: REOS.Environment ? REOS.Environment.current() : null, releases:listReleases({limit:20}), deployments:listDeployments({limit:20}), backups: REOS.BackupManager ? REOS.BackupManager.list({limit:10}) : [] };
  }
  function buildReleaseCandidate(options){
    REOS.Security.requireAdmin(); ensureSheets(); options=options||{};
    if(REOS.Environment) REOS.Environment.seed();
    const backup = REOS.BackupManager ? REOS.BackupManager.createRollbackPoint('RC ' + (options.version || REOS.CONFIG.APP.VERSION)) : null;
    const validation = REOS.ReleaseValidator.validateReleaseCandidate(options);
    const env = REOS.Environment ? REOS.Environment.current() : null;
    const row = REOS.Database.insert(RELEASES, { Version: options.version || REOS.CONFIG.APP.VERSION, Build: buildNumber_(), Status: validation.ok ? 'Candidate' : 'Blocked', Environment: env ? env.Name : '', 'Readiness Score': validation.score, 'Validation JSON': REOS.toJson_(validation), 'Backup ID': backup && backup.workbook ? backup.workbook['Backup ID'] : '', 'Approved By':'', 'Approved At':'', 'Created By':Session.getActiveUser().getEmail() || '', 'Created At':new Date(), 'Updated At':new Date() }, { idField:ID_FIELD, idPrefix:'RC' });
    REOS.Logger.audit('Release candidate built', { releaseId: row[ID_FIELD], status: row.Status, score: row['Readiness Score'] });
    return { ok: validation.ok, release: row, validation: validation, backup: backup };
  }
  function approveRelease(releaseId){
    REOS.Security.requireAdmin(); ensureSheets();
    const release = REOS.Database.findById(RELEASES, ID_FIELD, releaseId);
    if(!release) throw new Error('Release not found: '+releaseId);
    const validation = JSON.parse(release['Validation JSON'] || '{}');
    if(!validation.ok) throw new Error('Blocked release cannot be approved.');
    return REOS.Database.update(RELEASES, ID_FIELD, releaseId, { Status:'Approved', 'Approved By':Session.getActiveUser().getEmail() || '', 'Approved At':new Date(), 'Updated At':new Date() });
  }
  function recordDeployment(releaseId, environment, notes){
    REOS.Security.requireAdmin(); ensureSheets();
    const started = new Date();
    const release = REOS.Database.findById(RELEASES, ID_FIELD, releaseId);
    if(!release) throw new Error('Release not found: '+releaseId);
    const row = REOS.Database.insert(DEPLOYMENTS, { 'Release ID':releaseId, Version:release.Version, Environment:environment || release.Environment || 'Production', Status:'Recorded', 'Started At':started, 'Finished At':new Date(), 'Duration Ms':new Date().getTime()-started.getTime(), User:Session.getActiveUser().getEmail() || '', Notes:notes || '' }, { idField:'Deployment ID', idPrefix:'DEP' });
    REOS.Database.update(RELEASES, ID_FIELD, releaseId, { Status:'Deployed', 'Updated At':new Date() });
    return row;
  }
  function listReleases(options){ ensureSheets(); options=options||{}; return REOS.Database.getAll(RELEASES).slice().sort((a,b)=>(new Date(b['Created At']||0))-(new Date(a['Created At']||0))).slice(0, Number(options.limit||50)); }
  function listDeployments(options){ ensureSheets(); options=options||{}; return REOS.Database.getAll(DEPLOYMENTS).slice().sort((a,b)=>(new Date(b['Started At']||0))-(new Date(a['Started At']||0))).slice(0, Number(options.limit||50)); }
  function buildNumber_(){ return Utilities.formatDate(new Date(), REOS.CONFIG.APP.TIME_ZONE, 'yyyyMMddHHmmss'); }
  return { ensureSheets:ensureSheets, getDashboard:getDashboard, buildReleaseCandidate:buildReleaseCandidate, approveRelease:approveRelease, recordDeployment:recordDeployment, listReleases:listReleases, listDeployments:listDeployments };
})();

function reosReleaseCenterEnsureSheets(){ return REOS.ReleaseCenter.ensureSheets(); }
function reosReleaseCenterDashboard(){ return REOS.ReleaseCenter.getDashboard(); }
function reosReleaseCenterBuild(options){ return REOS.ReleaseCenter.buildReleaseCandidate(options||{}); }
function reosReleaseCenterApprove(releaseId){ return REOS.ReleaseCenter.approveRelease(releaseId); }
function reosReleaseCenterRecordDeployment(releaseId, environment, notes){ return REOS.ReleaseCenter.recordDeployment(releaseId, environment, notes); }
function showReleaseCenter(){ REOS.Security.requireAdmin(); SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('ReleaseCenterUI').setTitle('REOS Release Center').setWidth(1200).setHeight(800), 'REOS Release Center'); }
