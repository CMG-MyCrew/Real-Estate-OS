#!/usr/bin/env python3
"""Offline source-only regression. Never imports production credentials or calls Google."""
import hashlib, importlib.util, json, pathlib, string, subprocess
p = pathlib.Path(__file__).with_name("reos-nj-de-deny-only-protective-release.py")
spec = importlib.util.spec_from_file_location("reos_protective_module", p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
sdk = """
var REOS = REOS || {};
REOS.CountyConnectorSDK = (function(){
var REGISTRY = {};
function validateConnector_(connector) {}
function ensureInfrastructure() { REOS.writes += 1; }
function register(connector) {
  validateConnector_(connector);
  REGISTRY[connector.id] = connector;
}
function run(connectorId, options) {
  options = options || {};
  ensureInfrastructure();
  return true;
}
function persist_(record, context) {
  if (context.dryRun) return { action: 'skipped' };
  REOS.writes += 1;
  return REOS.Database.insert('DISTRESS_LEADS', record);
}
return { register: register, run: run, persist: persist_ };
})();
"""
pa = "const ALLOWLIST = Object.freeze(['code_violations','vacant_properties','sheriff_tax_sales','sheriff_mortgage_sales','probate']);"
m.PA_SCHED_SHA=hashlib.sha256(pa.encode()).hexdigest()
files = [{"name":"appsscript","type":"JSON","source":'{"timeZone":"America/New_York"}'},
         {"name":"CountyProductionScheduler","type":"SERVER_JS","source":pa},
         {"name":"CountyConnectorSDK","type":"SERVER_JS","source":sdk}]
# 21 NJ, 3 DE. There are no nonalphabetic county-name suffixes.
nj = ["NJ"+string.ascii_uppercase[i]+"CountyConnector" for i in range(21)]
de = ["DE"+string.ascii_uppercase[i]+"CountyConnector" for i in range(3)]
for name in nj+de:
    files.append({"name":name,"type":"SERVER_JS",
       "source":"var MANIFEST = {\n    enabled: true,\n    datasets: {\n      parcel_inventory: {\n        enabled: true,\n      }\n    }\n};"})
# Existing unrelated production source must remain exactly the same.
for i in range(481-len(files)):
    files.append({"name":"UNTOUCHED_"+str(i),"type":"SERVER_JS","source":"function other"+str(i)+"() {}"})
immutable={"scriptId":m.SCRIPT,"files":files}
try:
    candidate=m.build_protected(immutable)
    assert m.offline_behavior_test(candidate)
    before=m.file_map(immutable);after=m.file_map(candidate)
    assert len(after)==481
    changed=[key for key in before if before[key]["source"]!=after[key]["source"]]
    assert len(changed)==25,changed
    assert ("CountyConnectorSDK","SERVER_JS") in changed
    assert all(x in [t[0] for t in changed] for x in nj+de)
    assert all(before[k]["source"]==after[k]["source"] for k in before if k not in changed)
    assert all("    enabled: false," in after[(name,"SERVER_JS")]["source"] and
               "        enabled: true," in after[(name,"SERVER_JS")]["source"]
               for name in nj+de), "Dataset-level enabled flags must remain unchanged"
    assert m.content_hash(immutable)!=m.content_hash(candidate)
    driver = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const REOS = {writes:0, Database:{insert:()=>({ok:true})}};
vm.runInNewContext(fs.readFileSync(0,'utf8'), {REOS});
const api=REOS.CountyConnectorSDK;
const nj={id:'NJ-MOCK',state:'NJ',enabled:true};
const de={id:'DE-MOCK',state:'DE',enabled:true};
const pa={id:'PA-MOCK',state:'PA',enabled:true};
api.register(nj); api.register(de); api.register(pa);
assert.equal(nj.enabled,false);
assert.equal(de.enabled,false);
assert.equal(pa.enabled,true);
assert.throws(()=>api.run('NJ-MOCK',{}),/NJ_DE_PROTECTIVE_RELEASE_DENY_ONLY/);
assert.throws(()=>api.run('DE-MOCK',{}),/NJ_DE_PROTECTIVE_RELEASE_DENY_ONLY/);
assert.equal(REOS.writes,0);
assert.equal(api.run('PA-MOCK',{}),true);
assert.equal(REOS.writes,1);
assert.throws(()=>api.persist({State:'DE'},{dryRun:false,dataset:'code_violations'}),/NON_DISTRESS_OR_NJ_DE_PERSIST_DENIED/);
assert.throws(()=>api.persist({State:'NJ'},{dryRun:false,dataset:'code_violations'}),/NON_DISTRESS_OR_NJ_DE_PERSIST_DENIED/);
assert.throws(()=>api.persist({State:'PA'},{dryRun:false,dataset:'parcel_inventory'}),/NON_DISTRESS_OR_NJ_DE_PERSIST_DENIED/);
assert.throws(()=>api.persist({State:'PA'},{dryRun:false,dataset:'property_assessment'}),/NON_DISTRESS_OR_NJ_DE_PERSIST_DENIED/);
assert.equal(REOS.writes,1);
api.persist({State:'PA'},{dryRun:false,dataset:'code_violations'});
assert.equal(REOS.writes,2);
console.log('NODE_MOCK_NJ_DE_PERSIST_AND_RUN=PASS');
"""
    mock = subprocess.run(['node','-e',driver], input=after[('CountyConnectorSDK','SERVER_JS')]['source'],
                          text=True,capture_output=True,timeout=15)
    if mock.returncode != 0 or 'NODE_MOCK_NJ_DE_PERSIST_AND_RUN=PASS' not in mock.stdout:
        raise AssertionError('Node mock failed: '+mock.stderr[-500:])
    print("NODE_MOCK_NJ_DE_PERSIST_AND_RUN=PASS")
    # Force an alternate EXECUTION_API deployment in the synthetic production
    # inventory. A read-only preflight must observe it and retain the block.
    real_project_get=m.project_get
    def fake_project_get(path, token):
        if path=="":return {"scriptId":m.SCRIPT}
        if path.startswith("/deployments?"):
            return {"deployments":[
                {"deploymentId":m.DEPLOYMENT,"deploymentConfig":{"versionNumber":167},
                 "entryPoints":[{"entryPointType":"EXECUTION_API"}]},
                {"deploymentId":"SECOND_API_DEPLOYMENT",
                 "deploymentConfig":{"versionNumber":167},
                 "entryPoints":[{"entryPointType":"EXECUTION_API"}]}]}
        if path in ("/content","/content?versionNumber=167"):return immutable
        raise AssertionError("Unexpected synthetic GET: "+path)
    try:
        m.project_get=fake_project_get
        base_again, target=m.require_exact_v167("TEST_SYNTHETIC_TOKEN")
        assert len(base_again["files"])==481
        inventory=m.RESULT["api_deployment_inventory"]
        assert inventory["execution_api_deployments"]==2
        assert inventory["alternate_execution_api_deployments"]==1
        assert inventory["versions"]["167"]["nj_de_generated_connectors"]==24
        assert inventory["versions"]["167"]["possible_nj_de_live_exposure"] is True
        assert m.RESULT["checks"]["NO_ALTERNATE_UNGUARDED_API_DEPLOYMENT"]["status"]=="HOLD"
        assert m.PROTECTED["write_attempts"]==0
    finally:
        m.project_get=real_project_get
    # Mirror the observed V167 incompatibility: persistence helper is
    # present under a different name. The builder must fail before writes
    # but still preserve enough function/writer metadata for review.
    altered=json.loads(json.dumps(immutable))
    altfiles=m.file_map(altered)
    original_source=altfiles[("CountyConnectorSDK","SERVER_JS")]["source"]
    altfiles[("CountyConnectorSDK","SERVER_JS")]["source"]=original_source.replace(
        "function persist_(record, context) {",
        "function persistCountyRecord_(record, context) {")
    shape=m.inspect_v167_source_shape(altered)
    assert shape["persist_exact"]==0
    assert "persistCountyRecord_" in m.RESULT["v167_sdk_source_shape"]["named_function_inventory"]
    assert m.RESULT["v167_sdk_source_shape"]["source_exported"] is False
    failed=False
    try:
        m.build_protected(altered)
    except RuntimeError as e:
        failed="Safety patch anchor mismatch: persist" in str(e)
    assert failed,"unknown live SDK persist helper must stop the release"
    assert m.PROTECTED["write_attempts"]==0
    print("V167_UNKNOWN_SDK_WRITER_SHAPE_FAIL_CLOSED=PASS")
    print("ALTERNATE_EXECUTION_API_READONLY_INVENTORY=PASS")
    print("PROTECTIVE_24_CONNECTORS_DISABLED=PASS")
    print("SDK_RUN_AND_PERSIST_GUARDS=PASS")
    print("UNRELATED_456_FILES_PRESERVED=PASS")
    print("PA_SCHEDULER_SOURCE_IMMUTABLE=PASS")
    print("DEPLOYMENT_MUTATIONS=NONE")
except Exception as e:
    print("PROTECTIVE_SELF_TEST=FAIL",type(e).__name__,str(e))
    raise
