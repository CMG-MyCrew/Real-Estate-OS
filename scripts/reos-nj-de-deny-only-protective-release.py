#!/usr/bin/env python3
"""REOS deny-only protective release, with immutable source and deployment attestation.

DEFAULT: read-only source/credential/approval preflight and evidence packet.
--apply: release only if three independent named GitHub approvals on the exact
PR head, correct writable OAuth principal+client project, exact V167==HEAD,
and every source/manifest/deployment precondition passes. No county ingestion.
Never installs triggers, changes scheduler, touches Sheets, enables MAO/offers,
or promotes unsanctioned county scopes. No stored OAuth tokens/refresh.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
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

SCRIPT = "159EMqc5tB9oQJGhci97j6b41BUvhG5wxUErTZgBFqSCghRcw4msFaKi7"
DEPLOYMENT = "AKfycbxTPu2haRrW9Ls0mkRV4uambT5ajC5RlNC5m7IBxPlcmspVjF5DGdNxOG4pCzjQbHeX"
VERSION = 167
CLOUD_PROJECT = "761052091881"
EXPECTED_PRINCIPAL = "bjssnc3@gmail.com"
PR_NUMBER = 10
REPO = "CMG-MyCrew/Real-Estate-OS"
PA_SCHED_SHA = "7b850103cd0a5b7dd2d2cc6776f2c92c55ae7bf2107336417b8b5b956b2cc855"
FEEDS = ("code_violations","vacant_properties","sheriff_tax_sales","sheriff_mortgage_sales","probate")
EXPECTED_HEAD = os.environ.get("REOS_RELEASE_PIN","").strip()
STAMP = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
HOME = Path.home()
WORK = HOME / ("REOS_NJ_DE_DENY_ONLY_" + STAMP)
PROTECTED = {"production_mutations":0,"versions_created":0,"deployment_updates":0,
             "credential_files_changed":False,"write_attempts":0,"mutation_outcome":"NO_WRITES_ATTEMPTED","county_live_enabled":False,
             "mao_offers_enabled":False,"scheduler_executed":False,"triggers_changed":False}
RESULT = {"capture_utc":STAMP,"release":"NJ_DE_DENY_ONLY_V1",
          "old_version":VERSION,"old_deployment_id":DEPLOYMENT,
          "status":"HOLD_NOT_INSTALLED","checks":{},"blockers":[],
          "mutations":PROTECTED}
CRED = {}
class ReadOnlyPrepared(Exception):
    pass
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Redirect refused")
OPENER = urllib.request.build_opener(NoRedirect)
def sha(b): return hashlib.sha256(b).hexdigest()
def text_sha(s): return sha(s.encode("utf-8"))
def file_sha(path):
    return sha(path.read_bytes()) if path.exists() and path.is_file() and not path.is_symlink() else None
def check(name, good, detail=""):
    RESULT["checks"][name]={"status":"PASS" if good else "HOLD","detail":str(detail)[:220]}
    if not good: RESULT["blockers"].append(name)
    return bool(good)
def error(e):
    if isinstance(e,urllib.error.HTTPError): return "HTTP_"+str(e.code)
    return re.sub(r"(?i)(ya29\.\S+|bearer\s+\S+|1//\S+)","[REDACTED]",type(e).__name__+": "+str(e))[:130]
def api(method,url,token=None,body=None):
    p=urllib.parse.urlsplit(url)
    host,path=p.hostname,p.path
    good=(p.scheme=="https" and (
      (method=="GET" and host=="script.googleapis.com" and path.startswith("/v1/projects/"+SCRIPT)) or
      (method=="GET" and host=="www.googleapis.com" and path=="/oauth2/v2/userinfo") or
      (method=="POST" and host=="oauth2.googleapis.com" and path=="/token") or
      (method=="GET" and host=="api.github.com" and path in (
         f"/repos/{REPO}/pulls/{PR_NUMBER}",
         f"/repos/{REPO}/pulls/{PR_NUMBER}/reviews")) or
      (method=="PUT" and host=="script.googleapis.com" and path in (
         "/v1/projects/"+SCRIPT+"/content",
         "/v1/projects/"+SCRIPT+"/deployments/"+DEPLOYMENT)) or
      (method=="POST" and host=="script.googleapis.com" and path=="/v1/projects/"+SCRIPT+"/versions")
    ))
    if not good: raise ValueError("Unapproved method/endpoint")
    headers={"User-Agent":"REOS-DenyOnly/1.0","Accept":"application/json"}
    if token: headers["Authorization"]="Bearer "+token
    data=None
    if body is not None:
        if host=="oauth2.googleapis.com":
            headers["Content-Type"]="application/x-www-form-urlencoded"
            data=urllib.parse.urlencode(body).encode()
        else:
            headers["Content-Type"]="application/json"
            data=json.dumps(body,separators=(",",":")).encode()
    req=urllib.request.Request(url,headers=headers,data=data,method=method)
    with OPENER.open(req,timeout=60) as r:
        data=r.read(64*1024*1024+1)
        if len(data)>64*1024*1024: raise RuntimeError("API response limit")
        return json.loads(data)
def project_get(path,token):
    return api("GET","https://script.googleapis.com/v1/projects/"+SCRIPT+path,token)
def git_get(path):
    return api("GET","https://api.github.com/repos/"+REPO+path)
def scan_tokens(v,root=""):
    if isinstance(v,dict):
        for k,item in v.items():
            if k in ("access_token","accessToken") and isinstance(item,str) and len(item)>20:
                yield root+"/"+k,v
            elif isinstance(item,(dict,list)):
                yield from scan_tokens(item,root+"/"+str(k))
    if isinstance(v,list):
        for i,x in enumerate(v): yield from scan_tokens(x,root+"/"+str(i))
def read_profile():
    cfg=HOME/".config/reos-clasp-runtime/.clasp.json"
    CRED[str(cfg)]=file_sha(cfg)
    if not CRED[str(cfg)] or json.loads(cfg.read_text()).get("scriptId")!=SCRIPT:
        raise RuntimeError("Pinned named .clasp.json script mismatch")
    paths=[HOME/".config/reos-clasp-runtime/.clasprc.json",HOME/".clasprc.json",
           HOME/".config/clasp/.clasprc.json"]
    candidates=[]
    for p in paths:
        CRED[str(p)]=file_sha(p)
        if CRED[str(p)] is None: continue
        try: root=json.loads(p.read_text())
        except Exception: continue
        for loc,v in scan_tokens(root):
            def fld(keys):
                for obj in (v,root,root.get("oauth2ClientSettings",{}),
                            root.get("oauth2_client_settings",{}),root.get("client",{})):
                    if isinstance(obj,dict):
                        for k in keys:
                            val=obj.get(k)
                            if isinstance(val,str) and val:return val
                return ""
            scope=fld(("scope","scopes"))
            candidates.append({"file":str(p),"where":loc,"access":v.get("access_token") or v.get("accessToken"),
                    "refresh":v.get("refresh_token") or v.get("refreshToken"),
                    "client":fld(("client_id","clientId")),"secret":fld(("client_secret","clientSecret")),
                    "scope":scope})
    selected=[c for c in candidates if "reos-runtime" in c["where"].lower() or
              "reos-clasp-runtime" in c["file"]]
    if len(selected)!=1:
        if len(selected)==0 and len(candidates)==1: selected=candidates
        else: raise RuntimeError("Ambiguous or missing OAuth candidates")
    c=selected[0]
    client_ok=c["client"].startswith(CLOUD_PROJECT+"-")
    check("OAUTH_CLIENT_PROJECT_PIN",client_ok,
          "Client fingerprint must match pinned Cloud project")
    scope=c.get("scope") or ""
    scopes=set(re.split(r"[\s,]+",scope))
    writes={"https://www.googleapis.com/auth/script.projects",
            "https://www.googleapis.com/auth/script.deployments"}
    scope_ok=writes.issubset(scopes)
    check("WRITE_SCOPES_ATTESTED_BEFORE_ANY_MUTATION",scope_ok,
          "Existing token metadata must attest both production write scope grants; no new consent")
    RESULT["oauth_evidence"]={
        "candidate_profiles_found":len(candidates),
        "client_id_present_in_named_profile":bool(c["client"]),
        "client_id_project_match":client_ok,
        "token_scope_metadata_present":bool(scope),
        "required_deployment_write_scopes_attested":len(writes.intersection(scopes)),
        "required_deployment_write_scopes_total":len(writes),
        "raw_client_id_and_token_values_exported":False
    }
    token=c["access"]
    try: who=api("GET","https://www.googleapis.com/oauth2/v2/userinfo",token)
    except urllib.error.HTTPError as e:
        if e.code!=401 or not all((c["refresh"],c["client"],c["secret"])): raise
        doc=api("POST","https://oauth2.googleapis.com/token",
                body={"grant_type":"refresh_token","client_id":c["client"],
                      "client_secret":c["secret"],"refresh_token":c["refresh"]})
        token=doc["access_token"]
        who=api("GET","https://www.googleapis.com/oauth2/v2/userinfo",token)
        RESULT["oauth_refreshed_in_memory"]=True
    check("GOOGLE_PRINCIPAL_PIN",(who.get("email") or "").lower()==EXPECTED_PRINCIPAL,
          "Authenticated effective user must match production account")
    return token
def file_map(content):
    files=content.get("files") or []
    pairs={}
    for f in files:
        key=(str(f.get("name")),str(f.get("type")))
        if key in pairs: raise RuntimeError("Duplicate script file "+str(key))
        pairs[key]=f
    return pairs
def content_hash(doc):
    items=sorted((name,typ,text_sha(f.get("source") or "")) for (name,typ),f in file_map(doc).items())
    return text_sha(json.dumps(items,separators=(",",":")))
def get_deployments(token):
    arr=[];page=""
    for i in range(20):
        p="?"+urllib.parse.urlencode({"pageSize":100,**({"pageToken":page} if page else {})})
        r=project_get("/deployments"+p,token)
        arr.extend(r.get("deployments",[]))
        page=r.get("nextPageToken") or ""
        if not page:break
    else: raise RuntimeError("Deployment pagination exhausted")
    return arr
def require_exact_v167(token):
    project=project_get("",token)
    if not check("SCRIPT_PROJECT_IDENTITY",project.get("scriptId")==SCRIPT,"Actual production project ID"):
        raise RuntimeError("Wrong production script")
    deployments=get_deployments(token)
    target=[d for d in deployments if d.get("deploymentId")==DEPLOYMENT]
    if len(target)!=1: raise RuntimeError("Pinned API deployment ID not unique")
    old=target[0]
    api_exec=any(x.get("entryPointType")=="EXECUTION_API" for x in old.get("entryPoints",[]))
    if not check("PINNED_V167_API_DEPLOYMENT",
            old.get("deploymentConfig",{}).get("versionNumber")==VERSION and api_exec,
            "Existing deployed API version and entrypoint"):
        raise RuntimeError("Deployment changed before protection")
    # Diagnose EVERY execution-API deployment before any release action.
    # Existence alone does not mean another version has NJ/DE registrars.
    # Nonetheless the single-ID installer always holds when alternatives exist.
    api_deployments=[d for d in deployments
          if any(x.get("entryPointType")=="EXECUTION_API" for x in d.get("entryPoints",[]))]
    alternates=[d for d in api_deployments if d.get("deploymentId")!=DEPLOYMENT]
    observed_versions={}
    for d in api_deployments:
        version=d.get("deploymentConfig",{}).get("versionNumber")
        if not isinstance(version,int) or version<1:
            observed_versions[str(version)]={"status":"UNVERIFIED_INVALID_VERSION"}
        elif str(version) not in observed_versions:
            try:
                contents=project_get("/content?versionNumber="+str(version),token)
                sources=file_map(contents)
                generated=[name for (name,typ) in sources
                   if typ=="SERVER_JS" and re.match(r"^(NJ|DE)[A-Za-z]+CountyConnector$",name)]
                sdk=sources.get(("CountyConnectorSDK","SERVER_JS"),{}).get("source","")
                registry_deny=("NJ_DE_PROTECTIVE_RELEASE_DENY_ONLY" in sdk)
                observed_versions[str(version)]={
                  "status":"READ_ONLY_VERSION_SOURCE_OBSERVED",
                  "source_file_count":len(sources),
                  "nj_de_generated_connectors":len(generated),
                  "explicit_deny_only_sdk_marker":registry_deny,
                  "possible_nj_de_live_exposure":bool(generated) and not registry_deny,
                  "source_tree_sha256":content_hash(contents)
                }
            except Exception as e:
                observed_versions[str(version)]={"status":"UNVERIFIED_READ_FAILED",
                                               "error":error(e)}
    RESULT["api_deployment_inventory"]={
        "total_deployments":len(deployments),
        "execution_api_deployments":len(api_deployments),
        "alternate_execution_api_deployments":len(alternates),
        "versions":observed_versions,
        "deployments":[{
          "deployment_id":d.get("deploymentId"),
          "version":d.get("deploymentConfig",{}).get("versionNumber"),
          "is_pinned_target":d.get("deploymentId")==DEPLOYMENT,
          "source_inspection_status":observed_versions.get(str(d.get("deploymentConfig",{}).get("versionNumber")),{}).get("status"),
          "possible_nj_de_live_exposure":observed_versions.get(str(d.get("deploymentConfig",{}).get("versionNumber")),{}).get("possible_nj_de_live_exposure")
        } for d in api_deployments],
        "inventory_only_not_authorization":True
    }
    check("NO_ALTERNATE_UNGUARDED_API_DEPLOYMENT",not alternates,
          "Single-ID rollout stops if any alternate API deployment exists. Count="+str(len(alternates)))
    immutable=project_get("/content?versionNumber=167",token)
    head=project_get("/content",token)
    base=file_map(immutable); current=file_map(head)
    if not check("EXACT_HEAD_EQUALS_V167",
       len(base)==481 and content_hash(head)==content_hash(immutable) and set(base)==set(current),
       "Entire Apps Script HEAD must match immutable V167, not just scheduler"):
        raise RuntimeError("Source drift or unexpected file count")
    pa=base.get(("CountyProductionScheduler","SERVER_JS"))
    if not check("PA_PINNED_SOURCE_HASH",bool(pa) and
       text_sha(pa.get("source",""))==PA_SCHED_SHA,"PA immutable scheduler unchanged"):
        raise RuntimeError("PA scheduler source not pinned")
    RESULT["baseline"]={"file_count":len(base),"tree_sha256":content_hash(immutable),
      "pa_scheduler_sha256":PA_SCHED_SHA,"old_api_version":VERSION}
    return immutable,old
def inject(source,needle,replacement,label):
    count=source.count(needle)
    if count!=1:raise RuntimeError("Safety patch anchor mismatch: "+label+" count="+str(count))
    return source.replace(needle,replacement,1)
def build_protected(immutable):
    base=file_map(immutable)
    copied=json.loads(json.dumps(immutable))
    items=file_map(copied)
    sdk_key=("CountyConnectorSDK","SERVER_JS")
    if sdk_key not in items:raise RuntimeError("No CountyConnectorSDK in v167")
    old=items[sdk_key].get("source") or ""
    if "NJ_DE_PROTECTIVE_RELEASE_DENY_ONLY" in old:raise RuntimeError("Guard already in v167")
    source=inject(old,
      "function register(connector) {",
      """function register(connector) {
    // DENY-ONLY: every NJ/DE generated connector remains disabled at registry.
    if (connector && /^(NJ|DE)$/.test(String(connector.state || '').toUpperCase())) {
      connector.enabled = false;
    }""","register")
    source=inject(source,
      "function run(connectorId, options) {",
      """function run(connectorId, options) {
    // DENY-ONLY before infrastructure/audit/IDs/network calls.
    if (/^(NJ|DE)-/.test(String(connectorId || '').trim().toUpperCase())) {
      throw new Error('NJ_DE_PROTECTIVE_RELEASE_DENY_ONLY');
    }""","run")
    source=inject(source,
      "function persist_(record, context) {",
      """function persist_(record, context) {
    // Defense in depth: parcel inventory is not actionable distress.
    var pstate = String((record || {}).State || '').toUpperCase();
    if (pstate === 'NJ' || pstate === 'DE' ||
        (context && (context.dataset === 'parcel_inventory' ||
                     context.dataset === 'property_assessment'))) {
      throw new Error('NON_DISTRESS_OR_NJ_DE_PERSIST_DENIED');
    }""","persist")
    items[sdk_key]["source"]=source
    generated=[]
    for (name,typ),f in items.items():
        if typ!="SERVER_JS" or not re.match(r"^(NJ|DE)[A-Za-z]+CountyConnector$",name):continue
        before=f.get("source") or ""
        manifest_enable_pattern=r"(?m)^    enabled: true,$"
        if len(re.findall(manifest_enable_pattern,before))!=1:
            raise RuntimeError("Connector top-level manifest enabled flag missing/ambiguous: "+name)
        f["source"]=re.sub(manifest_enable_pattern,"    enabled: false,",before,count=1)
        generated.append(name)
    if len(generated)!=24:raise RuntimeError("Expected precisely 24 NJ/DE generated connectors, got "+str(len(generated)))
    if set(base)!=set(items):raise RuntimeError("Project file set changed")
    changed=[k for k in base if (base[k].get("source") or "")!=(items[k].get("source") or "")]
    if len(changed)!=25 or sdk_key not in changed:raise RuntimeError("Unexpected patch surface")
    original=base[("CountyProductionScheduler","SERVER_JS")]["source"]
    modified=items[("CountyProductionScheduler","SERVER_JS")]["source"]
    if original!=modified or text_sha(modified)!=PA_SCHED_SHA:
        raise RuntimeError("PA scheduler changed")
    manifests=[k for k in items if k==("appsscript","JSON")]
    if len(manifests)!=1:raise RuntimeError("Missing sole required manifest")
    RESULT["candidate"]={"file_count":len(items),"generated_connectors_denied":len(generated),
       "sdk_guard":"DENY_ONLY","changed_files":len(changed),
       "changed_names":[k[0] for k in changed],
       "candidate_tree_sha256":content_hash(copied)}
    return copied
def offline_behavior_test(candidate):
    # Source-level structural guards are anchored and verified; no Apps Script run.
    v=file_map(candidate)
    sdk=v[("CountyConnectorSDK","SERVER_JS")]["source"]
    r=sdk.find("function run(connectorId, options) {")
    deny=sdk.find("NJ_DE_PROTECTIVE_RELEASE_DENY_ONLY",r)
    ensure=sdk.find("ensureInfrastructure()",r)
    passed=r!=-1 and r<deny<ensure
    if not passed: raise RuntimeError("Live guard not before audit initialization")
    if sdk.count("NON_DISTRESS_OR_NJ_DE_PERSIST_DENIED")!=1:
        raise RuntimeError("Persistence guard missing")
    for k,f in v.items():
        if k[1]=="SERVER_JS" and re.match(r"^(NJ|DE)[A-Za-z]+CountyConnector$",k[0]):
            if not re.search(r"(?m)^    enabled: false,$",f.get("source","")):
                raise RuntimeError("Generated connector enabled: "+k[0])
    # V167 GET wrappers and PA schedule must remain literally identical.
    return check("DENY_ONLY_STATIC_SOURCE_REGRESSION",True,
                 "24 manifests disabled; SDK run/registration/persist guarded before audit")
def validate_approvals():
    path=HOME/".config/reos-approvals/NJ_DE_DENY_ONLY_PROTECTIVE.json"
    if path.is_symlink() or not path.is_file():
        check("THREE_INDEPENDENT_PROTECTIVE_RELEASE_APPROVALS",False,
              "Missing independently signed review manifest; no deployment writes")
        return False
    d=json.loads(path.read_text())
    if d.get("release")!="NJ_DE_DENY_ONLY_V1" or d.get("git_commit")!=EXPECTED_HEAD or d.get("script_id")!=SCRIPT:
        check("THREE_INDEPENDENT_PROTECTIVE_RELEASE_APPROVALS",False,"Approval manifest scope/commit mismatch")
        return False
    roles=d.get("github_reviewers") or {}
    if set(roles)!={"custodian","operations","independent"}:
        check("THREE_INDEPENDENT_PROTECTIVE_RELEASE_APPROVALS",False,"Separate roles missing")
        return False
    logins=[str(x).lower().strip() for x in roles.values()]
    if len(set(logins))!=3 or not all(logins):
        check("THREE_INDEPENDENT_PROTECTIVE_RELEASE_APPROVALS",False,"Reviewer accounts must be distinct")
        return False
    pr=git_get(f"/pulls/{PR_NUMBER}")
    reviews=[]
    for page_num in range(1,101):
        batch=git_get(f"/pulls/{PR_NUMBER}/reviews?per_page=100&page={page_num}")
        if not isinstance(batch,list):
            raise RuntimeError("Review pagination returned non-list")
        reviews.extend(batch)
        if len(batch)<100:break
    else:
        raise RuntimeError("Reviewer history exceeds 100 pages; fail closed")
    if pr.get("head",{}).get("sha")!=EXPECTED_HEAD or pr.get("merged_at") is not None:
        check("THREE_INDEPENDENT_PROTECTIVE_RELEASE_APPROVALS",False,"Wrong PR head or merged")
        return False
    latest={}
    for r in reviews if isinstance(reviews,list) else []:
        login=str((r.get("user") or {}).get("login","")).lower()
        if login in logins: latest[login]=r
    author=str((pr.get("user") or {}).get("login","")).lower()
    valid=author not in logins and all(latest.get(login,{}).get("state")=="APPROVED" and
        latest[login].get("commit_id")==EXPECTED_HEAD for login in logins)
    check("THREE_INDEPENDENT_PROTECTIVE_RELEASE_APPROVALS",valid,
          "Distinct custodian/operations/independent GitHub approvals, exact commit")
    return valid
def attest_protected(token,version,expected_hash):
    # Independent authenticated READBACK of both immutable source and deployment.
    saved=project_get("/content?versionNumber="+str(version),token)
    head=project_get("/content",token)
    target=project_get("/deployments/"+DEPLOYMENT,token)
    good=(content_hash(saved)==expected_hash and content_hash(head)==expected_hash and
      target.get("deploymentConfig",{}).get("versionNumber")==version)
    check("NEW_VERSION_IMMUTABLE_READBACK",good,
          "Immutable source, HEAD and updated production API deployment all equal candidate")
    if not good:return False
    v=file_map(saved)
    for name,typ in v:
        if typ=="SERVER_JS" and re.match(r"^(NJ|DE)[A-Za-z]+CountyConnector$",name):
            if not re.search(r"(?m)^    enabled: false,$",v[(name,typ)].get("source","")):
                check("NEW_DEPLOYMENT_24_CONNECTORS_DENIED",False,"A generated NJ/DE connector enabled")
                return False
    sdk=v[("CountyConnectorSDK","SERVER_JS")].get("source","")
    check("NEW_DEPLOYMENT_24_CONNECTORS_DENIED",all(x in sdk for x in
         ("NJ_DE_PROTECTIVE_RELEASE_DENY_ONLY","NON_DISTRESS_OR_NJ_DE_PERSIST_DENIED")),
         "SDK guard + all 24 generated connectors disabled in new immutable deployment")
    return RESULT["checks"]["NEW_DEPLOYMENT_24_CONNECTORS_DENIED"]["status"]=="PASS"
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--apply",action="store_true",help="Attempt controlled write only with verified independent approval")
    args=p.parse_args()
    WORK.mkdir(mode=0o700,parents=False,exist_ok=False)
    try:
        current=subprocess.run(["git","rev-parse","HEAD"],capture_output=True,text=True).stdout.strip()
        check("PINNED_RELEASE_COMMIT",bool(re.fullmatch(r"[a-f0-9]{40}",EXPECTED_HEAD)) and current==EXPECTED_HEAD,
              "Local source pin must equal signed review head")
        try:token=read_profile()
        except Exception as e: token=None;check("EXISTING_RUNTIME_OAUTH_PROFILE",False,error(e))
        if not token:raise RuntimeError("Authenticated production Google reads unavailable")
        if RESULT["checks"].get("GOOGLE_PRINCIPAL_PIN",{}).get("status")!="PASS":
            raise RuntimeError("Wrong effective principal")
        immutable,orig= require_exact_v167(token)
        candidate=build_protected(immutable)
        offline_behavior_test(candidate)
        approved=validate_approvals()
        # Also require verified client project for any write.
        fingerprint=RESULT["checks"].get("OAUTH_CLIENT_PROJECT_PIN",{}).get("status")=="PASS"
        RESULT["ready_for_controlled_promotion"]=(
            approved and fingerprint and
            RESULT["checks"].get("WRITE_SCOPES_ATTESTED_BEFORE_ANY_MUTATION",{}).get("status")=="PASS" and
            RESULT["checks"].get("NO_ALTERNATE_UNGUARDED_API_DEPLOYMENT",{}).get("status")=="PASS")
        if not args.apply:
            RESULT["status"]="READ_ONLY_PROTECTIVE_RELEASE_PREPARED"
            raise ReadOnlyPrepared()
        scopes_ok=RESULT["checks"].get("WRITE_SCOPES_ATTESTED_BEFORE_ANY_MUTATION",{}).get("status")=="PASS"
        all_api_closed=(RESULT["checks"].get("NO_ALTERNATE_UNGUARDED_API_DEPLOYMENT",{}).get("status")=="PASS")
        if not approved or not fingerprint or not scopes_ok or not all_api_closed or RESULT["checks"]["PINNED_RELEASE_COMMIT"]["status"]!="PASS":
            raise RuntimeError("Release approvals, client fingerprint or source pin missing: no remote writes")
        # Risk boundary: updateContent atomically replaces the complete HEAD;
        # re-read the full current project immediately before writing.
        fresh=project_get("/content",token)
        if content_hash(fresh)!=RESULT["baseline"]["tree_sha256"]:
            raise RuntimeError("HEAD changed after preflight; no production writes")
        # Ensure the original execution API deployment still serves V167.
        freshdep=project_get("/deployments/"+DEPLOYMENT,token)
        if freshdep.get("deploymentConfig",{}).get("versionNumber")!=VERSION:
            raise RuntimeError("Deployment changed after preflight; no production writes")
        # Narrow authorized write sequence; do not retry on uncertain outcomes.
        PROTECTED["write_attempts"]+=1
        PROTECTED["mutation_outcome"]="UNKNOWN_PENDING_GOOGLE_RESPONSE"
        # Only writable source fields go into updateContent. Omit Google
        # output-only File properties (timestamps, owners, functionSet).
        update_files=[{"name":x["name"],"type":x["type"],"source":x["source"]}
                      for x in candidate["files"]]
        response=api("PUT","https://script.googleapis.com/v1/projects/"+SCRIPT+"/content",
                     token,{"files":update_files})
        PROTECTED["production_mutations"]+=1
        PROTECTED["mutation_outcome"]="HEAD_UPDATE_ACKNOWLEDGED"
        if content_hash(response)!=content_hash(candidate):
            raise RuntimeError("HEAD PUT response differs; stop, manual recovery required")
        gothead=project_get("/content",token)
        if content_hash(gothead)!=content_hash(candidate):
            raise RuntimeError("HEAD readback differs; stop, manual recovery required")
        PROTECTED["write_attempts"]+=1
        PROTECTED["mutation_outcome"]="UNKNOWN_PENDING_VERSION_RESPONSE"
        ver=api("POST","https://script.googleapis.com/v1/projects/"+SCRIPT+"/versions",
                token,{"description":"REOS NJ/DE DENY-ONLY protective safety release; no county activation"})
        PROTECTED["versions_created"]+=1
        PROTECTED["mutation_outcome"]="VERSION_CREATION_ACKNOWLEDGED"
        new_ver=ver.get("versionNumber")
        if not isinstance(new_ver,int) or new_ver<=VERSION:
            raise RuntimeError("New immutable version number not attested")
        gotversion=project_get("/content?versionNumber="+str(new_ver),token)
        if content_hash(gotversion)!=content_hash(candidate):
            raise RuntimeError("New immutable source mismatch; deployment NOT updated")
        # Protect the same pinned API deployment; creating another while leaving
        # V167 reachable would not close the old write path.
        manifest=orig.get("deploymentConfig",{}).get("manifestFileName","appsscript")
        PROTECTED["write_attempts"]+=1
        PROTECTED["mutation_outcome"]="UNKNOWN_PENDING_DEPLOYMENT_RESPONSE"
        updated=api("PUT","https://script.googleapis.com/v1/projects/"+SCRIPT+
              "/deployments/"+DEPLOYMENT,token,
              {"deploymentConfig":{"scriptId":SCRIPT,"versionNumber":new_ver,
               "manifestFileName":manifest,
               "description":"REOS NJ/DE deny-only protective release; no county enablement"}})
        PROTECTED["deployment_updates"]+=1
        PROTECTED["mutation_outcome"]="DEPLOYMENT_UPDATE_ACKNOWLEDGED"
        if updated.get("deploymentConfig",{}).get("versionNumber")!=new_ver:
            raise RuntimeError("Deployment PUT response mismatch")
        if not attest_protected(token,new_ver,content_hash(candidate)):
            raise RuntimeError("Independent readback failed; manual quarantine and rollback required")
        PROTECTED["mutation_outcome"]="PROTECTED_DEPLOYMENT_VERIFIED"
        RESULT["status"]="PROTECTIVE_DEPLOYMENT_READBACK_PASS_NO_NJ_DE_ACTIVATION"
        RESULT["new_version"]=new_ver
    except ReadOnlyPrepared:
        pass
    except Exception as e:
        RESULT["blockers"].append("RELEASE_STOPPED:"+error(e))
    finally:
        RESULT["mutations"]["credential_files_changed"]=any(
           file_sha(Path(p))!=s for p,s in CRED.items())
        if RESULT["mutations"]["credential_files_changed"]:
            RESULT["blockers"].append("CREDENTIAL_FILE_HASH_CHANGED")
        approval_template={
            "release":"NJ_DE_DENY_ONLY_V1","git_commit":EXPECTED_HEAD,
            "script_id":SCRIPT,
            "github_reviewers":{
                "custodian":"REPLACE_WITH_MATTHEW_VERIFIED_GITHUB_LOGIN",
                "operations":"REPLACE_WITH_SCOTT_VERIFIED_GITHUB_LOGIN",
                "independent":"REPLACE_WITH_SYDNEY_VERIFIED_GITHUB_LOGIN"},
            "note":"Template only; unsigned, no authorization. Three independent exact-commit GitHub approvals required."
        }
        (WORK/"UNSIGNED_APPROVAL_TEMPLATE.json").write_text(
            json.dumps(approval_template,indent=2,sort_keys=True)+"\n")
        report=WORK/"attestation.json"
        report.write_text(json.dumps(RESULT,indent=2,sort_keys=True)+"\n")
        summary=[
          "=== REOS NJ DE DENY-ONLY PROTECTIVE RELEASE ===",
          "SOURCE_COMMIT="+EXPECTED_HEAD,
          "STATUS="+RESULT["status"],
          "NEW_VERSION="+str(RESULT.get("new_version","NONE")),
          "PRODUCTION_MUTATIONS_ACKNOWLEDGED="+str(PROTECTED["production_mutations"]),
          "WRITE_ATTEMPTS="+str(PROTECTED["write_attempts"]),
          "MUTATION_OUTCOME="+PROTECTED["mutation_outcome"],
          "IMMUTABLE_VERSIONS_CREATED="+str(PROTECTED["versions_created"]),
          "DEPLOYMENT_UPDATES="+str(PROTECTED["deployment_updates"]),
          "CREDENTIAL_FILES_CHANGED="+str(PROTECTED["credential_files_changed"]),
          "API_EXECUTION_DEPLOYMENTS="+str(RESULT.get("api_deployment_inventory",{}).get("execution_api_deployments","UNVERIFIED")),
          "ALTERNATE_API_DEPLOYMENTS="+str(RESULT.get("api_deployment_inventory",{}).get("alternate_execution_api_deployments","UNVERIFIED")),
          "OAUTH_CLIENT_PIN="+RESULT.get("checks",{}).get("OAUTH_CLIENT_PROJECT_PIN",{}).get("status","NOT_ATTESTED"),
          "OAUTH_WRITE_SCOPES="+RESULT.get("checks",{}).get("WRITE_SCOPES_ATTESTED_BEFORE_ANY_MUTATION",{}).get("status","NOT_ATTESTED"),
          "NJ_DE_LIVE_INGESTION=BLOCKED",
          "MAO_AND_OFFERS=BLOCKED",
          "PA_SCHEDULER_EXECUTED=FALSE",
        ]
        summary += ["BLOCKER="+x for x in RESULT["blockers"]]
        (WORK/"SUMMARY.txt").write_text("\n".join(summary)+"\n")
        packet=HOME/("REOS_NJ_DE_DENY_ONLY_"+STAMP+".zip")
        with zipfile.ZipFile(packet,"w",zipfile.ZIP_DEFLATED) as z:
            for file in sorted(WORK.iterdir()):z.write(file,arcname=file.name)
        packet.chmod(0o600)
        print("\n".join(summary))
        print("EVIDENCE_ZIP="+str(packet))
        print("EVIDENCE_SHA256="+sha(packet.read_bytes()))
        print("RESULT="+RESULT["status"])
    return 0 if RESULT["status"]=="PROTECTIVE_DEPLOYMENT_READBACK_PASS_NO_NJ_DE_ACTIVATION" else 2
if __name__=="__main__":
    sys.exit(main())
