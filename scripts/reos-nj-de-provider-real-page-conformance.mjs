#!/usr/bin/env node
/**
 * Authenticated (separately gated) sheriff-sale API shape conformance.
 * Receives at most one real page in process stdin, validates using the actual
 * staged Apps Script NJDEFeedContracts (VM), and emits ONLY non-PII metadata.
 * No HTTP, Google, persistence, account key or remote write capability.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(ROOT,'src/NJDELiveFeedContracts.gs'),'utf8');
const ctx={REOS:{}};
vm.createContext(ctx);
new vm.Script(source,{filename:'NJDELiveFeedContracts.gs'}).runInContext(ctx);
const api=ctx.REOS.NJDEFeedContracts;

function verify(input){
  if(!input || !['NJ','DE'].includes(input.state) ||
     typeof input.county!=='string' || input.county.length<2 ||
     !['sheriff_mortgage_sales','sheriff_tax_sales'].includes(input.feed) ||
     !input.page || typeof input.page!=='object' ||
     !Array.isArray(input.page.data) || input.page.data.length>1){
    throw new Error('LIVE_SAMPLE_NOT_WITHIN_BOUNDED_INPUT');
  }
  // No attempt to traverse the cursor. One page, at most one record.
  const result=api.validateSheriffCursorPage(
    input.page,input.state,input.county,input.feed,''
  );
  assert(result.rows.length<=1);
  assert(result.productionWrites===0);
  assert(result.rows.every(r=>r.readyForDistressLeads===false &&
    r.readyForAutomaticMAO===false && r.readyForOffer===false));
  return {
    schema:'REOS_NJ_DE_ACTUAL_PROVIDER_PAGE_CONFORMANCE_V1',
    state:input.state,
    county_id:result.rows[0]?.countyId ?? (input.state+'-NO_RECORD'),
    feed:input.feed,
    page_records_validated:result.rows.length,
    source_data_as_of:result.sourceAsOf,
    page_has_more:result.more,
    pagination_coverage_proven:false,
    source_status_lifecycle_certified:false,
    status_categories:result.rows.map(r=>r.status),
    live_record_content_exported:false,
    production_writes:0,
    actionable_leads_authorized:false,
    mao_offers_authorized:false,
    result:'SINGLE_PAGE_CONFORMANT_NOT_FULL_FEED_CERTIFICATION'
  };
}
function fixture(state,feed,kind,county){
  const a={id:'0000000000c0ffee',sale_type:kind,
    state,county,case_number:'TEST-F-00001',sheriff_number:'TEST-S-001',
    address:'123 Example Street',city:'Test Town',sale_date:'2026-12-02',
    sale_status:'scheduled',status_detail:'Published: Scheduled',
    status_history:['2026-11-08: Scheduled'],other_ids:[]};
  return {state,county,feed,page:{
    object:'list',data:[a],next_cursor:null,has_more:false,
    truncated:false,data_as_of:'2026-11-08'
  }};
}

function offlineTests(){
  for(const [state,feed,kind,county] of [
    ['NJ','sheriff_mortgage_sales','mortgage_foreclosure','Sussex'],
    ['DE','sheriff_tax_sales','tax_foreclosure','Kent']
  ]){
    const x=fixture(state,feed,kind,county);
    assert.equal(verify(x).page_records_validated,1);
    assert.equal(verify(x).live_record_content_exported,false);
    const bad=JSON.parse(JSON.stringify(x));
    bad.page.data[0].state=state==='NJ'?'DE':'NJ';
    assert.throws(()=>verify(bad),/SHERIFF_CROSS_STATE_COUNTY_RECORD/);
    const dr=JSON.parse(JSON.stringify(x));
    dr.page.truncated=true;
    assert.throws(()=>verify(dr),/SHERIFF_PAGE_TRUNCATED_QUOTA_OR_COVERAGE_HOLD/);
    const unk=JSON.parse(JSON.stringify(x));
    unk.page.data[0].sale_status='cancelled';
    assert.throws(()=>verify(unk),/SHERIFF_STATUS_UNKNOWN_QUARANTINE/);
    const overflow=JSON.parse(JSON.stringify(x));
    overflow.page.data.push(overflow.page.data[0]);
    assert.throws(()=>verify(overflow),/LIVE_SAMPLE_NOT_WITHIN_BOUNDED_INPUT/);
  }
  const tokenCheck=source.split('\n')
    .filter(line=>!line.trim().startsWith('*')&&!line.trim().startsWith('//'))
    .join('\n');
  for(const token of ['UrlFetchApp.','ScriptApp.','PropertiesService.',
                     'GmailApp.','SpreadsheetApp.','REOS.Database.']){
    assert(!tokenCheck.includes(token),'Forbidden remote service '+token);
  }
  console.log('REOS_NJ_DE_REAL_SOURCE_CONFORMANCE_FIXTURES=PASS');
  console.log('NJ_DE_TWO_STATES_TAX_MORTGAGE_CROSS_SCOPE_FAIL_CLOSED=PASS');
  console.log('REAL_SOURCE_TRANSPORT_OR_DATA_WRITES=NONE');
  console.log('RESULT=OFFLINE_CONFORMANCE_TESTS_ALL_PASS');
}

if(process.argv.includes('--fixture-test')){
  offlineTests();
}else{
  // No keys can be supplied to this program; input is discarded on process exit.
  const raw=fs.readFileSync(0,'utf8');
  try{
    assert(raw.length<=150000,'LIVE_SAMPLE_TOO_LARGE');
    process.stdout.write(JSON.stringify(verify(JSON.parse(raw)))+'\n');
  }catch(error){
    const reason=String(error?.message||'UNKNOWN_ERROR')
      .replace(/[^A-Z0-9_]/g,'_').slice(0,110);
    process.stdout.write(JSON.stringify({
      schema:'REOS_NJ_DE_ACTUAL_PROVIDER_PAGE_CONFORMANCE_V1',
      result:'LIVE_PAGE_SCHEMA_QUARANTINED_NO_GO',reason,
      production_writes:0,live_record_content_exported:false
    })+'\n');
    process.exitCode=2;
  }
}
