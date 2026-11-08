#!/usr/bin/env python3
"""Single-command NJ/DE feed contract build. OFFLINE ONLY; no live fetch/write."""
from __future__ import annotations
import argparse, csv, datetime as dt, hashlib, io, json, os, re, subprocess, sys, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FEEDS=("code_violations","vacant_properties","sheriff_tax_sales",
       "sheriff_mortgage_sales","probate")
COUNTS={"NJ":21,"DE":3}
TESTS=("scripts/test-nj-de-pa-parity-scheduler.mjs",
       "scripts/test-nj-de-morning-report-parity.mjs",
       "scripts/test-nj-de-live-feed-contracts.mjs")

def demand(ok,code):
    if not ok: raise ValueError(code)

def load(relative):
    p=ROOT/relative
    demand(p.is_file() and not p.is_symlink(),"SOURCE_FILE_UNAVAILABLE")
    return json.loads(p.read_text(encoding="utf-8"))

def build():
    pin=os.environ.get("REOS_RELEASE_PIN","")
    sha=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,
                       check=True,capture_output=True,text=True).stdout.strip()
    demand(bool(re.fullmatch(r"[0-9a-f]{40}",pin)) and sha==pin,
           "SOURCE_SHA_PIN_MISMATCH")
    catalog=load("config/nj-de-philadelphia-parity-feed-catalog.json")
    schedule=load("config/nj-de-six-hour-shadow-schedule.json")
    demand(catalog["production_authority"]=="NONE" and
           schedule["productionAuthority"]=="NONE" and
           schedule["paSchedulerModified"] is False,
           "PRODUCTION_OR_PA_GATE_DRIFT")
    refs=catalog["official_discovery_refs"]
    demand(len(refs)==9 and all(x["pipeline_cleared"] is False for x in refs),
           "DISCOVERY_REFS_NOT_APPROVED")
    for state,count,hours in (("NJ",21,[0,6,12,18]),("DE",3,[1,7,13,19])):
        d=schedule["states"][state]
        demand(d["localHours"]==hours and
               d["authorizedToInstall"] is False and
               d["triggerInstalled"] is False,
               "SCHEDULER_ACTIVATION_DRIFT")
    source=(ROOT/"src/NJDELiveFeedContracts.gs").read_text()
    demand("permissionToFetchLive: false" in source and
           "permissionToWriteProduction: false" in source,
           "LIVE_SOURCE_GUARD_MISSING")
    audit=[]
    for test in TESTS:
        p=subprocess.run(["node",test],cwd=ROOT,
                         capture_output=True,text=True,timeout=45)
        demand(p.returncode==0 and "ALL_PASS" in p.stdout,
               "OFFLINE_TEST_FAILED_"+test+" "+(p.stdout+p.stderr)[-700:])
        audit.append((test,p.stdout))
    rows=[]
    for state,count in COUNTS.items():
        info=catalog["states"][state]
        demand(len(info["counties"])==count and
               info["feedSlots"]==count*5 and
               info["feedOrder"]==list(FEEDS),"COUNTY_CATALOG_INCOMPLETE")
        seen=set()
        for slot in info["slots"]:
            county,feed=slot["countyId"],slot["feed"]
            key=(county,feed)
            demand(key not in seen and county in info["counties"] and
                   feed in FEEDS,"MISSING_OR_DUPLICATE_COUNTY_FEED")
            seen.add(key)
            demand(slot["status"]=="HOLD_NO_CERTIFIED_DISTRESS_SOURCE" and
                   slot["activation_authorized"] is False and
                   slot["source_schema_certified"] is False and
                   slot["approved_endpoint"] is None and
                   slot["distress_sink"] is None,
                   "UNAPPROVED_FEED_WOULD_BE_ACTIVE")
            links=[r["url"] for r in refs if r["countyId"]==county and
                   r["feed"]==feed]
            sheriff=feed in ("sheriff_mortgage_sales","sheriff_tax_sales")
            rows.append({
                "state":state,"county_id":county,"feed":feed,
                "official_references":";".join(links),
                "source_adapter_contract":
                  "LICENSED_SHERIFF_JSON_API_CANDIDATE" if sheriff
                  else "OFFICIAL_COUNTY_CASE_EVENT_REQUIRED",
                "provider_county_coverage":"NOT_ATTESTED" if sheriff
                    else "NOT_APPLICABLE",
                "source_authorization":"NOT_ATTESTED",
                "record_schema_certification":"NOT_CERTIFIED",
                "six_hour_local_times":",".join(d for d in
                    schedule["states"][state]["localTimes"]),
                "last_live_run":"NOT_VERIFIED",
                "morning_new_leads":"NOT_AVAILABLE",
                "activation":"HOLD_NO_CERTIFIED_DISTRESS_SOURCE",
                "destination":"NO_PRODUCTION_DESTINATION",
                "mao_offers":"BLOCKED"
            })
        demand(len(seen)==count*5,"FIVE_FEED_COUNT_MISMATCH")
    demand(len(rows)==120,"TOTAL_120_FEED_SLOTS_MISSING")
    report={
      "source_git_sha":pin,"schema":"REOS_NJ_DE_FEED_BUILD_V1",
      "counties":24,"NJ_counties":21,"DE_counties":3,
      "five_feed_slots":120,"certified_live_distress_feeds":0,
      "five_feed_types":list(FEEDS),
      "licensed_api_candidate":{
        "documentation":"https://www.sheriffsaledata.com/sheriff-sale-data-api",
        "base_url":"https://www.sheriffsaledata.com/api/v1",
        "api_types":{"mortgage_foreclosure":"sheriff_mortgage_sales",
                     "tax_foreclosure":"sheriff_tax_sales"},
        "access":"PAID_PRO_OR_BUSINESS_CREDENTIAL_REQUIRED",
        "license_approved":False,"county_coverage_attested":False,
        "pagination":"OPAQUE_CURSOR_200_MAX",
        "status_and_missing_cancellation_completeness":"NOT_ATTESTED",
        "api_calls":0,"records_processed":0
      },
      "three_other_feeds":"OFFICIAL_CODE_VACANCY_PROBATE_CASE_SOURCES_NEEDED",
      "state_cycle_checkpoints":"OFFLINE_ONLY",
      "NJ_six_hour_local_times":schedule["states"]["NJ"]["localTimes"],
      "DE_six_hour_local_times":schedule["states"]["DE"]["localTimes"],
      "PA_production_mutations":0,"google_requests":0,
      "live_source_requests":0,"credentials_accessed":False,
      "trigger_installs":0,"sheet_writes":0,
      "real_property_records_exported":0,
      "MAO_offers":"BLOCKED",
      "result":"LIVE_READY_CONTRACTS_BUILT_LIVE_ACTIVATION_NO_GO"
    }
    return report,rows,audit

