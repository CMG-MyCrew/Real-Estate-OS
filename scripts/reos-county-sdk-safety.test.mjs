#!/usr/bin/env node
/** REOS county SDK regression: local JS mocks only, never use Apps Script credentials. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sdkSource = fs.readFileSync(new URL('../src/CountyConnectorSDK.gs', import.meta.url), 'utf8');
const calls = [];
const REOS = {
  Database: {
    ensureTable: (...args) => calls.push(['ensureTable', ...args]),
    insert: (table, row) => { calls.push(['insert', table]); return {...row, 'Distress Lead ID': 'TEST-1'}; },
    update: (table) => { calls.push(['update', table]); return true; },
    getAll: (table) => { calls.push(['getAll', table]); return []; }
  },
  generateId_: () => { calls.push(['generateId']); return 'CCR-TEST'; },
  Logger: { error: () => calls.push(['logger']) }
};
const sandbox = { REOS, Date, Session: { getActiveUser: () => ({ getEmail: () => 'test@example.org' }) } };
vm.runInNewContext(sdkSource, sandbox, { filename: 'CountyConnectorSDK.gs', timeout: 5000 });
const sdk = sandbox.REOS.CountyConnectorSDK;

function fixture(id, state, dataset, mode = 'ok') {
  sdk.register({
    id, state, county: 'Fixture', datasets: [dataset],
    fetch: () => { if (mode === 'throw') throw new Error('fixture'); return {records:[{ID:'X'}]}; },
    normalize: () => ({
      Address:'1 Main St', City:'Fixture', State:state,
      'Parcel ID':'X-1', 'Source Record ID':'SR-1'
    }),
    validate: () => ({ok:true, errors:[]})
  });
}
function blocked(id, reason) {
  assert.throws(() => sdk.run(id,{dryRun:false}), new RegExp(reason));
  assert.equal(calls.length,0, id+' must never write');
}
fixture('NJ-FIXTURE', 'NJ', 'property_assessment');
const dry = sdk.run('NJ-FIXTURE',{dryRun:true});
assert.equal(dry.mode,'DRY_RUN');
assert.equal(dry.stats.valid,1);
assert.equal(dry.stats.skipped,1);
assert.equal(calls.length,0,'dry run must not create tables, audit rows, or IDs');
console.log('DRY_RUN_READ_ONLY=PASS');
blocked('NJ-FIXTURE','NON_DISTRESS_DATASET_LIVE_BLOCKED');
fixture('DE-FIXTURE','DE','parcel_inventory');
blocked('DE-FIXTURE','NON_DISTRESS_DATASET_LIVE_BLOCKED');
fixture('DE-FUTURE','DE','code_violations');
blocked('DE-FUTURE','NJ_DE_PRODUCTION_APPROVAL_REQUIRED');
fixture('PA-PARCEL','PA','parcel_inventory');
blocked('PA-PARCEL','NON_DISTRESS_DATASET_LIVE_BLOCKED');
console.log('NON_DISTRESS_LIVE_BLOCKED=PASS');
console.log('NJ_DE_LIVE_FAIL_CLOSED=PASS');
fixture('PA-DISTRESS','PA','code_violations');
const live=sdk.run('PA-DISTRESS',{dryRun:false});
assert.equal(live.mode,'LIVE');
assert.equal(live.stats.inserted,1);
assert.equal(calls.filter(c=>c[0]==='insert'&&c[1]==='DISTRESS_LEADS').length,1);
console.log('PA_LEGACY_LIVE_PATH_PRESERVED=PASS');
const baseline=calls.length;
fixture('NJ-THROW','NJ','property_assessment','throw');
assert.throws(()=>sdk.run('NJ-THROW',{dryRun:true}),/fixture/);
assert.equal(calls.length,baseline,'erroring dry run must not touch audit or logger');
console.log('DRY_RUN_FAILURE_NO_WRITE=PASS');
