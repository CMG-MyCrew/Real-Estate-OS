#!/usr/bin/env python3
"""No-network full-path integration tests for gated NJ/DE sheriff provider API."""
from __future__ import annotations
import importlib.util
import os
from pathlib import Path
import sys
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/"scripts/reos-nj-de-provider-permission-coverage-readonly.py"
spec=importlib.util.spec_from_file_location("reos_provider_gate",PATH)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CATALOG=module.load("config/nj-de-philadelphia-parity-feed-catalog.json")
FAKE_KEY="ssd_api_"+("a"*46)

def empty_case_matrix():
    return [
       {"state":state,"county_id":cid,"provider_county":"",
        "coverage":"NOT_QUERIED","mortgage_status":"NOT_QUERIED",
        "mortgage_count_all":"","tax_status":"NOT_QUERIED",
        "tax_count_all":"","source_data_as_of":"",
        "source_authority":"NOT_ATTESTED",
        "live_record_conformance":"NOT_TESTED",
        "release_permission":"NO_PRODUCTION_AUTHORITY"}
       for state in ("NJ","DE")
       for cid in module.expected_counties(CATALOG,state)
    ]

class FakeProvider:
    omit_nj_sussex=False
    drift=False
    bad_plan=False
    mismatch=False
    instances=[]
    def __init__(self,key):
        assert key==FAKE_KEY
        self.key=key
        self.free=0
        self.metered=0
        type(self).instances.append(self)
    def get(self,path,params=None,metered=False):
        if metered: self.metered+=1
        else: self.free+=1
        assert self.free<=module.MAX_FREE_REQUESTS
        assert self.metered<=module.MAX_METERED_REQUESTS
        stamp="2026-11-08"
        if path=="/me":
            assert not metered
            return {"object":"account",
              "plan":"Starter" if self.bad_plan else "Pro",
              "trial":False,"status":"active",
              "api":{"keys":True,"records":True},
              "usage":{"month":{"remaining":20},"day":{"remaining":20}}}
        if path.startswith("/states/"):
            assert not metered
            state=path.split("/")[2]
            data=[]
            for cid in module.expected_counties(CATALOG,state):
                if self.omit_nj_sussex and cid=="NJ-SUSSEX": continue
                name=cid[len(state)+1:].replace("-"," ").title()
                data.append({"state":state,"county":name})
            return {"object":"list","state":state,"data":data,
                    "data_as_of":stamp}
        if path=="/sales/count":
            assert not metered and params["status"]=="all"
            total=0
            if params["state"]=="NJ" and params["county"]=="Sussex" and
               params["type"]=="mortgage_foreclosure":
                total=3
            if params["state"]=="DE" and params["county"]=="Kent" and
               params["type"]=="tax_foreclosure":
                total=2
            filters=dict(params)
            if self.mismatch: filters.pop("type")
            return {"object":"count","total":total,"filters":filters,
                    "data_as_of":"2026-11-09" if self.drift else stamp}
        if path=="/sales":
            assert metered and params["limit"]==1 and params["status"]=="all"
            kind=params["type"]
            record={
               "id":"0000000000c0ffee","sale_type":kind,
               "state":params["state"],"county":params["county"],
               "case_number":"F-TEST-0001","sheriff_number":"S-TEST-001",
               "address":"100 Example Street","city":"Testville",
               "sale_date":"2026-12-02",
               "sale_status":"scheduled",
               "status_detail":"Scheduled",
               "status_history":["2026-11-08: Scheduled"],
               "other_ids":[]
            }
            return {"object":"list","data":[record],
                    "has_more":False,"next_cursor":None,
                    "truncated":False,"data_as_of":stamp}
        raise AssertionError("UNEXPECTED_FAKE_ENDPOINT "+path)

