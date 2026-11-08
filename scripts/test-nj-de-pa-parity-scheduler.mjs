#!/usr/bin/env node
/**
 * REOS NJ/DE Philadelphia-parity scheduler: offline invariant tests.
 * NEVER calls Google, ScriptApp, PropertiesService or REOS.Database.
 */
'use strict';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'..','src','NJDECountyParityScheduler.gs'),'utf8');
const forbidden = ['ScriptApp.','PropertiesService.','UrlFetchApp.','REOS.Database.','CountyConnectorSDK.run(','REOS_COUNTY_INSTALL_DAILY_TRIGGER('];
// Comments may name these APIs; executable calls must not.
const executable=src.split('\n').filter(x=>!x.trim().startsWith('*')&&!x.trim().startsWith('//')).join('\n');
for(const token of forbidden) assert(!executable.includes(token),'Unsafe runtime service referenced: '+token);

const sandbox={REOS:{}, fakeWrites:0};
vm.createContext(sandbox);
new vm.Script(src,{filename:'NJDECountyParityScheduler.gs'}).runInContext(sandbox);
const sdk=sandbox.REOS.NJDECountyParityScheduler;
const raw=(v)=>JSON.parse(JSON.stringify(v));
const NJ=raw(sandbox.REOS_NJ_COUNTY_SCHEDULE_PREVIEW());
const DE=raw(sandbox.REOS_DE_COUNTY_SCHEDULE_PREVIEW());
assert.equal(NJ.state,'NJ');
assert.equal(DE.state,'DE');
assert.equal(NJ.countyCount,21);
assert.equal(DE.countyCount,3);
assert.equal(NJ.plannedFeedSlots,105);
assert.equal(DE.plannedFeedSlots,15);
assert.deepEqual(NJ.feedOrder,['code_violations','vacant_properties','sheriff_tax_sales','sheriff_mortgage_sales','probate']);
assert.deepEqual(DE.feedOrder,NJ.feedOrder);
assert.equal(new Set(NJ.tasks.map(x=>x.countyId)).size,21);
assert.equal(new Set(DE.tasks.map(x=>x.countyId)).size,3);
assert(NJ.tasks.every(x=>x.status==='HOLD_NO_CERTIFIED_DISTRESS_SOURCE' && !x.ingestionAuthorized && !x.sourceCertified));
assert(DE.tasks.every(x=>x.status==='HOLD_NO_CERTIFIED_DISTRESS_SOURCE' && !x.ingestionAuthorized && !x.sourceCertified));
assert.equal(NJ.availableInventoryDataset,'property_assessment');
assert.equal(DE.availableInventoryDataset,'parcel_inventory');
assert.notEqual(NJ.checkpointNamespace,DE.checkpointNamespace);
assert.notEqual(NJ.auditNamespace,DE.auditNamespace);
assert(!NJ.checkpointNamespace.startsWith('REOS_PA_'));
assert(!DE.checkpointNamespace.startsWith('REOS_PA_'));
assert.equal(NJ.suggestedTrigger.installed,false);
assert.equal(DE.suggestedTrigger.installed,false);
assert.equal(NJ.suggestedTrigger.proposedHourLocal,5);
assert.equal(DE.suggestedTrigger.proposedHourLocal,6);
console.log('NJ_21_COUNTIES_105_FEED_SLOTS=PASS');
console.log('DE_3_COUNTIES_15_FEED_SLOTS=PASS');
console.log('PA_FIVE_FEED_ORDER_AND_STATE_ISOLATION=PASS');

for(const handler of ['REOS_NJ_COUNTY_SCHEDULED_RUN','REOS_DE_COUNTY_SCHEDULED_RUN']){
  const outcome=raw(sandbox[handler]());
  assert.equal(outcome.status,'HOLD_NJ_DE_ACTIVATION_NOT_AUTHORIZED');
  assert.equal(outcome.executed,false);
  assert.equal(outcome.checkpointWrites,0);
  assert.equal(outcome.sourceRequests,0);
  assert.equal(outcome.auditWrites,0);
  assert.equal(outcome.liveIngestion,false);
}
for(const handler of ['REOS_NJ_COUNTY_INSTALL_TRIGGER','REOS_DE_COUNTY_INSTALL_TRIGGER']){
  assert.throws(()=>sandbox[handler](),/NJ_DE_TRIGGER_INSTALLATION_NOT_AUTHORIZED/);
}
console.log('PRODUCTION_HANDLERS_AND_TRIGGER_INSTALL_FAIL_CLOSED=PASS');

