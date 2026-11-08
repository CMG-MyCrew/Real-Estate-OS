#!/usr/bin/env python3
"""No network, no production credentials. Test the read-only compatibility planner."""
import hashlib
import importlib.util
import json
from pathlib import Path
import string

def load(path, name):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

ROOT=Path(__file__).resolve().parent
m=load(ROOT/"reos-nj-de-api-deployment-compatibility-matrix.py","reos_matrix_test")
r=m.release
sdk="""var REOS = REOS || {};
REOS.CountyConnectorSDK = (function(){
function register(connector) {return connector;}
function run(connectorId, options) {ensureInfrastructure();}
function persist_(
  record,
  context,
  pagePersistence,
  lockContext
) {
  REOS.Database.assertScriptLockContext(lockContext);
}
})();
"""
scheduler="function PA_SCHEDULER() {}"
r.PA_SCHED_SHA=hashlib.sha256(scheduler.encode()).hexdigest()
files=[
 {"name":"appsscript","type":"JSON","source":'{"timeZone":"America/New_York","runtimeVersion":"V8"}'},
 {"name":"CountyProductionScheduler","type":"SERVER_JS","source":scheduler},
 {"name":"CountyConnectorSDK","type":"SERVER_JS","source":sdk},
 {"name":"PublicApi","type":"SERVER_JS","source":"function PUBLIC_A() {}\nfunction PUBLIC_B() {}"}
]
for state,n in (("NJ",21),("DE",3)):
    for i in range(n):
        files.append({"name":state+string.ascii_uppercase[i]+"CountyConnector",
           "type":"SERVER_JS","source":"var MANIFEST={\n    enabled: true,\n};"})
while len(files)<481:
    i=len(files)
    files.append({"name":"Other"+str(i),"type":"SERVER_JS","source":"// Other code"})
v167={"files":files}
assert len(r.file_map(v167))==481
candidate=r.build_protected(v167)
assert r.content_hash(candidate)!=r.content_hash(v167)
legacy={"files":[
   {"name":"appsscript","type":"JSON","source":'{"timeZone":"UTC","runtimeVersion":"V8"}'},
   {"name":"PublicApi","type":"SERVER_JS","source":"function PUBLIC_A() {}\nfunction LEGACY_ONLY() {}"}
 ]}
g=m.analyze_version(4,legacy,candidate,v167)
assert g["generated_nj_de_connectors"]==0
assert "LEGACY_ONLY" in g["api_callable_surface"]["functions_missing_after_rebind_sample"]
assert "POTENTIAL_CALLER_FUNCTION_REMOVAL" in g["risk_flags"]
assert "MANIFEST_RUNTIME_OR_SCOPE_DRIFT" in g["risk_flags"]
assert g["automatic_repointing_permitted"] is False
g2=m.analyze_version(167,v167,candidate,v167)
assert g2["generated_nj_de_connectors"]==24
assert g2["exposure_classification"]=="POTENTIAL_NJ_DE_LIVE_EXPOSURE"
assert g2["source_diff_vs_deny_only_candidate"]["changed_files_count"]==25
assert g2["source_diff_vs_deny_only_candidate"]["old_files_missing_in_candidate"]==0
assert g2["automatic_repointing_permitted"] is False
print("MATRIX_VERSION_4_FUNCTION_AND_MANIFEST_DRIFT=PASS")
print("MATRIX_V167_24_CONNECTORS_AND_EXACT_25_FILE_PATCH=PASS")

real_get=r.project_get
real_list=r.get_deployments
try:
    def mocked_get(path,token):
        if path=="": return {"scriptId":r.SCRIPT}
        if path in ("/content","/content?versionNumber=167"):return v167
        if path=="/content?versionNumber=4":return legacy
        raise RuntimeError("Unexpected mock Google GET "+path)
    def mocked_deployments(token):
        return [
          {"deploymentId":r.DEPLOYMENT,"deploymentConfig":{"versionNumber":167},"entryPoints":[{"entryPointType":"EXECUTION_API"}]},
          {"deploymentId":"HISTORICAL_EXECUTION_API_4","deploymentConfig":{"versionNumber":4},"entryPoints":[{"entryPointType":"EXECUTION_API"}]},
          {"deploymentId":"UNVERSIONED_EXECUTION_API","deploymentConfig":{},"entryPoints":[{"entryPointType":"EXECUTION_API"}]}
        ]
    r.project_get=mocked_get
    r.get_deployments=mocked_deployments
    result=m.run_collect("MOCK_TOKEN_NOT_SENT")
    assert result["head_vs_v167"]=="FULL_TREE_PASS"
    assert result["inventory"]["execution_api_deployments"]==3
    assert result["inventory"]["deployment_exposure_unknown"]==1
    assert result["inventory"]["deployment_exposure_potential"]==1
    assert result["inventory"]["distinct_readable_immutable_versions"]==2
    assert all(not x["safe_to_repoint"] for x in result["execution_api_deployments"])
    assert result["decision"]=="NO_GO"
finally:
    r.project_get=real_get
    r.get_deployments=real_list

# A mutation request must be stopped BEFORE the underlying API can see it.
try:
    m.readonly_api("PUT","https://script.googleapis.com/v1/projects/"+r.SCRIPT+"/content",
                   "NOT_A_VALID_TOKEN",{"files":[]})
    raise AssertionError("Mutating Google call escaped the read-only gate")
except RuntimeError as e:
    assert "READ_ONLY_MULTI_DEPLOYMENT_DENIED_REMOTE_MUTATION" in str(e)

print("MATRIX_UNKNOWN_VERSION_AND_NO_REPOINT_AUTHORITY=PASS")
print("MATRIX_GOOGLE_REMOTE_MUTATION_DENIED=PASS")
print("PRODUCTION_MUTATIONS=NONE")
