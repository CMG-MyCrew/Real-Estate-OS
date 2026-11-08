#!/usr/bin/env node
/** Five-feed NJ/DE source-mapper contract; OFFLINE fixtures only. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=fs.readFileSync(path.join(ROOT,'src/NJDELiveFeedContracts.gs'),'utf8');
for(const token of ['ScriptApp.','PropertiesService.','UrlFetchApp.','REOS.Database.',
 'GmailApp.','SpreadsheetApp.','MailApp.','fetch(', 'XMLHttpRequest']){
 const lines=src.split('\n').filter(s=>!s.trim().startsWith('*')&&!s.trim().startsWith('//'));
 assert(!lines.join('\n').includes(token),'Remote or privileged call present '+token);
}
const ctx={REOS:{}};vm.createContext(ctx);
new vm.Script(src,{filename:'NJDELiveFeedContracts.gs'}).runInContext(ctx);
const adapter=ctx.REOS.NJDEFeedContracts;
const raw=(x)=>JSON.parse(JSON.stringify(x));
assert.deepEqual(raw(adapter.feedOrder),[
 'code_violations','vacant_properties','sheriff_tax_sales',
 'sheriff_mortgage_sales','probate'
]);
assert.equal(adapter.permissionToFetchLive,false);
assert.equal(adapter.permissionToWriteProduction,false);
const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'config/nj-de-philadelphia-parity-feed-catalog.json'),'utf8'));
assert.equal(catalog.production_authority,'NONE');
assert.equal(catalog.states.NJ.feedSlots,105);
assert.equal(catalog.states.DE.feedSlots,15);
for(const state of ['NJ','DE']){
 for(const slot of catalog.states[state].slots){
  assert.equal(slot.activation_authorized,false);
  assert.equal(slot.approved_endpoint,null);
  assert.equal(slot.source_schema_certified,false);
 }
}
console.log('ALL_120_FEED_SLOTS_STILL_DENY_LIVE=PASS');

function sale(id,kind='mortgage_foreclosure',state='NJ',county='Sussex'){
 return {id,state,county,sale_type:kind,case_number:'F-000001-26',sheriff_number:'S-000001',
   address:'100 EXAMPLE STREET',city:'TESTVILLE',sale_date:'2026-12-02',
   sale_status:'scheduled',status_detail:'Plaintiff Adjourned',
   other_ids:[],status_history:['2026-11-08: Scheduled']};
}
const m=raw(adapter.normalizeSale(sale('0000000000c0ffee'),
 'NJ','Sussex','sheriff_mortgage_sales'));
assert.equal(m.countyId,'NJ-SUSSEX');
assert.equal(m.status,'SCHEDULED_REVIEW');
assert.equal(m.readyForDistressLeads,false);
assert.equal(m.readyForOffer,false);
assert.equal(m.sourceRecordId,'0000000000c0ffee');
assert.throws(()=>adapter.normalizeSale(sale('0000000000c0ffee'),
 'DE','Sussex','sheriff_mortgage_sales'),/SHERIFF_CROSS_STATE_COUNTY_RECORD/);
assert.throws(()=>adapter.normalizeSale(sale('0000000000c0ffee'),
 'NJ','Sussex','sheriff_tax_sales'),/SHERIFF_MORTGAGE_TAX_TYPE_MISMATCH/);
const wrong=sale('0000000000c0ffee');wrong.sale_status='cancelled';
assert.throws(()=>adapter.normalizeSale(wrong,'NJ','Sussex','sheriff_mortgage_sales'),
 /SHERIFF_STATUS_UNKNOWN_QUARANTINE/);
const noIdentity=sale('0000000000c0ffee');noIdentity.case_number=null;noIdentity.sheriff_number='';
assert.throws(()=>adapter.normalizeSale(noIdentity,'NJ','Sussex','sheriff_mortgage_sales'),
 /SHERIFF_NO_STABLE_CASE_OR_SHERIFF_ID/);
const tax=sale('000000000000beef','tax_foreclosure','DE','Kent');
tax.case_number='T-000005-26';
const t=raw(adapter.normalizeSale(tax,'DE','Kent','sheriff_tax_sales'));
assert.equal(t.feed,'sheriff_tax_sales');
assert.equal(t.state,'DE');
console.log('MORTGAGE_AND_TAX_SALE_TYPE_SEPARATION=PASS');
console.log('CASE_IDENTITY_AND_UNKNOWN_SALE_STATUS_FAIL_CLOSED=PASS');

function page(records,hasMore,cursor,stamp='2026-11-08'){
 return {object:'list',data:records,has_more:hasMore,next_cursor:cursor,
   truncated:false,data_as_of:stamp};
}
const one=sale('0000000000c0ffee'),two=sale('0000000000c0ffef');
two.case_number='F-000002-26';two.sheriff_number='S-000002';
const good=[page([one],true,'NEXT_PAGE_CURSOR'),page([two],false,null)];
const ok=raw(adapter.validateSnapshotPages(good,'NJ','Sussex','sheriff_mortgage_sales'));
assert.equal(ok.pagesValidated,2);
assert.equal(ok.rowsValidated,2);
assert.equal(ok.productionActivation,'HOLD');
assert.equal(ok.recordsWritten,0);
assert.equal(ok.liveReadAuthorized,false);
assert.equal(ok.sourcePermissionAttested,false);
function deny(pages,match){
 assert.throws(()=>adapter.validateSnapshotPages(pages,'NJ','Sussex','sheriff_mortgage_sales'),match);
}
deny([good[0]],/SHERIFF_SNAPSHOT_INCOMPLETE_PAGINATION/);
deny([page([one],true,'NEXT_PAGE_CURSOR'),page([one],false,null)],
 /SHERIFF_DUPLICATE_CASE_ACROSS_CURSOR_PAGES/);
deny([page([one],true,'NEXT_PAGE_CURSOR'),page([two],false,null,'2026-11-09')],
 /SHERIFF_DATA_AS_OF_DRIFT_QUARANTINE/);
deny([page([one],true,'NEXT_PAGE_CURSOR'),page([two],true,'NEXT_PAGE_CURSOR')],
 /SHERIFF_PAGINATION_CURSOR_STALLED/);
deny([page([one],false,'CURSOR')],/SHERIFF_PAGINATION_STATUS_MISMATCH/);
const truncated=page([one],false,null);truncated.truncated=true;
deny([truncated],/SHERIFF_PAGE_TRUNCATED_QUOTA_OR_COVERAGE_HOLD/);
const empty=page([one],false,null);empty.data=[sale('0000000000c0ffee'),sale('0000000000c0ffee')];
deny([empty],/SHERIFF_DUPLICATE_STABLE_CASE_IN_PAGE/);
console.log('CURSOR_PAGINATION_GAPS_DRIFT_DUPLICATES_QUOTAS_FAIL_CLOSED=PASS');

for(const [feed,eventId] of [
 ['code_violations','CODE_001'],['vacant_properties','VACANCY_001'],
 ['probate','PROBATE_001']
]){
 const e={state:'NJ',county:'Sussex',feed,sourceRecordId:eventId,
  propertyRecordId:'PARCEL_001',sourceUrl:'https://example.invalid/record',
  eventDate:'2026-11-08',status:'UNVERIFIED'};
 const r=raw(adapter.normalizeGenericSourceEvent(e,'NJ','Sussex',feed));
 assert.equal(r.feed,feed);
 assert.equal(r.sourceCertified,false);
 assert.equal(r.readyForDistressLeads,false);
 const bad={...e,propertyRecordId:''};
 assert.throws(()=>adapter.normalizeGenericSourceEvent(bad,'NJ','Sussex',feed),
  /DISTRESS_EVENT_ID_OR_PROVENANCE_MISSING/);
}
console.log('CODE_VACANCY_PROBATE_NEED_SOURCE_IDS_AND_PROVENANCE=PASS');
console.log('REMOTE_CALLS=0');
console.log('PRODUCTION_MUTATIONS=NONE');
console.log('AUTOMATED_MAO_OFFERS=BLOCKED');
console.log('NJ_DE_LIVE_ADAPTER_CONTRACT_TESTS=ALL_PASS');