function mockIo(state) {
  const backing=Object.create(null), audits=[], calls=[];
  const obj={
    mockMode:'REOS_OFFLINE_IN_MEMORY_TEST_ONLY',
    isolatedFromGoogle:true,state,
    syntheticSourceKeys:Object.create(null),
    backing,audits,calls,
    load(key){ assert(key.includes('_'+state+'_'));return backing[key] || null;},
    save(key,v){assert(key.includes('_'+state+'_'));backing[key]=JSON.parse(JSON.stringify(v));},
    auditMock(key,v){assert(key.includes('_'+state+'_'));audits.push(JSON.parse(JSON.stringify(v)));},
    fetchMockPage(task){calls.push(JSON.parse(JSON.stringify(task)));return {records:[],nextCursor:'',more:false};}
  };
  return obj;
}
function tick(state,io){return raw(sdk.rehearsalTick(state,io,{mode:'OFFLINE_TEST',noRemoteServices:true}));}
let njIo=mockIo('NJ'),deIo=mockIo('DE');
const firstNJ=NJ.tasks[0],firstDE=DE.tasks[0];
assert.equal(tick('NJ',njIo).status,'HOLD_NO_CERTIFIED_DISTRESS_SOURCE');
assert.equal(njIo.calls.length,0);
assert.equal(Object.keys(njIo.backing).length,0);
assert.equal(njIo.audits.length,0);
assert.equal(tick('DE',deIo).status,'HOLD_NO_CERTIFIED_DISTRESS_SOURCE');
assert.equal(deIo.calls.length,0);
console.log('UNCONFIGURED_FEEDS_NO_NETWORK_NO_CHECKPOINT_WRITES=PASS');

njIo.syntheticSourceKeys[['NJ',firstNJ.countyId,firstNJ.feed].join('|')]='MOCK_FIXTURE_ONLY';
njIo.fetchMockPage=(task)=>{
  njIo.calls.push(raw(task));
  if(task.cursor==='')return {
    records:[{state:'NJ',countyId:firstNJ.countyId,feed:firstNJ.feed,sourceRecordId:'source_001'}],
    nextCursor:'next_1',more:true
  };
  return {
    records:[{state:'NJ',countyId:firstNJ.countyId,feed:firstNJ.feed,sourceRecordId:'source_002'}],
    nextCursor:'',more:false
  };
};
let r=tick('NJ',njIo);
assert.equal(r.ok,true);
assert.equal(r.status,'MOCK_PAGE_VERIFIED');
assert.equal(r.checkpoint.cursor,'next_1');
assert.equal(r.checkpoint.taskIndex,0);
assert.equal(r.checkpoint.pagesProcessed,1);
assert.equal(r.recordsPersisted,0);
assert.equal(njIo.audits.length,1);
r=tick('NJ',njIo);
assert.equal(r.ok,true);
assert.equal(r.checkpoint.cursor,'');
assert.equal(r.checkpoint.taskIndex,1);
assert.equal(r.checkpoint.pagesProcessed,2);
assert.equal(r.recordsPersisted,0);
assert.equal(njIo.audits.length,2);
assert.equal(tick('NJ',njIo).status,'HOLD_NO_CERTIFIED_DISTRESS_SOURCE');
assert.equal(deIo.calls.length,0);
assert.equal(Object.keys(deIo.backing).length,0);
console.log('PAGINATION_CURSOR_CHECKPOINT_AND_AUDIT_REHEARSAL=PASS');
console.log('STATE_CHECKPOINT_REPLAY_ISOLATION=PASS');

deIo.syntheticSourceKeys[['DE',firstDE.countyId,firstDE.feed].join('|')]='MOCK_FIXTURE_ONLY';
deIo.fetchMockPage=()=>({records:[{state:'NJ',countyId:firstDE.countyId,feed:firstDE.feed,sourceRecordId:'wrong_state'}],
                          nextCursor:'',more:false});
for(let i=1;i<=3;i++){
  r=tick('DE',deIo);
  assert.equal(r.ok,false);
  assert.equal(r.checkpoint.taskIndex,0);
  assert.equal(r.checkpoint.cursor,'');
  assert.equal(r.checkpoint.attempts,i);
  assert.equal(r.status,i===3?'MOCK_QUARANTINED_RETRY_LIMIT':'MOCK_RETRY_PENDING');
}
assert.equal(deIo.audits.length,3);
assert(deIo.audits.every(x=>x.recordsPersisted===0));
const callsAtQuarantine=deIo.calls.length;
r=tick('DE',deIo);
assert.equal(r.status,'MOCK_QUARANTINED_RETRY_LIMIT');
assert.equal(deIo.calls.length,callsAtQuarantine);
assert.equal(deIo.audits.length,3);
assert.equal(njIo.calls.length,2);
console.log('FAIL_CLOSED_RETRIES_IDENTITY_VALIDATION_QUARANTINE=PASS');

for(const args of [
  ['PA',mockIo('NJ'),{mode:'OFFLINE_TEST',noRemoteServices:true}],
  ['NJ',mockIo('NJ'),{mode:'LIVE',noRemoteServices:true}],
  ['NJ',mockIo('NJ'),{mode:'OFFLINE_TEST',noRemoteServices:false}],
  ['NJ',null,{mode:'OFFLINE_TEST',noRemoteServices:true}]
]){
  assert.throws(()=>sdk.rehearsalTick(...args),/INVALID_STATE|LIVE_RUN_PROHIBITED|REQUIRES_ISOLATED_MOCK_IO/);
}
assert.equal(sandbox.fakeWrites,0);
console.log('NO_PRODUCTION_EXECUTION_OR_MAO_OFFER_AUTHORITY=PASS');
console.log('OFFLINE_PHILADELPHIA_PARITY_TESTS=ALL_PASS');
