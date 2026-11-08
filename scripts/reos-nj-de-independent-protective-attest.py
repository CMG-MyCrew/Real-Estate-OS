#!/usr/bin/env python3
"""REOS second-pass immutable readback attestation; no Apps Script mutation methods."""
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import urllib.parse
import zipfile

BASE=Path(__file__).with_name("reos-nj-de-deny-only-protective-release.py")
spec=importlib.util.spec_from_file_location("reos_protective_release",BASE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
ORIGINAL_API=m.api
def read_only_api(method,url,token=None,body=None):
    if method not in ("GET","POST"):
        raise ValueError("Independent attestor write methods BLOCKED")
    u=urllib.parse.urlsplit(url)
    if method=="POST" and not (u.hostname=="oauth2.googleapis.com" and u.path=="/token"):
        raise ValueError("No Apps Script executions or deployment/content writes permitted")
    return ORIGINAL_API(method,url,token,body)
m.api=read_only_api

def verify():
    result={"capture_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
            "kind":"INDEPENDENT_READONLY_IMMUTABLE_READBACK",
            "checks":{},"blockers":[],"production_writes":0,
            "apps_script_functions_executed":0,"nj_de_live_authority":"HOLD",
            "maos_offers":"BLOCKED","independent_google_principal":"NOT_ESTABLISHED"}
    def check(name,ok,detail=""):
        result["checks"][name]="PASS" if ok else "HOLD"
        if not ok:result["blockers"].append(name)
        if detail:result.setdefault("notes",{})[name]=str(detail)[:240]
        return ok
    try:
        token=m.read_profile()
        check("AUTHENTICATED_USER",m.RESULT["checks"].get("GOOGLE_PRINCIPAL_PIN",{}).get("status")=="PASS")
        check("OAUTH_CLIENT_PROJECT_PIN",m.RESULT["checks"].get("OAUTH_CLIENT_PROJECT_PIN",{}).get("status")=="PASS")
        old=m.project_get("/content?versionNumber=167",token)
        expected=m.build_protected(old)
        m.offline_behavior_test(expected)
        deploy=m.project_get("/deployments/"+m.DEPLOYMENT,token)
        version=deploy.get("deploymentConfig",{}).get("versionNumber")
        check("PROTECTED_VERSION_CREATED",isinstance(version,int) and version>167,version)
        if not isinstance(version,int) or version<=167:
            raise RuntimeError("Active deployment is still V167; protective release not installed")
        immutable=m.project_get("/content?versionNumber="+str(version),token)
        head=m.project_get("/content",token)
        hash_expected=m.content_hash(expected)
        check("IMMUTABLE_SOURCE_MATCHES_DENY_ONLY_CANDIDATE",
              m.content_hash(immutable)==hash_expected)
        check("HEAD_SOURCE_MATCHES_DENY_ONLY_CANDIDATE",
              m.content_hash(head)==hash_expected)
        check("PINNED_DEPLOYMENT_SERVES_PROTECTED_VERSION",
              deploy.get("deploymentId")==m.DEPLOYMENT and
              deploy.get("deploymentConfig",{}).get("versionNumber")==version)
        expected_files=m.file_map(expected)
        deployed_files=m.file_map(immutable)
        names=[k[0] for k in expected_files if k[1]=="SERVER_JS" and
              __import__("re").match(r"^(NJ|DE)[A-Za-z]+CountyConnector$",k[0])]
        check("ALL_24_NJ_DE_SOURCE_MANIFESTS_DISABLED",
              len(names)==24 and all(__import__("re").search(
                 r"(?m)^    enabled: false,$",deployed_files[(name,"SERVER_JS")]["source"])
                 for name in names))
        sdk=deployed_files.get(("CountyConnectorSDK","SERVER_JS"),{}).get("source","")
        check("SDK_DENY_BEFORE_AUDIT",sdk.find("NJ_DE_PROTECTIVE_RELEASE_DENY_ONLY")!=-1 and
              sdk.find("NJ_DE_PROTECTIVE_RELEASE_DENY_ONLY")<
              sdk.find("ensureInfrastructure()",sdk.find("function run(connectorId, options) {")))
        check("PA_SCHEDULER_PRESERVED",
              m.text_sha(deployed_files[("CountyProductionScheduler","SERVER_JS")]["source"])==
              m.PA_SCHED_SHA)
        result["deployed_version"]=version
        result["candidate_tree_sha256"]=hash_expected
        result["immutable_sha256"]=m.content_hash(immutable)
        result["current_head_sha256"]=m.content_hash(head)
        # This is an independent second GET verification process, NOT an
        # independently authorized custodian signing the deployment.
        result["status"]="READBACK_PASS_NJ_DE_STILL_DISABLED" if not result["blockers"] else "READBACK_INCOMPLETE_HOLD"
    except Exception as e:
        result["blockers"].append("ATTESTATION_STOPPED:"+m.error(e))
        result["status"]="READBACK_INCOMPLETE_HOLD"
    stamp=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out=Path.home()/("REOS_NJ_DE_PROTECTIVE_INDEPENDENT_READBACK_"+stamp+".zip")
    b=json.dumps(result,indent=2,sort_keys=True).encode()
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("readback.json",b)
    out.chmod(0o600)
    print("=== REOS NJ DE INDEPENDENT READ-ONLY DEPLOYMENT READBACK ===")
    for name,value in result["checks"].items(): print("CHECK_"+name+"="+value)
    for blocker in result["blockers"]:print("BLOCKER="+blocker)
    print("NJ_DE_LIVE_INGESTION=HOLD")
    print("PRODUCTION_MUTATIONS=NONE")
    print("RESULT="+result["status"])
    print("EVIDENCE_ZIP="+str(out))
    print("EVIDENCE_SHA256="+hashlib.sha256(out.read_bytes()).hexdigest())
    return 0 if result["status"]=="READBACK_PASS_NJ_DE_STILL_DISABLED" else 2
if __name__=="__main__":
    sys.exit(verify())