def test_case(**switches):
    cls=type("ScopedFakeProvider",(FakeProvider,),switches | {"instances":[]})
    matrix=empty_case_matrix()
    report={"operator_attested_own_business_use":False}
    with mock.patch.dict(os.environ,{"SHERIFFSALEDATA_API_KEY":FAKE_KEY}),\
         mock.patch.object(module,"Provider",cls),\
         mock.patch.object(module,"safe_confirmation",
                           lambda *_args:True):
        module.live_stage(report,matrix)
    provider=cls.instances[0]
    assert provider.key=="" # ensure code discards credential
    assert report["free_provider_gets_attempted"]==provider.free
    assert report["metered_one_record_gets_attempted"]==provider.metered
    return report,matrix,provider

def main():
    report,matrix,p=test_case()
    assert report["gate"]=="BOUNDED_PROVIDER_SAMPLE_ATTEMPTED_REVIEW_REQUIRED",report
    assert report["county_coverage"]["NJ"]["listed"]==21
    assert report["county_coverage"]["DE"]["listed"]==3
    assert p.free==51 and p.metered==2
    assert report["real_source_sample_conformant"] is True
    assert len(report["real_source_conformance_samples"])==2
    assert all(x["result"]=="SINGLE_PAGE_CONFORMANT_NOT_FULL_FEED_CERTIFICATION"
               for x in report["real_source_conformance_samples"])
    assert all(x["live_record_content_exported"] is False for x in
               report["real_source_conformance_samples"])
    assert all("address" not in str(x) and "case_number" not in str(x)
               for x in report["real_source_conformance_samples"])
    print("SIMULATED_PAID_API_ENTITLEMENT_24_COUNTY_48_TYPE_COUNTS=PASS")
    print("SIMULATED_NJ_DE_TWO_BOUNDED_REAL_RECORD_ADAPTER_CHECKS=PASS")

    missing,_,mp=test_case(omit_nj_sussex=True)
    assert missing["county_coverage"]["NJ"]["listed"]==20
    assert missing["county_coverage"]["NJ"]["not_listed"]==1
    assert mp.free==49 and mp.metered==1
    assert len(missing["real_source_conformance_samples"])==2
    print("UNCOVERED_COUNTY_PRESERVED_AS_UNSUPPORTED_NOT_ZERO=PASS")

    drift,_,dp=test_case(drift=True)
    assert drift["gate"]=="COUNTY_TYPE_COUNT_DATE_DRIFT_NO_METERED_SAMPLE"
    assert dp.metered==0
    print("COUNT_DATE_DRIFT_PREVENTS_PAID_READ=PASS")

    plan,_,ap=test_case(bad_plan=True)
    assert plan["gate"]=="READ_ONLY_VERIFICATION_FAILED_CLOSED"
    assert plan["blocker"]=="API_PLAN_NOT_ACTIVE_OR_API_NOT_ENABLED"
    assert ap.free==1 and ap.metered==0
    print("INVALID_SUBSCRIPTION_PREVENTS_COUNTS_AND_SAMPLE=PASS")

    mismatch,_,ep=test_case(mismatch=True)
    assert mismatch["gate"]=="READ_ONLY_VERIFICATION_FAILED_CLOSED"
    assert mismatch["blocker"]=="COUNT_FILTER_ECHO_MISMATCH"
    assert ep.metered==0
    print("UNRELIABLE_COUNT_FILTERS_FAIL_CLOSED=PASS")

    with mock.patch.object(module,"safe_confirmation",lambda *_args:False):
        noauth={"operator_attested_own_business_use":False}
        module.live_stage(noauth,empty_case_matrix())
        assert noauth["gate"]=="OPERATOR_ATTESTATION_NOT_PROVIDED"
    print("NO_OPERATOR_ATTESTATION_NO_PROVIDER_CONNECTION=PASS")
    print("REMOTE_REQUESTS=NONE")
    print("REAL_PROPERTY_RECORDS_EXPORTED=NONE")
    print("PRODUCTION_MUTATIONS=NONE")
    print("RESULT=GATED_PROVIDER_ACCESS_FULL_PATH_OFFLINE_TESTS_ALL_PASS")
if __name__=="__main__":
    sys.exit(main())
