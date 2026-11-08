#!/usr/bin/env python3
"""Read-only REOS multi-deployment API compatibility / exposure matrix.

READ-ONLY ONLY. No --apply option. Google: project/source/deployment GET,
userinfo GET, optional OAuth token refresh POST in memory. Never scripts.run,
updateContent, versions.create, deployment.update, trigger/Sheets operations.
This is an evidence-gathering dependency for a separately reviewed
multi-endpoint protective plan, not release or NJ/DE activation authority.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
import zipfile

ROOT=Path(__file__).resolve().parent
MODULE=ROOT/"reos-nj-de-deny-only-protective-release.py"
spec=importlib.util.spec_from_file_location("reos_denyonly_for_inventory",MODULE)
release=importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
PIN=os.environ.get("REOS_RELEASE_PIN","").strip()
ORIGINAL_API=release.api
ORIGINAL_WRITE_METHODS={"PUT","PATCH","DELETE"}
SAFETY_LOG={"google_gets":0,"oauth_refresh_in_memory":0,"appscript_executions":0,
            "remote_write_attempts":0,"credential_files_modified":False}

def readonly_api(method,url,token=None,body=None):
    parts=urllib.parse.urlsplit(url)
    token_refresh=(method=="POST" and parts.hostname=="oauth2.googleapis.com"
                   and parts.path=="/token")
    if method!="GET" and not token_refresh:
        SAFETY_LOG["remote_write_attempts"]+=1
        raise RuntimeError("READ_ONLY_MULTI_DEPLOYMENT_DENIED_REMOTE_MUTATION")
    if method=="GET":
        allowed=(parts.scheme=="https" and
             ((parts.hostname=="script.googleapis.com"
               and parts.path.startswith("/v1/projects/"+release.SCRIPT)) or
              (parts.hostname=="www.googleapis.com"
               and parts.path=="/oauth2/v2/userinfo")))
        if not allowed:
            raise RuntimeError("READ_ONLY_MULTI_DEPLOYMENT_DENIED_GET_PATH")
        SAFETY_LOG["google_gets"]+=1
    else:
        SAFETY_LOG["oauth_refresh_in_memory"]+=1
    return ORIGINAL_API(method,url,token,body)

release.api=readonly_api

def short_error(e):
    return release.error(e)

def callable_surface(source_doc):
    """Metadata based or lexical approximation; never proof of client compatibility."""
    export_names=set()
    files=release.file_map(source_doc)
    functionset_files=0
    fallback_files=0
    for (name,typ),f in files.items():
        if typ!="SERVER_JS":continue
        fnset=f.get("functionSet") or {}
        entries=fnset.get("values") if isinstance(fnset,dict) else None
        if isinstance(entries,list):
            functionset_files+=1
            for ent in entries:
                fn=ent.get("name") if isinstance(ent,dict) else None
                if fn and isinstance(fn,str) and re.fullmatch(r"[A-Za-z_$][\w$]*",fn):
                    export_names.add(fn)
        else:
            fallback_files+=1
            # Only column-zero function declarations are top-level candidates.
            for fn in re.findall(r"(?m)^function\s+([A-Za-z_$][\w$]*)\s*\(",f.get("source") or ""):
                export_names.add(fn)
    return {"names":export_names,"functionset_files":functionset_files,
            "lexical_fallback_files":fallback_files,
            "source":"GOOGLE_FUNCTIONSET_WITH_LEXICAL_FALLBACK",
            "complete_callable_registry_proven":False}

def manifest_surface(doc):
    files=release.file_map(doc)
    f=files.get(("appsscript","JSON"),{})
    raw=f.get("source","")
    try:
        m=json.loads(raw)
    except Exception:
        return {"present":bool(f),"parseable":False,"sha256":release.text_sha(raw)}
    dep=m.get("dependencies") or {}
    return {"present":True,"parseable":True,
        "sha256":release.text_sha(raw),
        "runtime_version":m.get("runtimeVersion"),
        "execution_api_access":(m.get("executionApi") or {}).get("access"),
        "oauth_scopes_sha256":release.text_sha(json.dumps(
             sorted(m.get("oauthScopes") or []),separators=(",",":"))),
        "oauth_scope_count":len(m.get("oauthScopes") or []),
        "library_count":len(dep.get("libraries") or []),
        "advanced_services_count":len(dep.get("enabledAdvancedServices") or [])}

def analyze_version(version, source, protected, baseline):
    old=release.file_map(source)
    new=release.file_map(protected)
    old_calls=callable_surface(source)
    target_calls=callable_surface(protected)
    old_functions=old_calls["names"]
    target_functions=target_calls["names"]
    removed=sorted(old_functions-target_functions)
    added=sorted(target_functions-old_functions)
    disappeared=sorted(k[0]+"."+k[1] for k in old if k not in new)
    new_files=sorted(k[0]+"."+k[1] for k in new if k not in old)
    changed=sorted(k[0]+"."+k[1] for k in old if k in new and
          release.text_sha(old[k].get("source") or "")!=
          release.text_sha(new[k].get("source") or ""))
    generated=[name for (name,typ) in old if typ=="SERVER_JS"
               and re.match(r"^(NJ|DE)[A-Za-z]+CountyConnector$",name)]
    sdk=old.get(("CountyConnectorSDK","SERVER_JS"),{}).get("source") or ""
    has_marker="NJ_DE_PROTECTIVE_RELEASE_DENY_ONLY" in sdk
    current_manifest=manifest_surface(source)
    target_manifest=manifest_surface(protected)
    same_manifest=current_manifest["sha256"]==target_manifest["sha256"]
    classification=("POTENTIAL_NJ_DE_LIVE_EXPOSURE" if generated and not has_marker
          else "DENY_ONLY_MARKER_PRESENT_NOT_FULLY_CERTIFIED" if generated
          else "NO_GENERATED_NJ_DE_CONNECTORS_OTHER_ENTRYPOINTS_UNVERIFIED")
    risks=[]
    if generated and not has_marker:risks.append("NJ_DE_UNGUARDED_GENERATED_SOURCE")
    if removed:risks.append("POTENTIAL_CALLER_FUNCTION_REMOVAL")
    if disappeared:risks.append("SOURCE_FILES_REMOVED_ON_REBIND")
    if not same_manifest:risks.append("MANIFEST_RUNTIME_OR_SCOPE_DRIFT")
    if version!=release.VERSION:risks.append("OLDER_VERSION_SEMANTIC_CHANGE_REQUIRES_CONSUMER_APPROVAL")
    if old_calls["lexical_fallback_files"]>0:
        risks.append("FUNCTION_EXPORT_INVENTORY_LEXICAL_ONLY")
    return {
       "version":version,"read_status":"PASS","immutable_tree_sha256":release.content_hash(source),
       "source_file_count":len(old),"generated_nj_de_connectors":len(generated),
       "sdk_explicit_deny_marker_present":has_marker,
       "exposure_classification":classification,
       "source_diff_vs_deny_only_candidate":{
          "changed_files_count":len(changed),"old_files_missing_in_candidate":len(disappeared),
          "new_files_not_in_original":len(new_files),
          "removed_files_sample":disappeared[:30],"added_files_sample":new_files[:30],
          "changed_file_names_sample":changed[:40]},
       "api_callable_surface":{
          "observed_function_count":len(old_functions),
          "functionset_metadata_files":old_calls["functionset_files"],
          "lexical_fallback_files":old_calls["lexical_fallback_files"],
          "candidate_observed_function_count":len(target_functions),
          "functions_missing_after_rebind_count":len(removed),
          "functions_missing_after_rebind_sample":removed[:60],
          "new_functions_after_rebind_count":len(added),
          "new_functions_after_rebind_sample":added[:30],
          "client_invocation_traffic_and_dependencies_verified":False,
          "runtime_callable_inventory_complete":False},
       "manifest":current_manifest,
       "protected_candidate_manifest_same":same_manifest,
       "risk_flags":risks,
       "automatic_repointing_permitted":False
    }

def run_collect(token):
    result={"captured_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
       "mode":"READ_ONLY_MULTI_DEPLOYMENT_COMPATIBILITY",
       "script_id":release.SCRIPT,"old_protected_deployment_id":release.DEPLOYMENT,
       "baseline_immutable_version":release.VERSION,
       "release_branch_head_expected":PIN,
       "production_mutations":0,"deployment_updates":0,"versions_created":0,
       "trigger_mutations":0,"county_ingestion":"HOLD",
       "historical_execution_api_paths":"UNCERTIFIED",
       "mao_and_offers":"BLOCKED","client_consumers_attested":False,
       "independent_release_approvals_attested":False,
       "oauth_client_fingerprint_attested":False,
       "oauth_write_scopes_attested":False,
       "decision":"NO_GO"}
    script=release.project_get("",token)
    if script.get("scriptId")!=release.SCRIPT:raise RuntimeError("Production script identity mismatch")
    deployments=release.get_deployments(token)
    if not deployments:raise RuntimeError("No Apps Script deployments returned")
    api_deployments=[d for d in deployments if
        any(ep.get("entryPointType")=="EXECUTION_API" for ep in d.get("entryPoints",[]))]
    if not api_deployments:raise RuntimeError("No production Execution API deployments")
    release_version=release.project_get("/content?versionNumber=167",token)
    head=release.project_get("/content",token)
    if release.content_hash(head)!=release.content_hash(release_version):
        result["head_vs_v167"]="DRIFT_NOT_RELEASE_SAFE"
    else:
        result["head_vs_v167"]="FULL_TREE_PASS"
    if len(release.file_map(release_version))!=481:
        raise RuntimeError("Immutable V167 file count changed")
    pa=release.file_map(release_version).get(("CountyProductionScheduler","SERVER_JS"),{})
    if release.text_sha(pa.get("source") or "")!=release.PA_SCHED_SHA:
        raise RuntimeError("Immutable PA scheduler source hash not pinned")
    candidate=release.build_protected(release_version)
    release.offline_behavior_test(candidate)
    result["deny_only_candidate"]={
       "full_tree_sha256":release.content_hash(candidate),
       "files_total":len(release.file_map(candidate)),
       "changed_file_count":release.RESULT.get("candidate",{}).get("changed_files"),
       "generated_nj_de_disabled":release.RESULT.get("candidate",{}).get("generated_connectors_denied"),
       "built_from_live_immutable_v167":True,
       "staged_only":True}
    observed_versions={}
    for d in api_deployments:
        version=d.get("deploymentConfig",{}).get("versionNumber")
        if not isinstance(version,int) or version<1:continue
        if str(version) in observed_versions:continue
        try:
            code=release_version if version==167 else release.project_get(
                "/content?versionNumber="+str(version),token)
            observed_versions[str(version)]=analyze_version(version,code,candidate,release_version)
        except Exception as e:
            observed_versions[str(version)]={"version":version,
                "read_status":"UNVERIFIED","error":short_error(e),
                "automatic_repointing_permitted":False}
    # Unknown or versionless deployments are still potentially callable.
    deployment_rows=[]
    for d in api_deployments:
        vid=d.get("deploymentConfig",{}).get("versionNumber")
        source=observed_versions.get(str(vid),{})
        row={
            "deployment_id":d.get("deploymentId"),
            "version":vid,
            "is_pinned_v167_target":d.get("deploymentId")==release.DEPLOYMENT,
            "entrypoint_types":sorted(set(ep.get("entryPointType") for ep in d.get("entryPoints",[]) if ep.get("entryPointType"))),
            "source_inspection":source.get("read_status","UNVERIFIED_VERSION_NUMBER"),
            "nj_de_exposure_classification":source.get("exposure_classification","UNKNOWN"),
            "generated_nj_de_connectors":source.get("generated_nj_de_connectors"),
            "safe_to_repoint":False,
            "consumer_dependency_analysis":"NOT_ATTESTED",
            "independent_review_required":True
        }
        deployment_rows.append(row)
    all_versions=set(str(d.get("deploymentConfig",{}).get("versionNumber")) for d in api_deployments)
    unknown=sum(x["source_inspection"]!="PASS" for x in deployment_rows)
    potential=sum(x["nj_de_exposure_classification"]=="POTENTIAL_NJ_DE_LIVE_EXPOSURE" for x in deployment_rows)
    needs_consumer_review=sum(bool(observed_versions.get(str(x["version"]),{}).get("risk_flags")) for x in deployment_rows)
    result["inventory"]={
       "total_deployments":len(deployments),
       "execution_api_deployments":len(api_deployments),
       "alternate_api_deployments":len(api_deployments)-sum(
           d.get("deploymentId")==release.DEPLOYMENT for d in api_deployments),
       "distinct_version_labels":len(all_versions),
       "distinct_readable_immutable_versions":sum(x.get("read_status")=="PASS" for x in observed_versions.values()),
       "deployment_exposure_potential":potential,
       "deployment_exposure_unknown":unknown,
       "deployments_with_version_semantic_change_risk":needs_consumer_review,
       "all_execution_endpoints_protected":False}
    result["source_versions"]=observed_versions
    result["execution_api_deployments"]=deployment_rows
    result["release_gates"]={
      "all_reachable_execution_endpoints_mapped":"HOLD" if unknown else "SOURCE_INVENTORY_ONLY",
      "safe_multi_deployment_routing_compatibility":"HOLD",
      "actual_client_consumer_inventory":"NOT_ATTESTED",
      "deployment_owner_approval":"NOT_ATTESTED",
      "oauth_client_and_write_scopes":"NOT_ATTESTED",
      "three_separate_reviewer_approvals":"NOT_ATTESTED",
      "no_automatic_live_nj_de_activation":"PASS"}
    return result

def main():
    stamp=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    home=Path.home()
    folder=home/("REOS_NJ_DE_API_MATRIX_"+stamp)
    folder.mkdir(mode=0o700,parents=False,exist_ok=False)
    result={"captured_utc":stamp,"mode":"READ_ONLY_MULTI_DEPLOYMENT_COMPATIBILITY",
            "decision":"NO_GO","county_ingestion":"HOLD"}
    try:
        actual=subprocess.run(["git","rev-parse","HEAD"],text=True,capture_output=True).stdout.strip()
        if not re.fullmatch(r"[a-f0-9]{40}",PIN) or PIN!=actual:
            raise RuntimeError("Pinned source checkout does not equal exact reviewed commit")
        token=release.read_profile()
        if release.RESULT.get("checks",{}).get("GOOGLE_PRINCIPAL_PIN",{}).get("status")!="PASS":
            raise RuntimeError("Incorrect production OAuth principal")
        result=run_collect(token)
    except Exception as e:
        result["error"]=short_error(e)
        result["decision"]="NO_GO_ERROR"
    finally:
        SAFETY_LOG["credential_files_modified"]=any(
            release.file_sha(Path(f))!=old for f,old in release.CRED.items())
        result["request_counters"]=SAFETY_LOG
        result["oauth_evidence_sanitized"]=release.RESULT.get("oauth_evidence",{})
        result["source_pin"]=PIN
        result["production_mutations"]=0
        result["versions_created"]=0
        result["deployment_updates"]=0
        result["no_source_or_credentials_exported"]=True
        result["county_ingestion"]="HOLD"
        result["mao_and_offers"]="BLOCKED"
        result["historical_execution_api_paths"]="UNCERTIFIED"
        result["decision"]="NO_GO"
        (folder/"compatibility_matrix.json").write_text(
           json.dumps(result,indent=2,sort_keys=True,default=str)+"\n")
        total=result.get("inventory",{})
        summary=[
           "=== REOS NJ DE MULTI-DEPLOYMENT COMPATIBILITY MATRIX ===",
           "SOURCE_PIN="+PIN,
           "API_EXECUTION_DEPLOYMENTS="+str(total.get("execution_api_deployments","UNVERIFIED")),
           "ALTERNATE_API_DEPLOYMENTS="+str(total.get("alternate_api_deployments","UNVERIFIED")),
           "POTENTIAL_NJ_DE_EXPOSURE="+str(total.get("deployment_exposure_potential","UNVERIFIED")),
           "EXPOSURE_UNKNOWN="+str(total.get("deployment_exposure_unknown","UNVERIFIED")),
           "READABLE_SOURCE_VERSIONS="+str(total.get("distinct_readable_immutable_versions","UNVERIFIED")),
           "SEMANTIC_COMPATIBILITY_RISK="+str(total.get("deployments_with_version_semantic_change_risk","UNVERIFIED")),
           "FULL_HEAD_V167_SOURCE="+str(result.get("head_vs_v167","UNVERIFIED")),
           "CANDIDATE_24_NJ_DE_DISABLED="+str(result.get("deny_only_candidate",{}).get("generated_nj_de_disabled","UNVERIFIED")),
           "GOOGLE_GETS="+str(SAFETY_LOG["google_gets"]),
           "CREDENTIAL_FILES_MODIFIED="+str(SAFETY_LOG["credential_files_modified"]),
           "GOOGLE_REMOTE_WRITE_ATTEMPTS="+str(SAFETY_LOG["remote_write_attempts"]),
           "APPS_SCRIPT_EXECUTIONS=0",
           "PRODUCTION_MUTATIONS=NONE",
           "ALL_API_DEPLOYMENTS_CLOSED=FALSE",
           "RELEASE_AUTHORITY=HOLD",
           "NJ_DE_LIVE_INGESTION=HOLD",
           "MAO_AND_OFFERS=BLOCKED",
           "RESULT=READ_ONLY_EVIDENCE_FOR_INDEPENDENT_REVIEW"
        ]
        if result.get("error"):summary.append("BLOCKER="+result["error"])
        (folder/"SUMMARY.txt").write_text("\n".join(summary)+"\n")
        packet=home/("REOS_NJ_DE_API_MATRIX_"+stamp+".zip")
        with zipfile.ZipFile(packet,"w",zipfile.ZIP_DEFLATED) as z:
            for x in sorted(folder.iterdir()):z.write(x,arcname=x.name)
        packet.chmod(0o600)
        print("\n".join(summary))
        print("EVIDENCE_ZIP="+str(packet))
        print("EVIDENCE_SHA256="+hashlib.sha256(packet.read_bytes()).hexdigest())
        print("REPORT_JSON="+str(folder/"compatibility_matrix.json"))
    return 2
if __name__=="__main__":
    sys.exit(main())
