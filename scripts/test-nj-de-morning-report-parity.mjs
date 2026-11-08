#!/usr/bin/env node
/**
 * NJ/DE morning report parity: isolated no-network mock of REOS Daily Digest.
 * The only simulated email is captured in memory; no real Gmail/Sheets/Google.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(name)=>fs.readFileSync(path.join(ROOT,name),'utf8');
const scheduleSource=read('src/NJDECountyParityScheduler.gs');
const reportSource=read('src/NJDEMorningReport.gs');
const digestSource=read('src/Notifications.gs');
const spec=JSON.parse(read('config/nj-de-six-hour-shadow-schedule.json'));
const unsafeTokens=['ScriptApp.','PropertiesService.','UrlFetchApp.','REOS.Database.',
                    'GmailApp.','MailApp.','SpreadsheetApp.'];
const executable=reportSource.split('\n').filter(line=>!line.trim().startsWith('*')
  && !line.trim().startsWith('//')).join('\n');
for(const token of unsafeTokens){
  assert(!executable.includes(token),'Report builder contains remote/write token '+token);
}

function setup({withReport=true, corruptPlan=false}={}){
  const sent=[],permissions=[],audit=[],sheetOps=[];
  const stubSheet={
    getLastRow(){return 1;},
    getRange(){throw new Error('Unexpected Sheet range write');}
  };
  const ctx={
    REOS:{
      Security:{
        requirePermission(permission){permissions.push(permission);},
        getCurrentUserEmail(){return 'qa-only@example.invalid';}
      },
      Dashboard:{getExecutiveDashboard(){return {
        crm:{activeLeadsCount:4},tasks:{overdueCount:2},
        transactions:{activeCount:1},rentals:{monthlyCashFlow:2500},
        finance:{currentMonth:{netProfit:500}}
      };}},
      Database:{
        insert(sheet,record){sheetOps.push(['MOCK_INSERT',sheet]);return {'Notification ID':'MOCK_ONLY',...record};},
        update(sheet,id,value,fields){sheetOps.push(['MOCK_UPDATE',sheet]);return fields;}
      },
      Logger:{audit(event){audit.push(event);}}
    },
    GmailApp:{sendEmail(to,subject,body){sent.push({to,subject,body});}},
    SpreadsheetApp:{
      getActiveSpreadsheet(){return {
        getSheetByName(name){assert.equal(name,'NOTIFICATIONS');return stubSheet;}
      };}
    }
  };
  vm.createContext(ctx);
  new vm.Script(scheduleSource,{filename:'NJDECountyParityScheduler.gs'}).runInContext(ctx);
  if(corruptPlan){
    const original=ctx.REOS.NJDECountyParityScheduler.plan;
    ctx.REOS.NJDECountyParityScheduler.plan=(state)=>{
      const r=original(state);
      r.tasks[0].sourceCertified=true;
      return r;
    };
  }
  if(withReport)new vm.Script(reportSource,{filename:'NJDEMorningReport.gs'}).runInContext(ctx);
  new vm.Script(digestSource,{filename:'Notifications.gs'}).runInContext(ctx);
  return {ctx,sent,permissions,audit,sheetOps};
}
const o=setup();
const s=JSON.parse(JSON.stringify(o.ctx.REOS.NJDEMorningReport.snapshot()));
assert.equal(s.schemaVersion,'REOS_NJ_DE_COUNTY_MORNING_REPORT_SHADOW_V1');
assert.equal(s.totals.coveredCounties,24);
assert.equal(s.totals.distressFeedSlots,120);
assert.equal(s.totals.certifiedDistressFeeds,0);
assert.equal(s.totals.verifiedNewDistressLeads,null);
assert.equal(s.NJ.countyCount,21);
assert.equal(s.DE.countyCount,3);
assert.deepEqual(s.NJ.sixHourTimesLocal,['00:00','06:00','12:00','18:00']);
assert.deepEqual(s.DE.sixHourTimesLocal,['01:00','07:00','13:00','19:00']);
assert.equal(s.NJ.verifiedActionableLeads,null);
assert.equal(s.DE.verifiedActionableLeads,null);
assert(!s.NJ.dataAvailable&&!s.DE.dataAvailable);
assert(!s.NJ.executedSixHourTrigger&&!s.DE.executedSixHourTrigger);
assert(!s.NJ.automationAuthorized&&!s.DE.automationAuthorized);
assert(!s.NJ.maoAndOffersAuthorized&&!s.DE.maoAndOffersAuthorized);
assert.equal(spec.productionAuthority,'NONE');
console.log('MORNING_NJ_21_DE_3_AND_120_HOLD_SLOTS=PASS');
console.log('MORNING_SIX_HOUR_NJ_DE_SCHEDULE_PARITY=PASS');

o.ctx.notificationsDailyDigest();
assert.equal(o.sent.length,1);
assert.equal(o.sent[0].to,'qa-only@example.invalid');
assert.equal(o.sent[0].subject,'REOS Daily Digest');
const body=o.sent[0].body;
const original=[
  'REOS Daily Digest','',
  'Active Leads: 4','Overdue Tasks: 2','Active Transactions: 1',
  'Rental Cash Flow: $2500','Monthly Net Profit: $500'
].join('\n');
assert(body.startsWith(original+'\n'));
assert(body.indexOf('REOS COUNTY MORNING REPORT — NJ / DE')>original.length);
assert(body.includes('New Jersey (NJ) — 21 counties / 105 planned distress-feed slots'));
assert(body.includes('Delaware (DE) — 3 counties / 15 planned distress-feed slots'));
assert(body.includes('00:00, 06:00, 12:00, 18:00'));
assert(body.includes('01:00, 07:00, 13:00, 19:00'));
assert(body.includes('Certified distress feeds: 0 of 105'));
assert(body.includes('Certified distress feeds: 0 of 15'));
assert.equal((body.match(/New distress leads: NOT AVAILABLE/g)||[]).length,2);
assert(body.includes('Latest completed run: NOT VERIFIED'));
assert(body.includes('NJ/DE source certification: 0 of 120'));
assert(body.includes('PA / Philadelphia: existing daily report content and scheduler unchanged.'));
assert(body.includes('MAO and automatic offers: BLOCKED'));
assert(body.includes('NOT AVAILABLE does not mean zero properties'));
assert(!body.includes('New distress leads: 0'));
assert.deepEqual(o.sheetOps.map(x=>x[0]),['MOCK_INSERT','MOCK_UPDATE']);
assert(o.permissions.includes('reports:read')&&o.permissions.includes('finance:write'));
console.log('EXISTING_DAILY_DIGEST_CONTENT_AND_SUBJECT_PRESERVED=PASS');
console.log('STATE_MORNING_APPENDIX_NOT_AVAILABLE_NOT_ZERO_LEADS=PASS');
console.log('MOCK_SEND_ONLY_NO_REAL_GMAIL_OR_SHEET_MUTATION=PASS');

const absent=setup({withReport:false});
absent.ctx.notificationsDailyDigest();
assert.equal(absent.sent.length,1);
assert(absent.sent[0].body.startsWith(original+'\n'));
assert(absent.sent[0].body.includes('Status: UNAVAILABLE — county reporting module not deployed.'));
console.log('MISSING_REPORT_MODULE_FAILS_VISIBLE_NO_SILENT_OMISSION=PASS');

const bad=setup({corruptPlan:true});
assert.throws(()=>bad.ctx.REOS.NJDEMorningReport.snapshot(),/MORNING_UNAUTHORIZED_STATUS_OR_ACTIVATION_DRIFT/);
bad.ctx.notificationsDailyDigest();
assert.equal(bad.sent.length,1);
assert(bad.sent[0].body.includes('Status: HOLD — state report validation failed'));
assert(!bad.sent[0].body.includes('New Jersey (NJ) — 21 counties'));
console.log('UNAUTHORIZED_CATALOG_DRIFT_NEVER_EXPOSED_AS_CERTIFIED=PASS');
console.log('REPORT_MORNING_PARITY_OFFLINE_TESTS=ALL_PASS');
