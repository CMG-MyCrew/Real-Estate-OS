#!/usr/bin/env python3
"""REOS NJ/DE consolidated source + public-GIS activation gate. No production writes."""
import concurrent.futures, datetime, json, pathlib, re, subprocess, sys, urllib.parse, urllib.request
src, pin = pathlib.Path.cwd(), (sys.argv[1] if len(sys.argv) > 1 else '')
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
out = pathlib.Path.home() / ('REOS_NJ_DE_ACTIVATION_GATE_' + now + '.json')
report = {'captured_utc': now, 'source_pin': pin, 'status': 'HOLD',
          'production_mutations': 0, 'apps_script_executions': 0,
          'trigger_changes': 0, 'credentials_changed': 0, 'mao_offers_enabled': False,
          'counties': [], 'checks': [], 'blockers': []}
def check(name, passed, detail=''):
    report['checks'].append({'check': name, 'pass': bool(passed), 'detail': str(detail)})
    if not passed: report['blockers'].append(name + (': ' + str(detail) if detail else ''))
def http_json(url, params=None):
    if params: url += '?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'REOS-County-Gate/1.0', 'Accept': 'application/json'}), timeout=15) as r:
        return json.load(r)
def probe(item):
    endpoint, where = item['probe_url'], item['where']
    try:
        d = http_json(endpoint, {'where': where, 'returnCountOnly': 'true', 'f': 'json'})
        n = d.get('count') if isinstance(d, dict) else None
        return {'ok': isinstance(n, int) and n > 0, 'count': n, 'error': str(d.get('error',''))[:160]}
    except Exception as e:
        return {'ok': False, 'count': None, 'error': type(e).__name__ + ': ' + str(e)[:140]}
try:
    head = subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip()
    check('immutable_source_pin', bool(re.fullmatch(r'[0-9a-f]{40}',pin)) and head == pin, 'observed=' + head)
    files = sorted((src / 'config/county-connectors').glob('*.json'))
    selected = [p for p in files if p.name.startswith(('NJ-','DE-'))]
    nj = sum(p.name.startswith('NJ-') for p in selected)
    de = sum(p.name.startswith('DE-') for p in selected)
    check('NJ_21_DE_3_manifests', (nj,de)==(21,3), f'NJ={nj}, DE={de}')
    commands = (src / 'src/CountyConnectorCommands.gs').read_text()
    sdk = (src / 'src/CountyConnectorSDK.gs').read_text()
    check('generated_registry_supported', 'REOS.GeneratedCountyConnectorRegistrars' in commands)
    # Execute source-level regression with mocked Google APIs; never call Apps Script.
    unit = subprocess.run(['node', 'scripts/reos-county-sdk-safety.test.mjs'],
                          cwd=src, capture_output=True, text=True, timeout=45)
    detail = ((unit.stdout or '') + ' ' + (unit.stderr or '')).strip()[-800:]
    check('dry_run_has_no_audit_writes',
          unit.returncode == 0 and 'DRY_RUN_READ_ONLY=PASS' in unit.stdout
          and 'DRY_RUN_FAILURE_NO_WRITE=PASS' in unit.stdout, detail)
    check('parcel_sink_isolated_from_distress_leads',
          unit.returncode == 0 and 'NON_DISTRESS_LIVE_BLOCKED=PASS' in unit.stdout, detail)
    check('NJ_DE_LIVE_FAIL_CLOSED',
          unit.returncode == 0 and 'NJ_DE_LIVE_FAIL_CLOSED=PASS' in unit.stdout, detail)
    check('PA_LEGACY_LIVE_PATH_PRESERVED',
          unit.returncode == 0 and 'PA_LEGACY_LIVE_PATH_PRESERVED=PASS' in unit.stdout, detail)
    for p in selected:
        m = json.loads(p.read_text()); cid=m.get('id',''); state=m.get('state',''); county=m.get('county','')
        code_name = re.sub(r'[^A-Za-z0-9]', '', county.title())
        generated = src / f'src/connectors/generated/{state}{code_name}CountyConnector.gs'
        code = generated.read_text() if generated.exists() else ''
        check(cid + '_identity', cid == p.stem and state in ('NJ','DE'))
        check(cid + '_registered_once', code.count('REOS.GeneratedCountyConnectorRegistrars.push(') == 1)
        check(cid + '_manifest_enabled', m.get('enabled') is True)
        check(cid + '_single_dataset', len(m.get('datasets',{})) == 1)
        for ds, cfg in m.get('datasets',{}).items():
            where=cfg.get('sourceQuery',{}).get('where','')
            scoping=re.fullmatch(r"COUNTY='([^']+)'", where)
            check(cid+'_county_isolation', bool(scoping and scoping.group(1).casefold()==county.casefold()),where)
            url=cfg.get('endpoint','')
            valid=cfg.get('enabled') is True and cfg.get('adapter')=='arcgis' and url.startswith('https://') and url.endswith('/query')
            check(cid+'_dataset_configured',valid)
            if state=='DE':
                official='https://enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/FeatureServer/0/query'
                check(cid+'_DE_production_host',url==official,'configured host must be verified before promotion')
                probe_url=official
            else:
                official='https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0/query'
                check(cid+'_NJ_official_host',url==official)
                probe_url=url
            report['counties'].append({'id':cid,'state':state,'county':county,'dataset':ds,'where':where,'probe_url':probe_url})
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        probes=list(pool.map(probe, report['counties']))
    for item, result in zip(report['counties'],probes):
        item['public_count_only_get']=result
        check(item['id']+'_public_count_only', result['ok'], result.get('error') or ('count='+str(result['count'])))
    for gate in ('PRODUCTION_IDENTITY_AND_SOURCE_EQUIVALENCE_NOT_ATTESTED',
                 'NJ_DE_SCOPE_APPROVAL_NOT_ATTESTED',
                 'CANONICAL_DESTINATION_AND_IDEMPOTENCY_NOT_ATTESTED',
                 'PA_SCHEDULER_ISOLATION_NOT_ATTESTED',
                 'DE_PARCEL_ADDRESS_OWNER_ENRICHMENT_NOT_ATTESTED'):
        report['blockers'].append(gate)
except Exception as e:
    report['blockers'].append('PREFLIGHT_EXCEPTION: '+type(e).__name__+': '+str(e)[:200])
report['check_pass']=sum(x['pass'] for x in report['checks'])
report['check_fail']=sum(not x['pass'] for x in report['checks'])
out.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
out.chmod(0o600)
print('=== REOS NJ + DE CONSOLIDATED ACTIVATION GATE ===')
print('NJ_CONNECTORS=' + str(sum(c['state']=='NJ' for c in report['counties'])))
print('DE_CONNECTORS=' + str(sum(c['state']=='DE' for c in report['counties'])))
print('PUBLIC_COUNT_ONLY_PASS='+str(sum(c.get('public_count_only_get',{}).get('ok',False) for c in report['counties'])))
print('CHECK_PASS='+str(report['check_pass'])+' CHECK_FAIL='+str(report['check_fail']))
for reason in report['blockers']: print('BLOCKER='+reason)
print('APPS_SCRIPT_EXECUTIONS=NONE')
print('PRODUCTION_MUTATIONS=NONE')
print('PRODUCTION_ACTIVATION=HOLD')
print('EVIDENCE_JSON='+str(out))
sys.exit(2)
