/* Offline Maryland scheduler contract tests. No HTTP, Apps Script, or Google writes. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '../src/MDSixHourCountyScheduler.gs'), 'utf8');
const md = [
 'MD-ALLEGANY','MD-ANNE-ARUNDEL','MD-BALTIMORE-CITY','MD-BALTIMORE','MD-CALVERT',
 'MD-CAROLINE','MD-CARROLL','MD-CECIL','MD-CHARLES','MD-DORCHESTER','MD-FREDERICK',
 'MD-GARRETT','MD-HARFORD','MD-HOWARD','MD-KENT','MD-MONTGOMERY',
 'MD-PRINCE-GEORGE-S','MD-QUEEN-ANNE-S','MD-SOMERSET','MD-ST-MARY-S','MD-TALBOT',
 'MD-WASHINGTON','MD-WICOMICO','MD-WORCESTER'
];
const prefix='REOS_MD_6H_V1_';
let assertions=0;
function check(condition,message) { assert.ok(condition,message); assertions++; }
function make(options={}) {
  const properties={...(options.properties||{})};
  const writes=[];
  const calls=[];
  const triggers=[{getHandlerFunction:()=> 'REOS_COUNTY_SYNC_ALL'}];
  let registration=0;
  let lockObtained=0;
  let lockReleased=0;
  const all=(options.missingOne ? md.slice(1):md).map(id=>({ id, state:'MD', county:id, datasets:['property_assessment'], enabled:true }));
  all.push({id:'PA-PHILADELPHIA',state:'PA',datasets:['tax_delinquent'],enabled:true});
  const sdk={
    list:()=>all,
    get:id=>all.find(x=>x.id===id)||null,
    run:(id,config)=>{
      calls.push({id,config});
      if (options.behavior) return options.behavior(id,config,calls.length);
      return {ok:true,connectorId:id,dataset:config.dataset,runId:'RUN-'+calls.length,
        stats:{fetched:25,valid:25,failed:0},nextCursor:String(config.cursor||'')};
    }
  };
  const api={
    PropertiesService:{getScriptProperties:()=>({
      getProperty:(k)=>Object.prototype.hasOwnProperty.call(properties,k)?properties[k]:null,
      setProperty:(k,v)=>{properties[k]=v;writes.push({key:k,value:v});}
    })},
    LockService:{getScriptLock:()=>({
      tryLock:()=>{lockObtained++;return options.locked!==true;},
      releaseLock:()=>{lockReleased++;}
    })},
    ScriptApp:{
      getProjectTriggers:()=>triggers,
      newTrigger:(handler)=>({timeBased(){return this;},everyHours(hours){this.period=hours;return this;},everyMinutes(minutes){this.period=minutes;return this;},
        create(){const t={getHandlerFunction:()=>handler,getUniqueId:()=>handler+'_id'};triggers.push(t);return t;}})
    },
    REOS:{CountyConnectorSDK:sdk},
    REOS_COUNTY_REGISTER_CONNECTORS_:()=>{registration++;},
    console,Date,Math,Number,String,JSON,Object,Array,RegExp,Error,isFinite
  };
  vm.createContext(api);
  vm.runInContext(code,api,{filename:'MDSixHourCountyScheduler.gs'});
  return {api,properties,writes,calls,triggers,get registration(){return registration;},get lockObtained(){return lockObtained;},get lockReleased(){return lockReleased;}};
}
const instant=new Date('2026-11-08T23:21:00.000Z');
const approved={
  [prefix+'ENABLED']:'YES',
  [prefix+'EXECUTION_APPROVED']:'YES',
  [prefix+'MODE']:'AUDITED_DRY_RUN',
  [prefix+'AUDIT_WRITE_APPROVED']:'YES'
};
{
  const f=make();
  check(f.api.REOS_MD_SIX_HOUR_TICK().status==='DISABLED_NO_WRITES','disabled by default');
  check(f.calls.length===0 && f.writes.length===0,'no SDK or property writes when disabled');
  check(f.triggers.length===1,'no trigger automatically created');
  check(f.api.REOS_MD_SIX_HOUR_STATUS().jobs.length===24,'read-only status sees all 24 MD jobs');
  check(f.writes.length===0,'status has zero mutations');
  check(f.api.REOS_MD_SIX_HOUR_INSTALL_TRIGGERS().ok===false,'install denied without approval');
}
{
  const f=make({properties:approved,missingOne:true});
  assert.throws(()=>f.api.REOS.MDSixHourCountyScheduler.tick(instant),/coverage mismatch/);
  assertions++;
  check(f.calls.length===0 && f.writes.length===0,'coverage missing -> no run or checkpoint write');
  check(f.lockReleased===1,'lock released after coverage failure');
}
{
  const f=make({properties:approved,locked:true});
  check(f.api.REOS.MDSixHourCountyScheduler.tick(instant).status==='LOCKED_NO_WRITES','concurrency locked');
  check(f.calls.length===0 && f.writes.length===0,'locked run has no writes');
}
{
  const f=make({properties:approved});
  const r=f.api.REOS.MDSixHourCountyScheduler.tick(instant);
  check(r.scope==='MARYLAND_ONLY' && r.pagesAttempted===8,'max eight scoped pages per tick');
  check(f.calls.length===8 && f.calls.every(c=>c.id.startsWith('MD-')&&c.config.dryRun===true),'MD-only audited dry runs');
  check(f.writes.filter(w=>w.key.includes('_CP_')).length===8,'independent checkpoint per MD county');
  check(r.processed.every(x=>x.status==='COMPLETE'),'final short page completes each job');
  check(f.lockObtained===1 && f.lockReleased===1,'scoped lock acquired/released');
  const r2=f.api.REOS.MDSixHourCountyScheduler.tick(instant);
  check(r2.processed.every(x=>x.id.startsWith('MD-')),'round robin remains Maryland-only');
  check(f.calls.length===16,'next tick advances to other counties');
  check(f.writes.every(w=>w.key.startsWith(prefix)),'no PA/global property writes');
}
{
  const f=make({properties:approved,behavior:(id,cfg)=>({ok:true,connectorId:id,dataset:cfg.dataset,
    stats:{fetched:100,valid:100,failed:0}, nextCursor:String(Number(cfg.cursor||0)+100)})});
  f.api.REOS.MDSixHourCountyScheduler.tick(instant);
  const cp=JSON.parse(f.properties[prefix+'CP_MD-ALLEGANY_PROPERTY_ASSESSMENT']);
  check(cp.status==='ACTIVE' && cp.cursor==='100','full page stores advancing cursor');
  for(let i=0;i<3;i++) f.api.REOS.MDSixHourCountyScheduler.tick(instant);
  const cp2=JSON.parse(f.properties[prefix+'CP_MD-ALLEGANY_PROPERTY_ASSESSMENT']);
  check(cp2.status==='ACTIVE' && cp2.cursor==='200','round-robin resumes same county with cursor');
}
{
  const f=make({properties:approved,behavior:(id,cfg)=>({ok:true,connectorId:id,dataset:cfg.dataset,
    stats:{fetched:10,valid:9,failed:1},nextCursor:''})});
  const r=f.api.REOS.MDSixHourCountyScheduler.tick(instant);
  check(r.processed.every(x=>x.status==='BLOCKED'),'partial validation blocks jobs');
  check(JSON.parse(f.properties[prefix+'CP_MD-ALLEGANY_PROPERTY_ASSESSMENT']).cursor==='','blocked does not advance checkpoint');
  f.api.REOS.MDSixHourCountyScheduler.tick(instant);
  check(f.calls.length===16,'unblocked counties process, blocked excluded');
}
{
  const f=make({properties:approved,behavior:(id,cfg)=>({ok:true,connectorId:id,dataset:cfg.dataset,
    stats:{fetched:100,valid:100,failed:0},nextCursor:String(cfg.cursor||'')})});
  const r=f.api.REOS.MDSixHourCountyScheduler.tick(instant);
  check(r.processed.every(x=>x.status==='BLOCKED'),'non-advancing full-page cursor blocks');
}
{
  const f=make({properties:approved,behavior:(id,cfg)=>({ok:true,connectorId:id,dataset:cfg.dataset,
    stats:{fetched:0,valid:0,failed:0},nextCursor:''})});
  const r=f.api.REOS.MDSixHourCountyScheduler.tick(instant);
  check(r.processed.every(x=>x.status==='BLOCKED'),'empty initial source page blocks certification');
}
{
  const p={...approved,[prefix+'MODE']:'LIVE'};
  const f=make({properties:p});
  check(f.api.REOS.MDSixHourCountyScheduler.tick(instant).status==='DISABLED_NO_WRITES','live requires independent approvals');
  check(f.calls.length===0,'unapproved live does not call SDK');
}
{
  const p={...approved,[prefix+'MODE']:'LIVE',[prefix+'LIVE_PERSISTENCE_APPROVED']:'YES',
    [prefix+'SOURCE_IDENTITY_CERTIFIED']:'YES'};
  const f=make({properties:p});
  const r=f.api.REOS.MDSixHourCountyScheduler.tick(instant);
  check(r.mode==='LIVE' && f.calls.length===16,'approved live runs preflight+live per page');
  check(f.calls.every((c,i)=>c.config.dryRun===(i%2===0)),'live always follows dry-run preflight');
}
{
  const p={...approved,[prefix+'TRIGGER_INSTALL_APPROVED']:'YES'};
  const f=make({properties:p});
  const r=f.api.REOS_MD_SIX_HOUR_INSTALL_TRIGGERS();
  check(r.installed.length===2,'MD six-hour and 15-min resume triggers created when authorized');
  check(f.triggers.some(x=>x.getHandlerFunction()==='REOS_COUNTY_SYNC_ALL'),'PA/global trigger preserved');
  check(f.api.REOS_MD_SIX_HOUR_INSTALL_TRIGGERS().installed.length===0,'idempotent trigger setup');
}
console.log('MD_OFFLINE_CONTRACT_TESTS=PASS');
console.log('ASSERTIONS='+assertions);
console.log('REMOTE_REQUESTS=NONE');
console.log('GOOGLE_OR_APPS_SCRIPT_WRITES=NONE');
console.log('PRODUCTION_DECISION=NO_GO_AWAIT_SOURCE_CERTIFICATION_AND_EXPLICIT_APPROVAL');