DRAFT="""NJ/DE FEED APPROVAL REQUEST — DRAFT, NOT SENT
1. Confirm official county source and written permitted automated commercial use
   for each code violation, vacancy, tax sale, mortgage sale and probate feed.
2. For the optional paid SheriffSaleData API: approve license and REOS use, confirm
   subscription/API key in secure storage, verify state/county coverage, quotas,
   alias IDs, canceled/stayed gaps, and tax vs mortgage separation.
   Do NOT paste API keys into chat, source, CLI arguments or uploaded ZIPs.
3. For CivilView/official sheriff pages obtain authorized export/API or agreed
   crawl cadence; never bypass 403/robots/terms restrictions.
4. Independently certify case identity, status lifecycle, full pagination,
   durable state/cycle checkpoint, approved read/write ACL and destination.
5. Resolve PR #10 historical Apps Script API endpoints and get custodian and
   separate reviewer signatures. Leave PA runtime and triggers unchanged.
6. For morning reporting use NOT AVAILABLE where no certified live record.
   Never issue MAO/offers without comp-supported ARV and repair scope.
"""

def main():
    args=argparse.ArgumentParser()
    args.add_argument("--output-dir",default=str(Path.home()))
    args.add_argument("--self-test",action="store_true")
    args.add_argument("--live",action="store_true")
    a=args.parse_args()
    if a.live:
        print("RESULT=LIVE_ACTIVATION_NOT_AUTHORIZED")
        return 2
    try:
        report,rows,receipts=build()
        print("NJ_21_DE_3_FIVE_FEED_CONTRACTS=120_PASS")
        print("LICENSED_SHERIFF_API_CURSOR_SCHEMA=STAGED_ONLY")
        print("CODE_VACANCY_PROBATE_SCHEMAS=STAGED_SOURCE_PENDING")
        for name,_ in receipts: print("OFFLINE_TEST_PASS="+name)
        print("NJ_DE_SOURCE_CERTIFICATION=0_OF_120")
        print("PRODUCTION_MUTATIONS=NONE")
        if a.self_test:
            print("RESULT=OFFLINE_FEED_BUILD_SELFTEST_PASS_NO_GO")
            return 0
        out=Path(a.output_dir).expanduser().resolve()
        demand(out.is_dir() and not out.is_symlink(),"OUTPUT_DIR_NOT_SAFE")
        buf=io.StringIO()
        writer=csv.DictWriter(buf,fieldnames=list(rows[0]),
                              lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
        stamp=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        zip_path=out/("REOS_NJ_DE_LIVE_FEED_BUILD_GATE_"+stamp+".zip")
        demand(not zip_path.exists(),"EVIDENCE_ALREADY_EXISTS")
        documents={
          "SUMMARY.txt":"\n".join([
            "NJ/DE LIVE DATA FEED BUILD — SOURCE CONTRACTS",
            "SOURCE_SHA="+report["source_git_sha"],
            "NJ_COUNTIES=21 DE_COUNTIES=3 FEED_SLOTS=120",
            "FIVE_FEED_SCHEMA_TESTS=PASS",
            "LIVE_SOURCE_CERTIFICATIONS=0",
            "SIX_HOUR_SCHEDULER=STAGED_NO_TRIGGERS",
            "PENNSYLVANIA_PRODUCTION_CHANGES=NONE",
            "NO_REMOTE_GOOGLE_REQUESTS_NO_PROPERTY_RECORDS=PASS",
            "MAO_OFFERS=BLOCKED",
            "RESULT=BUILD_PASS_ACTIVATION_NO_GO",""]),
          "build_report.json":json.dumps(report,indent=2,sort_keys=True)+"\n",
          "county_feed_source_matrix.csv":buf.getvalue(),
          "source_approval_request_DRAFT_NOT_SENT.txt":DRAFT,
          "offline_regression_receipts.txt":"\n".join(
            "## "+name+"\n"+output for name,output in receipts)
        }
        with zipfile.ZipFile(zip_path,"x",compression=zipfile.ZIP_DEFLATED) as z:
            for filename,data in documents.items():
                demand(len(data)>50,"EMPTY_EVIDENCE_FILE")
                z.writestr(filename,data)
        zip_path.chmod(0o600)
        with zipfile.ZipFile(zip_path) as z:
            demand(z.testzip() is None,"ZIP_CRC_FAIL")
            demand(set(z.namelist())==set(documents),"ZIP_FILES_MISSING")
        print("EVIDENCE_ZIP="+str(zip_path))
        print("EVIDENCE_SHA256="+hashlib.sha256(zip_path.read_bytes()).hexdigest())
        print("RESULT=FEED_CONTRACT_BUILD_PASS_RELEASE_NO_GO")
        return 0
    except Exception as ex:
        print("RESULT=BUILD_FAIL_CLOSED")
        print("BLOCKER="+str(ex)[-1000:])
        print("PRODUCTION_MUTATIONS=NONE")
        return 2

if __name__=="__main__":
    sys.exit(main())
