'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(__dirname + '/../src/MDMorningAllInOne.gs','utf8');
new vm.Script(src);
const IDs = ['ALLEGANY','ANNE-ARUNDEL','BALTIMORE-CITY','BALTIMORE','CALVERT',
'CAROLINE','CARROLL','CECIL','CHARLES','DORCHESTER','FREDERICK','GARRETT',
'HARFORD','HOWARD','KENT','MONTGOMERY','PRINCE-GEORGE-S','QUEEN-ANNE-S',
'SOMERSET','ST-MARY-S','TALBOT','WASHINGTON','WICOMICO','WORCESTER'].map(x=>'MD-'+x);
const A = {'REOS_MD_6H_V1_ENABLED':'YES',
'REOS_MD_6H_V1_EXECUTION_APPROVED':'YES',
'REOS_MD_6H_V1_AUDIT_WRITE_APPROVED':'YES',
'REOS_MD_6H_V1_TRIGGER_INSTALL_APPROVED':'YES',
'REOS_MD_MORNING_V1_TRIGGER_INSTALL_APPROVED':'YES',
'REOS_MD_MORNING_V1_EVIDENCE_WRITE_APPROVED':'YES',
'REOS_MD_MORNING_V1_EXPECTED_SCRIPT_ID':'test-script'};
function harness(properties, missing, existing) {
 const props=Object.assign({},properties);
 const calls=[];
 const files=[];
 const triggers=(existing||['REOS_COUNTY_SYNC_ALL','notificationsDailyDigest']).map(x=>({
   getHandlerFunction:function(){return x;}
 }));
 const ctx={
  Date:Date,Math:Math,JSON:JSON,Number:Number,String:String,Object:Object,
  Array:Array,RegExp:RegExp,Error:Error,isFinite:isFinite,
  REOS:{MDSixHourCountyScheduler:{
    status:function(){return {executionMode:props.REOS_MD_6H_V1_ENABLED==='YES'?'AUDITED_DRY_RUN':'DISABLED',
      currentCycle:'2026-11-08T18:00:00Z',schedule:'6h',
      jobs:IDs.map(x=>({connectorId:x,status:'NOT_STARTED'}))};},
    tick:function(){calls.push('tick');return {ok:true};}
  }},
  REOS_COUNTY_LIST:function(){return IDs.slice(0,missing?23:24).map(x=>({
    id:x,state:'MD',enabled:true,datasets:['property_assessment']
  }));},
  PropertiesService:{getScriptProperties:function(){return {
    getProperty:function(k){return props[k]||null;},
    setProperty:function(k,v){props[k]=v;calls.push('property:'+k);}
  };}},
  DriveApp:{
    getFilesByName:function(n){return {hasNext:function(){return files.some(x=>x.name===n);}};},
    getFileById:function(id){const f=files.find(x=>x.id===id);if(!f)throw Error('missing');return f;},
    createFile:function(name,body){const f={name:name,body:body,id:'file-1',
      getId:function(){return this.id;},getName:function(){return this.name;},
      setContent:function(s){this.body=s;}};files.push(f);calls.push('drive-create');return f;}
  },
  ScriptApp:{
    getScriptId:function(){return 'test-script';},
    getProjectTriggers:function(){return triggers;},
    deleteTrigger:function(t){triggers.splice(triggers.indexOf(t),1);calls.push('delete');},
    newTrigger:function(n){return {timeBased:function(){return this;},
     everyHours:function(){return this;},everyMinutes:function(){return this;},
     create:function(){const t={getHandlerFunction:function(){return n;}};triggers.push(t);
      calls.push('trigger:'+n);return t;}};}
  }
 };
 vm.createContext(ctx);vm.runInContext(src,ctx);
 return {ctx:ctx,calls:calls,triggers:triggers,files:files,props:props};
}
let n=0;
function check(x){assert.ok(x);n++;}
const disabled=harness({});
assert.throws(()=>disabled.ctx.REOS_MD_MORNING_INSTALL_ALL(),/identity/);n++;
check(disabled.calls.length===0);
check(disabled.ctx.REOS_MD_MORNING_STATUS().jurisdictionCount===24);
check(disabled.ctx.REOS_MD_MORNING_STATUS().newlyVerifiedDistressLeads.includes('HOLD'));
const missing=harness(A,true);
assert.throws(()=>missing.ctx.REOS_MD_MORNING_INSTALL_ALL(),/24 Maryland/);n++;
check(missing.calls.length===0);
const f=harness(A,false);
const first=f.ctx.REOS_MD_MORNING_INSTALL_ALL();
check(first.ok===true&&first.created===2);
check(f.files.length===1);
check(f.triggers.some(x=>x.getHandlerFunction()==='REOS_COUNTY_SYNC_ALL'));
check(f.triggers.some(x=>x.getHandlerFunction()==='notificationsDailyDigest'));
check(JSON.parse(f.files[0].body).jurisdictions.length===24);
check(Object.values(JSON.parse(f.files[0].body).distressFeeds).every(x=>x.includes('HOLD')));
check(f.ctx.REOS_MD_MORNING_INSTALL_ALL().created===0);
check(f.files.length===1);
check(f.ctx.REOS_MD_MORNING_RESUME().ok===true);
check(f.calls.includes('tick'));
const legacy=harness(A,false,['REOS_MD_SIX_HOUR_TICK']);
assert.throws(()=>legacy.ctx.REOS_MD_MORNING_INSTALL_ALL(),/Legacy Maryland/);n++;
check(legacy.calls.length===0);
console.log('MD_MORNING_GITHUB_CONTRACT_TESTS=PASS');
console.log('ASSERTIONS='+n);
console.log('PRODUCTION_WRITES=NONE');
