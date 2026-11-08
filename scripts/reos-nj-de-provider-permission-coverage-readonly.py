#!/usr/bin/env python3
"""ONE-COMMAND sheriff-sale provider entitlement + NJ/DE county coverage gate.

A legitimate paid API account may access the vendor's read-only JSON endpoints
for its OWN business under the vendor's published terms (2026-11-01).
This does not authorize scraping sheriff websites, a service to others, or any
REOS production writer. NO provider key, real case, address or party is saved.
Up to 51 FREE account/coverage/count GETs and, only after another explicit
confirmation, at most TWO metered one-record GETs (one per state).
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import csv
import getpass
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import urllib.error
import zipfile

ROOT=Path(__file__).resolve().parents[1]
BASE="https://www.sheriffsaledata.com/api/v1"
DOMAIN="www.sheriffsaledata.com"
TERMS="https://www.sheriffsaledata.com/terms"
DOCS="https://www.sheriffsaledata.com/sheriff-sale-data-api"
SALE_TYPES={
    "sheriff_mortgage_sales":"mortgage_foreclosure",
    "sheriff_tax_sales":"tax_foreclosure",
}
CANDIDATE_ORDER={
    "NJ":["NJ-SUSSEX","NJ-BERGEN","NJ-CAMDEN","NJ-MONMOUTH"],
    "DE":["DE-KENT","DE-NEW-CASTLE","DE-SUSSEX"],
}
MAX_FREE_REQUESTS=51
MAX_METERED_REQUESTS=2
KEY_PATTERN=re.compile(r"^ssd_api_[0-9A-Za-z]{46}$")

def check(ok,reason):
    if not ok: raise ValueError(reason)

def source_pin():
    expected=os.environ.get("REOS_RELEASE_PIN","")
    actual=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,
        text=True,capture_output=True,check=True).stdout.strip()
    check(re.fullmatch(r"[a-f0-9]{40}",expected) and expected==actual,
          "PINNED_GIT_SHA_REQUIRED")
    return actual

def load(path):
    p=ROOT/path
    check(p.is_file() and not p.is_symlink(),"REQUIRED_FILE_MISSING")
    return json.loads(p.read_text(encoding="utf-8"))

def norm_county(value):
    check(isinstance(value,str) and 1<=len(value)<=80,
          "COUNTY_NAME_MALFORMED")
    return re.sub(r"[^A-Z0-9]+","-",value.upper()).strip("-")

def expected_counties(catalog,state):
    all_ids=catalog["states"][state]["counties"]
    check(len(all_ids)==(21 if state=="NJ" else 3),
          "COUNTY_REGISTRY_SIZE_MISMATCH")
    check(len(all_ids)==len(set(all_ids)) and
          all(c.startswith(state+"-") for c in all_ids),
          "COUNTY_SCOPE_IDENTITY_MISMATCH")
    return all_ids

def coverage_index(document,state):
    check(document.get("object")=="list" and
          document.get("state")==state and
          isinstance(document.get("data"),list) and
          len(document["data"])<=150 and
          re.fullmatch(r"\d{4}-\d{2}-\d{2}",
                       str(document.get("data_as_of",""))),
          "PROVIDER_COUNTY_COVERAGE_SCHEMA_INVALID")
    found={}
    for row in document["data"]:
        check(isinstance(row,dict) and row.get("state")==state,
              "PROVIDER_COUNTY_STATE_MISMATCH")
        key=state+"-"+norm_county(row.get("county"))
        check(key not in found,"PROVIDER_COUNTY_DUPLICATE")
        found[key]=row["county"]
    return found

def csv_file(rows):
    columns=("state","county_id","provider_county","coverage",
             "mortgage_status","mortgage_count_all",
             "tax_status","tax_count_all",
             "source_data_as_of","source_authority",
             "live_record_conformance","release_permission")
    b=io.StringIO()
    w=csv.DictWriter(b,fieldnames=columns,extrasaction="ignore",
                     lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return b.getvalue()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        raise RuntimeError("REDIRECT_NOT_PERMITTED")

class Provider:
    def __init__(self,key):
        check(bool(KEY_PATTERN.fullmatch(key)), "API_KEY_SHAPE_INVALID")
        self.key=key
        self.free=0
        self.metered=0
        self.opener=urllib.request.build_opener(
            urllib.request.ProxyHandler({}),NoRedirect()
        )
    def get(self,path,params=None,metered=False):
        if metered:
            check(self.metered<MAX_METERED_REQUESTS,
                  "METERED_REQUEST_BUDGET_EXCEEDED")
        else:
            check(self.free<MAX_FREE_REQUESTS,
                  "FREE_REQUEST_BUDGET_EXCEEDED")
        check(path in ("/me","/states/NJ/counties","/states/DE/counties",
                       "/sales/count","/sales"),"API_PATH_REFUSED")
        check(metered==(path=="/sales"),"METERED_ENDPOINT_GUARD")
        query=urllib.parse.urlencode(params or {})
        url=BASE+path+("?"+query if query else "")
        parsed=urllib.parse.urlsplit(url)
        check(parsed.scheme=="https" and parsed.hostname==DOMAIN and
              parsed.port is None and not parsed.username and
              not parsed.password and "ssd_api" not in url,
              "API_URI_NOT_SAFE")
        if metered: self.metered+=1
        else: self.free+=1
        req=urllib.request.Request(url,method="GET",headers={
           "Authorization":"Bearer "+self.key,
           "Accept":"application/json",
           "User-Agent":"REOS-ReadOnly-SourceConformance/1.0"
        })
        try:
            with self.opener.open(req,timeout=15) as r:
                check(r.status==200 and r.geturl()==url,"API_RESPONSE_INVALID")
                ctype=(r.headers.get("Content-Type") or "").lower()
                check("application/json" in ctype,"API_JSON_REQUIRED")
                max_bytes=160000 if metered else 50000
                data=r.read(max_bytes+1)
                check(len(data)<=max_bytes,"API_BODY_TOO_LARGE")
        except urllib.error.HTTPError as exc:
            raise RuntimeError("PROVIDER_HTTP_"+str(exc.code)) from None
        except urllib.error.URLError:
            raise RuntimeError("PROVIDER_API_UNREACHABLE") from None
        return json.loads(data.decode("utf-8"))

def verify_account(doc):
    check(doc.get("object")=="account","PROVIDER_ACCOUNT_SCHEMA_INVALID")
    plan=str(doc.get("plan","")).lower()
    api=doc.get("api") or {}
    check(plan in ("pro","business") and
          doc.get("trial") is False and doc.get("status")=="active" and
          api.get("keys") is True and api.get("records") is True,
          "API_PLAN_NOT_ACTIVE_OR_API_NOT_ENABLED")
    return {
        "plan":plan.upper(),
        "status":"ACTIVE",
        "api_records_enabled":True,
        "license_scope":"PERSONAL_ACCOUNT_OWN_BUSINESS_ONLY",
        "permission_model":"PUBLISHED_TERMS_PLUS_OPERATOR_ATTESTATION",
    }

def conformance(state,county,feed,page):
    # Real provider sale fields travel ONLY through this process's stdin.
    inp={"state":state,"county":county,"feed":feed,"page":page}
    child=subprocess.run(
       ["node","scripts/reos-nj-de-provider-real-page-conformance.mjs"],
       input=json.dumps(inp),text=True,cwd=ROOT,capture_output=True,
       timeout=25,check=False
    )
    try:
        result=json.loads(child.stdout)
    except (ValueError,TypeError):
        return {"result":"ADAPTER_TRANSPORT_ERROR_NO_GO"}
    permitted=("schema","state","county_id","feed","page_records_validated",
               "source_data_as_of","page_has_more",
               "pagination_coverage_proven","source_status_lifecycle_certified",
               "status_categories","live_record_content_exported",
               "production_writes","actionable_leads_authorized",
               "mao_offers_authorized","result","reason")
    safe={k:result[k] for k in permitted if k in result}
    if child.returncode!=0:
        safe["result"]="LIVE_PAGE_SCHEMA_QUARANTINED_NO_GO"
    return safe

def test_offline(catalog):
    nj=expected_counties(catalog,"NJ")
    de=expected_counties(catalog,"DE")
    for state,ids in (("NJ",nj),("DE",de)):
        fixture={"object":"list","state":state,"data_as_of":"2026-11-08",
                 "data":[{"state":state,"county":key[len(state)+1:].replace("-"," ")}
                         for key in ids]}
        indexed=coverage_index(fixture,state)
        check(set(indexed)==set(ids),"FIXTURE_COUNTY_COVERAGE_MISMATCH")
        changed=json.loads(json.dumps(fixture))
        changed["data"][-1]["county"]=changed["data"][0]["county"]
        try: coverage_index(changed,state)
        except ValueError as err:
            check(str(err)=="PROVIDER_COUNTY_DUPLICATE",
                  "DUPLICATE_FAIL_CLOSED_MISMATCH")
        else: raise ValueError("DUPLICATE_WAS_ACCEPTED")
        half=fixture.copy()
        half["data"]=fixture["data"][:-1]
        check(len(set(ids)-set(coverage_index(half,state)))==1,
              "MISSING_COUNTY_DETECTION_FAILED")
    p=subprocess.run(["node","scripts/reos-nj-de-provider-real-page-conformance.mjs",
                      "--fixture-test"],cwd=ROOT,text=True,capture_output=True,
                     timeout=30)
    check(p.returncode==0 and
          "OFFLINE_CONFORMANCE_TESTS_ALL_PASS" in p.stdout,
          "STAGED_REAL_PAGE_CONFORMANCE_OFFLINE_TEST_FAILED")
    print("NJ_21_DE_3_PROVIDER_COVERAGE_MAPPER=PASS")
    print("MISSING_DUPLICATE_COUNTY_FAIL_CLOSED=PASS")
    print("STAGED_SOURCE_ADAPTER_CONFORMANCE_FIXTURES=PASS")

def safe_confirmation(prompt,required):
    if not sys.stdin.isatty(): return False
    try: return input(prompt).strip()==required
    except (EOFError,KeyboardInterrupt): return False

def run():
    pin=source_pin()
    catalog=load("config/nj-de-philadelphia-parity-feed-catalog.json")
    schedule=load("config/nj-de-six-hour-shadow-schedule.json")
    check(catalog.get("production_authority")=="NONE" and
          schedule.get("productionAuthority")=="NONE" and
          schedule.get("paSchedulerModified") is False,
          "REOS_SOURCE_RELEASE_GUARD_INVALID")
    for st,hours in (("NJ",[0,6,12,18]),("DE",[1,7,13,19])):
        check(schedule["states"][st]["localHours"]==hours and
              schedule["states"][st]["triggerInstalled"] is False,
              "REOS_SIX_HOUR_STAGING_DRIFT")
    test_offline(catalog)
    matrix=[]
    for st in ("NJ","DE"):
        for cid in expected_counties(catalog,st):
            matrix.append({
                "state":st,"county_id":cid,"provider_county":"",
                "coverage":"NOT_QUERIED",
                "mortgage_status":"NOT_QUERIED","mortgage_count_all":"",
                "tax_status":"NOT_QUERIED","tax_count_all":"",
                "source_data_as_of":"",
                "source_authority":"NOT_ATTESTED",
                "live_record_conformance":"NOT_TESTED",
                "release_permission":"NO_PRODUCTION_AUTHORITY"
            })
    return pin,matrix

def live_stage(report,rows):
    print("PROVIDER_TERMS="+TERMS)
    print("PROVIDER_API_DOCS="+DOCS)
    print("API_USAGE=OWN_BUSINESS_ONLY; NO_BULK_RESale_OR_THIRD_PARTY_SERVICE")
    print("AUTOMATED_SCRAPING_OF_SHERIFF_SITES=NOT_AUTHORIZED_BY_THIS_GATE")
    print("LIVE_API_TEST=REQUIRES_OWN_ACTIVE_PRO_OR_BUSINESS_ACCOUNT")
    phrase="I_CONFIRM_OWN_BUSINESS_API_USE"
    if not safe_confirmation(
      "Type "+phrase+" to attest valid own-business API usage (otherwise Enter): ",
      phrase
    ):
        report["gate"]="OPERATOR_ATTESTATION_NOT_PROVIDED"
        return
    key=os.environ.get("SHERIFFSALEDATA_API_KEY","")
    if not key:
        try: key=getpass.getpass(
           "Your private SheriffSaleData API key (hidden; Enter to skip): ")
        except (EOFError,KeyboardInterrupt): key=""
    if not key:
        report["gate"]="NO_PROVIDER_KEY_SUPPLIED"
        return
    if not KEY_PATTERN.fullmatch(key):
        report["gate"]="INVALID_PROVIDER_KEY_SHAPE_NO_REQUESTS"
        return
    p=Provider(key)
    report["operator_attested_own_business_use"]=True
    try:
        me=p.get("/me")
        report["provider_account"]=verify_account(me)
        report["gate"]="QUALIFIED_INTERNAL_API_ACCOUNT_VERIFIED"
        snapshot_dates=set()
        covered_names={}
        for state in ("NJ","DE"):
            response=p.get("/states/"+state+"/counties")
            index=coverage_index(response,state)
            covered_names[state]=index
            snapshot_dates.add(response["data_as_of"])
            for row in rows:
                if row["state"]!=state: continue
                if row["county_id"] in index:
                    row["provider_county"]=index[row["county_id"]]
                    row["coverage"]="PROVIDER_LISTED"
                else: row["coverage"]="NOT_LISTED_IN_PROVIDER"
                row["source_data_as_of"]=response["data_as_of"]
                row["source_authority"]="OWN_BUSINESS_API_TERMS_ACCOUNT_ATTESTED"
        report["provider_coverage_response_received_for_both_states"]=True
        # Determine exact county scope first, then every supported county/type
        # count is checked using the provider's non-metered /sales/count.
        for row in rows:
            if row["coverage"]!="PROVIDER_LISTED":
                row["mortgage_status"]="COUNTY_NOT_LISTED"
                row["tax_status"]="COUNTY_NOT_LISTED"
                continue
            state,county=row["state"],row["provider_county"]
            for feed,api_type in SALE_TYPES.items():
                answer=p.get("/sales/count",{
                    "state":state,"county":county,"type":api_type,
                    "status":"all"
                })
                check(answer.get("object")=="count" and
                      isinstance(answer.get("total"),int) and
                      answer["total"]>=0 and
                      re.fullmatch(r"\d{4}-\d{2}-\d{2}",
                                  str(answer.get("data_as_of",""))),
                      "PROVIDER_COUNT_SCHEMA_INVALID")
                filters=answer.get("filters")
                check(isinstance(filters,dict) and
                      all(filters.get(k)==v for k,v in {
                        "state":state,"county":county,
                        "type":api_type,"status":"all"
                      }.items()),"COUNT_FILTER_ECHO_MISMATCH")
                snapshot_dates.add(answer["data_as_of"])
                name="mortgage" if feed=="sheriff_mortgage_sales" else "tax"
                row[name+"_count_all"]=answer["total"]
                row[name+"_status"]="COUNT_VERIFIED_AT_SOURCE_DATE"
                row["source_data_as_of"]=answer["data_as_of"]
        report["provider_data_as_of_dates"]=sorted(snapshot_dates)
        report["county_coverage"]={
          state:{
            "requested":21 if state=="NJ" else 3,
            "listed":sum(x["state"]==state and
                         x["coverage"]=="PROVIDER_LISTED" for x in rows),
            "not_listed":sum(x["state"]==state and
                             x["coverage"]=="NOT_LISTED_IN_PROVIDER"
                             for x in rows)
          } for state in ("NJ","DE")
        }
        report["state_county_type_counts_completed"]=True
        report["coverage_consistent_single_source_date"]=len(snapshot_dates)==1
        if len(snapshot_dates)!=1:
            report["gate"]="COUNTY_TYPE_COUNT_DATE_DRIFT_NO_METERED_SAMPLE"
            return
        report["gate"]="COVERAGE_VERIFIED_AT_PROVIDER_AS_OF_DATE"
        print("PROVIDER_COUNTY_COVERAGE=VERIFIED_DATE_"+next(iter(snapshot_dates)))
        for state in ("NJ","DE"):
            s=report["county_coverage"][state]
            print(state+"_COUNTIES_LISTED="+str(s["listed"])+
                  "_OF_"+str(s["requested"]))
        print("FREE_PROVIDER_REQUESTS="+str(p.free))
        print("METERED_PROVIDER_REQUESTS=0")
        print("COUNTY_TYPE_COUNT_MATRIX=COMPLETE")
        # Sampling one case per state is an explicit *additional* grant.
        print("Next: up to TWO one-record GETs may count against your paid plan.")
        if not safe_confirmation(
           "Type TEST_UP_TO_2_RECORDS to permit the metered shape test: ",
           "TEST_UP_TO_2_RECORDS"):
            report["gate"]="COVERAGE_VERIFIED_SAMPLE_DECLINED"
            return
        usage=me.get("usage") or {}
        month=(usage.get("month") or {}).get("remaining",0)
        day=(usage.get("day") or {}).get("remaining",0)
        if (not isinstance(month,int) or not isinstance(day,int) or
            month<MAX_METERED_REQUESTS or day<MAX_METERED_REQUESTS):
            report["gate"]="ACCOUNT_ALLOWANCE_INSUFFICIENT_FOR_BOUNDED_SAMPLE"
            return
        tested=[]
        for state in ("NJ","DE"):
            candidates=[r for r in rows if r["state"]==state and
                        r["coverage"]=="PROVIDER_LISTED" and
                        (r["mortgage_count_all"] not in ("",0) or
                         r["tax_count_all"] not in ("",0))]
            priorities=CANDIDATE_ORDER[state]
            candidates.sort(key=lambda r:
                priorities.index(r["county_id"]) if
                r["county_id"] in priorities else 100)
            if not candidates:
                tested.append({"state":state,"result":"NO_CURRENT_SALE_COUNT"})
                continue
            row=candidates[0]
            feed=("sheriff_mortgage_sales" if
                  isinstance(row["mortgage_count_all"],int) and
                  row["mortgage_count_all"]>0 else "sheriff_tax_sales")
            page=p.get("/sales",{
                "state":state,"county":row["provider_county"],
                "type":SALE_TYPES[feed],"status":"all","limit":1
            },metered=True)
            check(page.get("object")=="list" and
                  isinstance(page.get("data"),list) and
                  len(page["data"])<=1,
                  "METERED_ONE_RECORD_BOUND_VIOLATED")
            result=conformance(state,row["provider_county"],feed,page)
            row["live_record_conformance"]=result["result"]
            tested.append(result)
        report["real_source_conformance_samples"]=tested
        report["gate"]="BOUNDED_PROVIDER_SAMPLE_ATTEMPTED_REVIEW_REQUIRED"
        report["real_source_sample_conformant"]=all(
          x.get("result")=="SINGLE_PAGE_CONFORMANT_NOT_FULL_FEED_CERTIFICATION"
          for x in tested if x.get("result")!="NO_CURRENT_SALE_COUNT"
        )
    except Exception as exc:
        # Error text deliberately sanitized; do not print provider body,
        # property details, sensitive transport or Authorization headers.
        code=str(exc)
        report["gate"]="READ_ONLY_VERIFICATION_FAILED_CLOSED"
        report["blocker"]=(
           code if re.fullmatch(r"[A-Z0-9_]+",code)
           else "VERIFICATION_ERROR_"+type(exc).__name__.upper()
        )
    finally:
        report["free_provider_gets_attempted"]=p.free
        report["metered_one_record_gets_attempted"]=p.metered
        p.key=""
        key=""

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--output-dir",default=str(Path.home()))
    ap.add_argument("--self-test",action="store_true")
    a=ap.parse_args()
    try:
        pin,rows=run()
    except Exception as ex:
        print("RESULT=FAIL_CLOSED")
        print("BLOCKER="+str(ex)[-150:])
        print("PRODUCTION_MUTATIONS=NONE")
        return 2
    if a.self_test:
        print("RESULT=SOURCE_COVERAGE_SELFTEST_PASS_NO_LIVE_ACCESS")
        return 0
    report={
      "schema":"REOS_NJ_DE_PROVIDER_PERMITTED_ACCESS_EXACT_COVERAGE_V1",
      "created_at_utc":datetime.now(timezone.utc).isoformat(),
      "source_git_sha":pin,
      "provider":BASE,"provider_terms":TERMS,
      "terms_effective_date_documented":"2026-11-01",
      "operator_attested_own_business_use":False,
      "provider_account":None,
      "provider_coverage_response_received_for_both_states":False,
      "state_county_type_counts_completed":False,
      "county_coverage":None,
      "coverage_consistent_single_source_date":False,
      "free_provider_gets_attempted":0,
      "metered_one_record_gets_attempted":0,
      "real_source_conformance_samples":[],
      "real_property_details_exported":False,
      "api_key_saved":False,
      "PA_scheduler_modified":False,
      "Google_requests":0,
      "Apps_Script_executions":0,
      "trigger_installs":0,
      "CRM_or_Sheets_writes":0,
      "live_NJ_DE_ingestion":False,
      "source_deployments_approved":False,
      "automatic_MAO_or_offers_authorized":False,
      "gate":"NOT_STARTED",
      "release_decision":"NJ_DE_PRODUCTION_NO_GO"
    }
    live_stage(report,rows)
    out=Path(a.output_dir).expanduser().resolve()
    if not out.is_dir() or out.is_symlink():
        print("RESULT=FAIL_CLOSED_OUTPUT_DIR_UNSAFE")
        return 2
    ts=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    zip_path=out/("REOS_NJ_DE_SHERIFF_ACCESS_COVERAGE_READONLY_"+ts+".zip")
    if zip_path.exists() or zip_path.is_symlink():
        print("RESULT=FAIL_CLOSED_OUTPUT_EXISTS")
        return 2
    report_text=json.dumps(report,indent=2,sort_keys=True)+"\n"
    files={
      "access_coverage_report.json":report_text,
      "nj_de_24_county_48_sale_type_matrix.csv":csv_file(rows),
      "SUMMARY.txt":"\n".join([
        "REOS NJ DE SHERIFF API ACCESS AND COVERAGE READONLY GATE",
        "SOURCE_GIT_SHA="+pin,
        "GATE="+report["gate"],
        "FREE_GETS="+str(report["free_provider_gets_attempted"]),
        "METERED_GETS="+str(report["metered_one_record_gets_attempted"]),
        "REAL_PROPERTY_DETAILS_EXPORTED=NO",
        "NJ_DE_LIVE_INGESTION=BLOCKED",
        "PRODUCTION_MUTATIONS=NONE",
        "PA_SCHEDULER_CHANGED=NO",
        "MAO_AND_OFFERS=BLOCKED",
        "RESULT=READONLY_EVIDENCE_PRODUCTION_NO_GO",""]),
      "REVIEW_AND_APPROVAL_NEXT_ACTION.txt":"\n".join([
        "Vendor terms permit own-business API use with an active qualifying",
        "paid account, within quota; no bulk redistribution or third-party",
        "service use. See "+TERMS,
        "The operator must independently verify ownership/use and resolve",
        "any restrictions before running the online coverage stage.",
        "County provider coverage is not official sheriff status assurance.",
        "Counts are source-date observations, not guaranteed complete records.",
        "Missing/stayed/cancelled sales may be removed by the provider.",
        "Single-record conformance is NOT full pagination/status certification.",
        "No production source, Apps Script, Sheets, or trigger enablement.",
        "Keep state/cycle checkpoints separate; protect Philadelphia runtime.",
        "Resolve API deployment protection and separate source approvals.",
        "Require comp-supported ARV and adequate repair scope for any offer.",
        "This review packet contains no key or actual property record."
      ])+"\n"
    }
    with zipfile.ZipFile(zip_path,"x",compression=zipfile.ZIP_DEFLATED) as z:
        for name,value in files.items():
            check(value.strip(),"EMPTY_ARTIFACT_MEMBER")
            z.writestr(name,value)
    zip_path.chmod(0o600)
    with zipfile.ZipFile(zip_path) as z:
        check(z.testzip() is None,"ZIP_CRC_INVALID")
        check(set(z.namelist())==set(files),"ZIP_MANIFEST_INVALID")
    print("=== REOS NJ/DE ACCESS AND COUNTY COVERAGE RECEIPT ===")
    print("GATE="+report["gate"])
    if report["county_coverage"] is not None:
        for state in ("NJ","DE"):
            x=report["county_coverage"][state]
            print(state+"_PROVIDER_COUNTIES="+str(x["listed"])+
                  "_OF_"+str(x["requested"]))
    if report.get("blocker"):
        print("BLOCKER="+report["blocker"])
    print("FREE_GETS="+str(report["free_provider_gets_attempted"]))
    print("METERED_GETS="+str(report["metered_one_record_gets_attempted"]))
    print("EVIDENCE_ZIP="+str(zip_path))
    print("EVIDENCE_SHA256="+hashlib.sha256(zip_path.read_bytes()).hexdigest())
    print("PA_PRODUCTION_CHANGES=NONE")
    print("NJ_DE_PRODUCTION=HOLD")
    print("MAO_AND_OFFERS=BLOCKED")
    print("RESULT=READONLY_REVIEW_PACKET_READY_PRODUCTION_NO_GO")
    return 0

if __name__=="__main__":
    sys.exit(main())
