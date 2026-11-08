#!/usr/bin/env python3
"""Offline source-only regression. Never imports production credentials or calls Google."""
import hashlib, importlib.util, json, pathlib, string
p = pathlib.Path(__file__).with_name("reos-nj-de-deny-only-protective-release.py")
spec = importlib.util.spec_from_file_location("reos_protective_module", p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
sdk = """
var REOS = REOS || {};
var CountyConnectorSDK = (function(){
function register(connector) {
  validateConnector_(connector);
  REGISTRY[connector.id] = connector;
}
function run(connectorId, options) {
  options = options || {};
  ensureInfrastructure();
}
function persist_(record, context) {
  if (context.dryRun) return { action: 'skipped' };
  return Database.insert('DISTRESS_LEADS', record);
}
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
       "source":"var MANIFEST = {\n    enabled: true,\n    datasets: {}\n};"})
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
    assert m.content_hash(immutable)!=m.content_hash(candidate)
    print("PROTECTIVE_24_CONNECTORS_DISABLED=PASS")
    print("SDK_RUN_AND_PERSIST_GUARDS=PASS")
    print("UNRELATED_456_FILES_PRESERVED=PASS")
    print("PA_SCHEDULER_SOURCE_IMMUTABLE=PASS")
    print("DEPLOYMENT_MUTATIONS=NONE")
except Exception as e:
    print("PROTECTIVE_SELF_TEST=FAIL",type(e).__name__,str(e))
    raise
