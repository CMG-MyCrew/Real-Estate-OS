#!/usr/bin/env python3
"""REOS NJ/DE one-pass, fail-closed production attestation (2026-11-08).

Read-only production calls: Google OAuth identity GET, Apps Script project/
deployment/immutable content GET, Sheets metadata and bounded column GET,
Drive metadata GET, GitHub pull-request GET, and exactly three audited immutable
V167 getter functions (five invocations for snapshot comparison) through
scripts.run POST. Optional OAuth refresh POST is in memory only. No scripts
that mutate Sheets, triggers, source, deployment, credentials, or permissions.
NO automatic release authority under any result.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

SCRIPT_ID = "159EMqc5tB9oQJGhci97j6b41BUvhG5wxUErTZgBFqSCghRcw4msFaKi7"
DEPLOYMENT_ID = "AKfycbxTPu2haRrW9Ls0mkRV4uambT5ajC5RlNC5m7IBxPlcmspVjF5DGdNxOG4pCzjQbHeX"
SPREADSHEET_ID = "1N_5Saw8paJbUZ3FYWr2LmqMDV5qcHSNHda6RoxyqNTU"
EXPECTED_VERSION = 167
EXPECTED_EMAIL = "bjssnc3@gmail.com"
CLOUD_PROJECT_NUMBER = "761052091881"
REPO = "CMG-MyCrew/Real-Estate-OS"
PR_NUMBER = 9
SOURCE_COMMIT = "c1f27c974e715c102fd069a47f18ecccbde81cdb"
SDK_REVIEWED_BLOB_SHA = "cb89157808c09838cf002b7ee21f60d8a4fe2a4a"
EXPECTED_CHECKOUT_HEAD = sys.argv[1] if len(sys.argv) > 1 else ""
FEEDS = ("code_violations", "vacant_properties", "sheriff_tax_sales", "sheriff_mortgage_sales", "probate")
GETTERS = ("reosCountyProductionSchedulerStatus",
           "reosCountyProductionSchedulerCheckpoint",
           "reosCountyProductionSchedulerProvenance")
EXPECTED_GETTER_METHODS = ("getStatus", "getCheckpoint", "getProvenance")
REQUIRED_COLUMNS = ("Distress Lead ID", "Source", "Source Dataset", "Connector Run ID",
                    "Source Record ID", "Source Record Key", "State")
REQUIRED_AUDIT = ("Run ID", "Connector ID", "Dataset", "Mode", "Status",
                  "Records Failed", "Cursor", "Started At")
STAMP = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
HOME = Path.home()
OUT = HOME / ("REOS_NJ_DE_PRODUCTION_ATTESTATION_" + STAMP)
CHECKS = {}
BLOCKERS = []
DATA = {"capture_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
        "expected_script_id":SCRIPT_ID, "expected_deployment_id":DEPLOYMENT_ID,
        "expected_version":EXPECTED_VERSION, "workbook_id":SPREADSHEET_ID,
        "github_review_pr":PR_NUMBER, "github_source_commit":SOURCE_COMMIT,
        "checks":CHECKS, "blockers":BLOCKERS, "decisions":{
          "nj_de_ingestion":"HOLD", "mao_offer":"BLOCKED",
          "deployment_changes":"PROHIBITED", "approval_authority":"NOT_GRANTED"},
        "remote_write_calls":0, "credential_files_modified":False,
        "scheduler_invoked":False, "read_only_getter_calls":0}
TRACE = {"google_get":0,"github_get":0,"getter_post":0,"oauth_memory_refresh":0}
CREDENTIAL_SNAPSHOTS = {}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise RuntimeError("Redirect refused for read-only attestation")
OPENER = urllib.request.build_opener(NoRedirect)

def stamp_file(p):
    if p.is_symlink() or not p.is_file():
        return None
    return hashlib.sha256(p.read_bytes()).hexdigest()

def check(key, good, evidence=""):
    CHECKS[key] = {"status":"PASS" if good else "NOT_ATTESTED",
                   "evidence":str(evidence)[:260]}
    if not good:
        BLOCKERS.append(key)
    return bool(good)

def observation(key, value):
    DATA[key] = value

def compact(exc):
    if isinstance(exc, urllib.error.HTTPError):
        return "HTTP_" + str(exc.code)
    return re.sub(r"(?i)(ya29\.[^\s,]+|bearer\s+[^\s,]+|1//[^\s,]+)", "[REDACTED]",
                  type(exc).__name__ + ": " + str(exc))[:130]

def request(method, url, token=None, payload=None):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https":
        raise ValueError("Non-HTTPS URL blocked")
    host, path = parsed.hostname, parsed.path
    allowed = False
    if method == "GET":
        allowed = (host == "script.googleapis.com" and path.startswith("/v1/projects/" + SCRIPT_ID)) or (
            host == "sheets.googleapis.com" and path.startswith("/v4/spreadsheets/" + SPREADSHEET_ID)) or (
            host == "www.googleapis.com" and path in ("/oauth2/v2/userinfo",
                "/drive/v3/files/" + SPREADSHEET_ID)) or (
            host == "api.github.com" and path in (
               f"/repos/{REPO}/pulls/{PR_NUMBER}",
               f"/repos/{REPO}/pulls/{PR_NUMBER}/reviews"))
    elif method == "POST":
        allowed = ((host == "oauth2.googleapis.com" and path == "/token") or (
            host == "script.googleapis.com" and path == "/v1/scripts/" + DEPLOYMENT_ID + ":run"))
    if not allowed:
        raise ValueError("Method/host/path outside allowlist")
    headers = {"Accept":"application/json", "User-Agent":"REOS-NJDE-ReadOnly-Attestor/1"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if payload is not None:
        if host == "oauth2.googleapis.com":
            headers["Content-Type"] = "application/x-www-form-urlencoded"
            body = urllib.parse.urlencode(payload).encode("utf-8")
        else:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload, separators=(",",":")).encode("utf-8")
    else:
        body = None
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with OPENER.open(req, timeout=40) as resp:
        raw = resp.read(18*1024*1024+1)
        if len(raw)>18*1024*1024:
            raise RuntimeError("Oversized API response blocked")
        result = json.loads(raw)
    if method == "GET":
        TRACE["github_get" if host == "api.github.com" else "google_get"] += 1
    elif host == "oauth2.googleapis.com":
        TRACE["oauth_memory_refresh"] += 1
    else:
        TRACE["getter_post"] += 1
    return result

def script_get(suffix, token):
    return request("GET", "https://script.googleapis.com/v1/projects/" + SCRIPT_ID + suffix, token)

def sheets_get(suffix, token, params=None):
    url = "https://sheets.googleapis.com/v4/spreadsheets/" + SPREADSHEET_ID + suffix
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return request("GET", url, token)

def walk_tokens(obj, prefix=""):
    if isinstance(obj,dict):
        for k,v in obj.items():
            if k in ("access_token","accessToken") and isinstance(v,str) and len(v)>20:
                yield prefix + "/" + k, obj
            elif isinstance(v,(dict,list)):
                yield from walk_tokens(v,prefix+"/"+str(k))
    elif isinstance(obj,list):
        for i,v in enumerate(obj):
            yield from walk_tokens(v,prefix+"/"+str(i))

def pick_client(root, record, snake, camel):
    for obj in (record,root,root.get("oauth2ClientSettings",{}),
                root.get("oauth2_client_settings",{}),root.get("client",{})):
        if isinstance(obj,dict):
            for key in (snake,camel):
                val=obj.get(key)
                if isinstance(val,str) and val:
                    return val
    return ""

def token_profile():
    files = [HOME / ".config/reos-clasp-runtime/.clasprc.json",
             HOME / ".clasprc.json", HOME / ".config/clasp/.clasprc.json"]
    files = [p for p in files if p.is_file() and not p.is_symlink()]
    for path in files:
        CREDENTIAL_SNAPSHOTS[str(path)] = stamp_file(path)
    profiles = []
    for path in files:
        try:
            obj = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for loc,record in walk_tokens(obj):
            profiles.append({"path":path, "location":loc,
                "access":record.get("access_token") or record.get("accessToken"),
                "refresh":record.get("refresh_token") or record.get("refreshToken") or "",
                "client_id":pick_client(obj,record,"client_id","clientId"),
                "client_secret":pick_client(obj,record,"client_secret","clientSecret")})
    chosen = [p for p in profiles if "reos-runtime" in str(p["path"]).lower()
              or "reos-runtime" in p["location"].lower()]
    if len(chosen)==1:
        return chosen[0]
    if len(chosen)>1:
        raise RuntimeError("Ambiguous named reos-runtime token candidates")
    if len(profiles)==1:
        return profiles[0]
    raise RuntimeError("Existing clasp token is missing or ambiguous")

def authenticate():
    cfg = HOME / ".config/reos-clasp-runtime/.clasp.json"
    CREDENTIAL_SNAPSHOTS[str(cfg)] = stamp_file(cfg)
    check("PINNED_RUNTIME_SCRIPT_BINDING",
          cfg.is_file() and not cfg.is_symlink() and
          json.loads(cfg.read_text()).get("scriptId")==SCRIPT_ID,
          "Existing named runtime configuration is pinned to production script")
    if CHECKS["PINNED_RUNTIME_SCRIPT_BINDING"]["status"] != "PASS":
        return None
    prof = token_profile()
    client_id = prof["client_id"]
    # App execution requires the same Google Cloud client project as production.
    client_verified = client_id.startswith(CLOUD_PROJECT_NUMBER + "-")
    check("OAUTH_CLIENT_PROJECT_FINGERPRINT",client_verified,
          "Existing OAuth client must match pinned Cloud project number; missing fingerprint forbids scripts.run, not Google GET")
    token = prof["access"]
    try:
        who = request("GET","https://www.googleapis.com/oauth2/v2/userinfo",token)
    except urllib.error.HTTPError as e:
        if e.code != 401 or not all((prof["refresh"],prof["client_id"],prof["client_secret"])):
            raise
        refreshed = request("POST","https://oauth2.googleapis.com/token",
                            payload={"client_id":prof["client_id"],
                                "client_secret":prof["client_secret"],
                                "refresh_token":prof["refresh"],
                                "grant_type":"refresh_token"})
        token = refreshed.get("access_token")
        if not isinstance(token,str) or len(token)<20:
            raise RuntimeError("In-memory token refresh returned no access token")
        who=request("GET","https://www.googleapis.com/oauth2/v2/userinfo",token)
    email=(who.get("email") or "").lower()
    check("EFFECTIVE_OAUTH_PRINCIPAL",email==EXPECTED_EMAIL,
          "Authenticated userinfo must match pinned effective Google principal")
    return token if email==EXPECTED_EMAIL else None

def verify_git_review():
    try:
        pr=request("GET",f"https://api.github.com/repos/{REPO}/pulls/{PR_NUMBER}")
        good=(pr.get("head",{}).get("sha")==EXPECTED_CHECKOUT_HEAD and
              pr.get("base",{}).get("ref")=="feature/county-connectors" and
              pr.get("draft") is True and pr.get("merged_at") is None)
        check("GITHUB_PR_SOURCE_PIN_AND_HOLD",good,
              "Expected draft PR with exact attested branch commit; no merge")
        observation("github_pr",{"draft":pr.get("draft"),
           "head_sha":pr.get("head",{}).get("sha"),"merged":pr.get("merged_at") is not None})
        reviews=request("GET",f"https://api.github.com/repos/{REPO}/pulls/{PR_NUMBER}/reviews")
        approved=sum(isinstance(v,dict) and v.get("state")=="APPROVED" for v in reviews) if isinstance(reviews,list) else 0
        observation("github_review_observation",{"approved_code_reviews":approved,
            "scope_approval":"NOT_EQUIVALENT_TO_PRODUCTION_AUTHORIZATION"})
    except Exception as e:
        check("GITHUB_PR_SOURCE_PIN_AND_HOLD",False,compact(e))

def attest_deployment(token):
    project=script_get("",token)
    check("LIVE_APPS_SCRIPT_PROJECT",project.get("scriptId")==SCRIPT_ID,
          "Authenticated Apps Script projects.get")
    pages, page = [], None
    for _ in range(20):
        q="?"+urllib.parse.urlencode({"pageSize":100,**({"pageToken":page} if page else {})})
        data=script_get("/deployments"+q,token)
        pages.extend(data.get("deployments",[]))
        page=data.get("nextPageToken")
        if not page: break
    else: raise RuntimeError("Deployment pagination cap exceeded")
    matches=[x for x in pages if x.get("deploymentId")==DEPLOYMENT_ID]
    d=matches[0] if len(matches)==1 else {}
    ver=d.get("deploymentConfig",{}).get("versionNumber")
    api=any(x.get("entryPointType")=="EXECUTION_API" for x in d.get("entryPoints",[]))
    check("LIVE_IMMUTABLE_DEPLOYMENT_V167",len(matches)==1 and ver==EXPECTED_VERSION and api,
          f"observed_version={ver}, execution_api={api}")
    observation("deployment",{"version":ver,"execution_api":api,"present":len(matches)==1,
                              "total_deployments":len(pages)})
    if not (len(matches)==1 and ver==EXPECTED_VERSION and api):
        return False
    immutable=script_get("/content?versionNumber="+str(EXPECTED_VERSION),token)
    head=script_get("/content",token)
    files=immutable.get("files",[])
    headfiles=head.get("files",[])
    def only(files,name):
        found=[f for f in files if f.get("name")==name and f.get("type")=="SERVER_JS"]
        return found[0].get("source","") if len(found)==1 else None
    scheduler=only(files,"CountyProductionScheduler")
    head_scheduler=only(headfiles,"CountyProductionScheduler")
    source_ok=bool(scheduler)
    check("IMMUTABLE_V167_SCHEDULER_PRESENT",source_ok,
          f"immutable_file_count={len(files)}")
    if not source_ok: return False
    sched_sha=hashlib.sha256(scheduler.encode()).hexdigest()
    head_sha=hashlib.sha256((head_scheduler or "").encode()).hexdigest()
    check("HEAD_V167_PA_SCHEDULER_PARITY",bool(head_scheduler) and head_sha==sched_sha,
          "same scheduler SHA256 in actual live HEAD and immutable V167")
    checks=[]
    for fn,target in zip(GETTERS,EXPECTED_GETTER_METHODS):
        pat=r"function\s+"+fn+r"\s*\(\s*\)\s*\{\s*return\s+REOS\.CountyProductionScheduler\."+target+r"\(\s*\)\s*;\s*\}"
        checks.append(bool(re.search(pat,scheduler)))
    check("IMMUTABLE_GETTER_WRAPPERS_EXACT",all(checks),
          "Three only allowlisted read-only exported V167 wrappers present")
    seg=scheduler.split("const ALLOWLIST = Object.freeze([",1)
    feed_order=()
    if len(seg)==2:
        source=seg[1].split("  ]);",1)[0]
        source=re.sub(r"/\*.*?\*/","",source,flags=re.S)
        feed_order=tuple(re.findall(r"dataset:\s*'([^']+)'",source))
    check("IMMUTABLE_PA_FIVE_FEED_ONLY",feed_order==FEEDS,
          "Actual immutable scheduler allowlist contains only approved PA feed order")
    nj_de_generated=[f.get("name") for f in files
        if f.get("type")=="SERVER_JS" and
        re.match(r"^(NJ|DE)[A-Z].*CountyConnector$",str(f.get("name","")))]
    runtime_guard=any("NJ_DE_PRODUCTION_APPROVAL_REQUIRED" in (f.get("source") or "")
                      for f in files)
    check("IMMUTABLE_NJ_DE_LIVE_EXPOSURE_FAIL_CLOSED",
          not nj_de_generated or runtime_guard,
          "V167 NJ/DE generated connectors=%s; explicit live guard=%s" %
          (len(nj_de_generated),runtime_guard))
    observation("actual_script_source",{"v167_file_count":len(files),
        "v167_scheduler_sha256":sched_sha,"head_scheduler_sha256":head_sha,
        "allowlist":list(feed_order),
        "NJ_DE_generated_connector_count_in_V167":len(nj_de_generated),
        "explicit_NJ_DE_live_guard_in_V167":runtime_guard})
    # This compares scheduler source only. It does not claim entire HEAD equivalence.
    return (CHECKS["IMMUTABLE_GETTER_WRAPPERS_EXACT"]["status"]=="PASS" and
            CHECKS["IMMUTABLE_PA_FIVE_FEED_ONLY"]["status"]=="PASS" and
            CHECKS["HEAD_V167_PA_SCHEDULER_PARITY"]["status"]=="PASS")

def safe_getter(fn,token):
    if fn not in GETTERS or CHECKS.get("LIVE_IMMUTABLE_DEPLOYMENT_V167",{}).get("status")!="PASS":
        raise RuntimeError("Non-attested getter blocked")
    result=request("POST","https://script.googleapis.com/v1/scripts/"+DEPLOYMENT_ID+":run",
                   token,{"function":fn,"parameters":[],"devMode":False})
    DATA["read_only_getter_calls"]+=1
    if result.get("done") is not True or result.get("error"):
        raise RuntimeError("Deployed V167 getter returned incomplete or error")
    value=(result.get("response") or {}).get("result")
    if not isinstance(value,dict):
        raise RuntimeError("Deployed getter returned no object")
    return value

def inspect_pa_scheduler(token):
    status=safe_getter(GETTERS[0],token)
    checkpoint=safe_getter(GETTERS[1],token)
    provenance=safe_getter(GETTERS[2],token)
    status_again=safe_getter(GETTERS[0],token)
    checkpoint_again=safe_getter(GETTERS[1],token)
    stable=status==status_again and checkpoint==checkpoint_again
    check("PA_RUNTIME_READONLY_SNAPSHOT_STABLE",stable,
          "Two reads of scheduler status and checkpoint agree")
    allow=status.get("allowlist") or []
    datasets=tuple(x.get("dataset") for x in allow if isinstance(x,dict))
    check("PA_LIVE_ALLOWLIST_ISOLATION",datasets==FEEDS,
          "Live V167 getters contain five PA feeds; no NJ/DE dataset")
    n=(status.get("scheduler") or {}).get("triggerCount")
    check("PA_TRIGGER_COUNT_ONE",n==1,"Getter observed one trigger; owner not independently verified")
    observation("pa_scheduler",{
        "feed_order":list(datasets),"trigger_count":n,
        "last_success_present":bool(status.get("lastSuccessAt")),
        "reported_state":status.get("state"),
        "checkpoint_cycle":checkpoint.get("id"),
        "checkpoint_feed_index":checkpoint.get("nextFeedIndex"),
        "checkpoint_cursor":str(checkpoint.get("currentFeedCursor","")),
        "checkpoint_total_feeds":checkpoint.get("totalFeeds"),
        "provenance_getter_result_keys":sorted(provenance.keys())[:20]})
    check("PA_TRIGGER_OWNER_AND_EXECUTION_IDENTITY",False,
          "Immutable source and status getter do not independently prove trigger creator/effective run principal")
    check("PA_FIVE_FEED_COMPLETE_CERTIFICATION",
          bool(status.get("lastSuccessAt")) and not checkpoint.get("id") and
          status.get("ok") is True, "Health and successful full five-feed cycle must be independently current")

def col_letter(i):
    n=i+1
    s=""
    while n:
        n,d=divmod(n-1,26)
        s=chr(65+d)+s
    return s

def sheet_values(tab,rng,token):
    a1=urllib.parse.quote("'"+tab.replace("'","''")+"'!"+rng,safe="")
    return sheets_get("/values/"+a1,token,{"valueRenderOption":"FORMATTED_VALUE"}).get("values",[])

def inspect_workbook(token):
    obj=sheets_get("",token,{"fields":"spreadsheetId,properties(title,timeZone),sheets(properties(title,gridProperties(rowCount,columnCount)))"})
    tabs={s.get("properties",{}).get("title"):s.get("properties",{}).get("gridProperties",{})
          for s in obj.get("sheets",[])}
    check("PRODUCTION_WORKBOOK_IDENTITY",obj.get("spreadsheetId")==SPREADSHEET_ID,
          "Live spreadsheets.get identity check")
    missing=[x for x in ("COUNTY_CONNECTOR_RUNS","DISTRESS_LEADS","PHILA_PROBATE") if x not in tabs]
    check("PA_AND_CRM_CANONICAL_TABS_EXIST",not missing,",".join(missing) or "all required tabs present")
    if missing: return
    lead_headers=sheet_values("DISTRESS_LEADS","A1:AZ1",token)
    audit_headers=sheet_values("COUNTY_CONNECTOR_RUNS","A1:AZ1",token)
    lh=lead_headers[0] if lead_headers else []
    ah=audit_headers[0] if audit_headers else []
    check("DISTRESS_LEADS_SCHEMA_READ",all(x in lh for x in REQUIRED_COLUMNS),
          "Lead schema contains source/provenance columns")
    check("COUNTY_RUNS_SCHEMA_READ",all(x in ah for x in REQUIRED_AUDIT),
          "County run ledger header contract")
    def inspect_source():
        if "Source" not in lh: return {"status":"UNAVAILABLE"}
        idx=lh.index("Source")
        bound=min(50000,int(tabs["DISTRESS_LEADS"].get("rowCount",0)))
        if bound<2:return {"status":"EMPTY_GRID"}
        letter=col_letter(idx)
        values=sheet_values("DISTRESS_LEADS",letter+"2:"+letter+str(bound),token)
        sources=[str(row[0]).strip() if row else "" for row in values]
        return {"status":"READ","rows_scanned":len(sources),
                "nj_rows":sum(x.startswith("NJ-") for x in sources),
                "de_rows":sum(x.startswith("DE-") for x in sources),
                "pa_rows":sum(x.startswith("PA-") for x in sources),
                "note":"Source-column attribution only; no full lineage/idempotency proof"}
    source=inspect_source()
    observation("production_workbook",{
      "title":obj.get("properties",{}).get("title"),"tab_count":len(tabs),
      "distress_rows_allocated":tabs["DISTRESS_LEADS"].get("rowCount"),
      "county_run_rows_allocated":tabs["COUNTY_CONNECTOR_RUNS"].get("rowCount"),
      "observed_source_counts":source,
      "candidate_nj_de_inventory_tabs":
       [name for name in tabs if name and ("NJ_" in name or "DE_" in name)][:25]})
    check("NJ_DE_CANONICAL_INVENTORY_DESTINATION_ATTESTED",False,
          "No independently approved parcel-only destination/schema, replay/dedup or ACL signatures")
    check("NJ_DE_LIVE_WRITER_IDEMPOTENCY_ATTESTED",False,
          "A source-level guard is not proof of canonical live writer replay and rollback")

def inspect_drive(token):
    url="https://www.googleapis.com/drive/v3/files/"+SPREADSHEET_ID+"?"+urllib.parse.urlencode({
      "fields":"id,name,mimeType,owners(emailAddress),permissions(type,role,emailAddress),capabilities(canEdit)"})
    d=request("GET",url,token)
    check("DRIVE_PRODUCTION_WORKBOOK_ID",d.get("id")==SPREADSHEET_ID,"Drive files.get")
    observation("drive_workbook_custody",{
      "owners":[x.get("emailAddress","") for x in d.get("owners",[])][:8],
      "permissions_returned":len(d.get("permissions",[])),
      "can_edit":(d.get("capabilities") or {}).get("canEdit")})
    check("NJ_DE_WRITE_ACL_SIGNOFF",False,
          "Drive file ACL observation does not independently certify approved NJ/DE writers")

def attest_authorizations():
    check("NJ_DE_24_COUNTY_SIGNED_SCOPE_APPROVAL",False,
          "No independently authenticated NJ/DE production signatures or scoped authorization presented")
    check("INDEPENDENT_CUSTODIAN_REVIEWER_APPROVAL",False,
          "Matthew custody and separate Scott/Sydney approval signatures not attested")
    check("DE_ADDRESS_OWNER_ENRICHMENT_AND_SIGNAL_CLASSIFICATION",False,
          "Parcel inventory lacks certified address/owner linkage and distress evidence")
    check("MAO_ARV_REPAIR_AUTHORITY",False,
          "Automatic MAO/offer remains unavailable absent comp-supported ARV + adequate repair scope")

def self_test():
    assert len(FEEDS)==5 and FEEDS[-1]=="probate"
    assert len(GETTERS)==3 and len(set(GETTERS))==3
    assert col_letter(0)=="A" and col_letter(19)=="T" and col_letter(26)=="AA"
    for method,url in [
        ("PUT","https://script.googleapis.com/v1/projects/"+SCRIPT_ID+"/content"),
        ("POST","https://script.googleapis.com/v1/projects/"+SCRIPT_ID+"/deployments"),
        ("POST","https://script.googleapis.com/v1/scripts/BAD:run"),
        ("GET","https://example.com/sensitive")]:
        # Validate the method/path allowlist without opening network sockets.
        pu=urllib.parse.urlsplit(url)
        host,path=pu.hostname,pu.path
        safe=(method=="GET" and host in ("api.github.com","sheets.googleapis.com","www.googleapis.com","script.googleapis.com")) or (
          method=="POST" and host=="oauth2.googleapis.com" and path=="/token") or (
          method=="POST" and host=="script.googleapis.com" and path=="/v1/scripts/"+DEPLOYMENT_ID+":run")
        assert not safe
    return 4

def main():
    OUT.mkdir(mode=0o700,parents=False,exist_ok=False)
    try:
        self_test()
        check("LOCAL_FAIL_CLOSED_SELF_TESTS",True,"Four offline safety invariants")
        observed_head=subprocess.run(
            ["git","rev-parse","HEAD"],capture_output=True,text=True,check=False).stdout.strip()
        check("ATTESTOR_CHECKOUT_COMMIT_PIN",
            bool(re.fullmatch(r"[0-9a-f]{40}",EXPECTED_CHECKOUT_HEAD)) and
            observed_head==EXPECTED_CHECKOUT_HEAD,
            "Exact expected attestor commit supplied by one-command runner")
        blob=subprocess.run(["git","hash-object","src/CountyConnectorSDK.gs"],
                            capture_output=True,text=True,check=False)
        check("REVIEWED_SDK_SAFETY_BLOB_PIN",
              blob.returncode==0 and blob.stdout.strip()==SDK_REVIEWED_BLOB_SHA,
              "Staged SDK must be exact reviewed safety source, not merely an ancestor")
        verify_git_review()
        attest_authorizations()
        try:
            token=authenticate()
        except Exception as e:
            check("OAUTH_IDENTITY_AND_IN_MEMORY_REFRESH",False,compact(e))
            token=None
        if token:
            try:
                ready=attest_deployment(token)
            except Exception as e:
                check("ACTUAL_V167_DEPLOYMENT_GET",False,compact(e))
                ready=False
            try:
                inspect_workbook(token)
            except Exception as e:
                check("PRODUCTION_WORKBOOK_READ",False,compact(e))
            try:
                inspect_drive(token)
            except Exception as e:
                check("PRODUCTION_DRIVE_CUSTODY_READ",False,compact(e))
            if ready and CHECKS.get("OAUTH_CLIENT_PROJECT_FINGERPRINT",{}).get("status")=="PASS":
                try:
                    inspect_pa_scheduler(token)
                except Exception as e:
                    check("PA_V167_READONLY_GETTERS_ATTESTED",False,compact(e))
            else:
                check("PA_V167_READONLY_GETTERS_ATTESTED",False,
                      "Immutable source or Google client project not verified; scripts.run blocked")
        else:
            for key in ("ACTUAL_V167_DEPLOYMENT_GET","PRODUCTION_WORKBOOK_READ",
                        "PRODUCTION_DRIVE_CUSTODY_READ","PA_V167_READONLY_GETTERS_ATTESTED"):
                check(key,False,"No authenticated production read token available")
    except Exception as e:
        check("UNHANDLED_ATTESTATION_ERROR",False,compact(e))
    finally:
        clean=True
        for path,prior in CREDENTIAL_SNAPSHOTS.items():
            if stamp_file(Path(path))!=prior:
                clean=False
        DATA["credential_files_modified"]=not clean
        check("CREDENTIAL_FILES_PRESERVED",clean,"SHA256 before and after; never write credential files")
        observation("api_call_counters",TRACE)
        observation("read_only_contract",{
            "remote_operations":"Google GET + immutable-V167 read-only getter POST only",
            "oauth_refresh":"in-memory-only if required",
            "apps_script_mutators":0,"sheets_mutators":0,"drive_mutators":0,
            "script_push_version_deploy":0,"triggers_changed":0,
            "county_data_written":0,"checkpoint_writes":0,
            "no_automatic_gate_release":True})
        DATA["blockers"]=list(dict.fromkeys(BLOCKERS))
        DATA["check_pass"]=sum(v["status"]=="PASS" for v in CHECKS.values())
        DATA["check_hold"]=sum(v["status"]!="PASS" for v in CHECKS.values())
        j=OUT/"attestation.json"
        j.write_text(json.dumps(DATA,indent=2,sort_keys=True,default=str)+"\n",encoding="utf-8")
        j.chmod(0o600)
        summary=[
            "=== REOS NJ + DE ONE-COMMAND READ-ONLY PRODUCTION ATTESTATION ===",
            "CAPTURE_UTC="+DATA["capture_utc"],
            "SCRIPT_IDENTITY="+CHECKS.get("EFFECTIVE_OAUTH_PRINCIPAL",{}).get("status","NOT_ATTESTED"),
            "ACTUAL_DEPLOYMENT_V167="+CHECKS.get("LIVE_IMMUTABLE_DEPLOYMENT_V167",{}).get("status","NOT_ATTESTED"),
            "HEAD_V167_PA_SOURCE_PARITY="+CHECKS.get("HEAD_V167_PA_SCHEDULER_PARITY",{}).get("status","NOT_ATTESTED"),
            "PA_FIVE_FEED_ISOLATION="+CHECKS.get("PA_LIVE_ALLOWLIST_ISOLATION",{}).get("status","NOT_ATTESTED"),
            "SCOPE_APPROVAL="+CHECKS.get("NJ_DE_24_COUNTY_SIGNED_SCOPE_APPROVAL",{}).get("status","NOT_ATTESTED"),
            "CANONICAL_DESTINATION="+CHECKS.get("NJ_DE_CANONICAL_INVENTORY_DESTINATION_ATTESTED",{}).get("status","NOT_ATTESTED"),
            "CHECK_PASS="+str(DATA["check_pass"]),
            "CHECK_HOLD="+str(DATA["check_hold"]),
            "LIVE_GETTER_CALLS="+str(DATA["read_only_getter_calls"]),
            "OAUTH_REFRESH_IN_MEMORY="+str(TRACE["oauth_memory_refresh"]),
            "GOOGLE_GETS="+str(TRACE["google_get"]),
            "GITHUB_GETS="+str(TRACE["github_get"]),
        ]
        summary.extend("BLOCKER="+x for x in DATA["blockers"])
        summary += ["APPSSCRIPT_MUTATING_EXECUTIONS=NONE","PRODUCTION_MUTATIONS=NONE",
          "CREDENTIALS_MODIFIED="+("TRUE" if DATA["credential_files_modified"] else "FALSE"),
          "NJ_DE_LIVE_INGESTION=HOLD","MAO_AND_OFFERS=BLOCKED",
          "DECISION=NOT_AUTHORIZED_FOR_PRODUCTION"]
        summary_text="\n".join(summary)+"\n"
        (OUT/"SUMMARY.txt").write_text(summary_text,encoding="utf-8")
        (OUT/"README.txt").write_text(
          "Independent review evidence only. This tool cannot authorize any production writes.\n"
          "No script pushes, deployments, trigger installation, scheduler invocations or sheet writes.\n"
          "Three source-reviewed getter names only; five read-only V167 executions when authorized.\n"
          "Credential refresh, if required, is held solely in memory and never persisted.\n"
          "Approval evidence without independently authenticated signatures remains NOT_ATTESTED.\n",
          encoding="utf-8")
        archive=HOME/("REOS_NJ_DE_PRODUCTION_ATTESTATION_"+STAMP+".zip")
        with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED) as z:
            for p in sorted(OUT.iterdir()):z.write(p,arcname=p.name)
        archive.chmod(0o600)
        print(summary_text,end="")
        print("EVIDENCE_ZIP="+str(archive))
        print("EVIDENCE_SHA256="+hashlib.sha256(archive.read_bytes()).hexdigest())
        print("EVIDENCE_JSON="+str(j))
        print("RESULT=READ_ONLY_EVIDENCE_READY_FOR_INDEPENDENT_REVIEW")
    return 0

if __name__=="__main__":
    sys.exit(main())
