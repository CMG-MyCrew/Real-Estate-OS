#!/usr/bin/env python3
"""Sussex Sheriff NJ — synthetic-only case identity and lifecycle contract.

An OFFLINE prototype of how to identify/compare hypothetical county sale
events. All inputs generated locally; no live property cases, HTTP, Google,
persistence, Apps Script trigger or MAO/offer behavior. Never a production
connector or approval to use an official source.
"""
from __future__ import annotations
import hashlib
import json
import re
import sys
from datetime import datetime

STATE="NJ"
COUNTY="NJ-SUSSEX"
FEED="sheriff_mortgage_sales"
EXPERIMENTAL_STATUSES=frozenset(("open","adjourned","postponed",
                                  "cancelled","completed","sold","stayed"))
REQUIRED=("case_id","docket_number","sale_date","address","city","status")


class SafetyHold(ValueError):
    pass


def deny_if(condition,code):
    if condition:
        raise SafetyHold(code)


def normalize(row):
    deny_if(not isinstance(row,dict),"RECORD_INVALID_TYPE")
    deny_if(any(k not in row for k in REQUIRED),"REQUIRED_FIELD_MISSING")
    deny_if(row.get("state")!=STATE or row.get("county_id")!=COUNTY or
            row.get("feed")!=FEED,"STATE_COUNTY_FEED_MISMATCH")
    case=str(row["case_id"]).strip().upper()
    docket=str(row["docket_number"]).strip().upper()
    status=str(row["status"]).strip().lower()
    addr=str(row["address"]).strip()
    city=str(row["city"]).strip()
    deny_if(re.fullmatch(r"[A-Z0-9-]{4,40}",case) is None,
            "INVALID_CASE_ID")
    deny_if(re.fullmatch(r"[A-Z0-9-]{5,40}",docket) is None,
            "INVALID_DOCKET")
    deny_if(len(addr)<5 or len(city)<2,"ADDRESS_CITY_REQUIRED")
    deny_if(status not in EXPERIMENTAL_STATUSES,"UNRECOGNIZED_SALE_STATUS")
    date=str(row["sale_date"]).strip()
    try:
        d=datetime.strptime(date,"%m/%d/%Y").date()
    except ValueError as exc:
        raise SafetyHold("INVALID_SALE_DATE") from exc
    deny_if(d.year<2000 or d.year>2100,"SALE_DATE_OUT_OF_RANGE")
    # Within-county, within-feed stable case key. Docket changes must fail,
    # never create a second case event merely because a docket was altered.
    case_key=(STATE,COUNTY,FEED,case)
    return case_key,{
        "docket":docket,
        "status":status,
        "date":d.isoformat(),
        # A privacy-preserving digest to compare property-location stability,
        # never exported or used as a substitute for authoritative identity.
        "address_digest":hashlib.sha256(
            (addr.upper()+"|"+city.upper()).encode("utf-8")
        ).hexdigest()
    }


def scan_snapshot(rows, prior=None, *, fixture_mode=False):
    deny_if(fixture_mode is not True,"LIVE_RECORD_PROCESSING_NOT_AUTHORIZED")
    deny_if(not isinstance(rows,list) or len(rows)>500,
            "BAD_SNAPSHOT_SIZE")
    # Pure in-memory map used ONLY for synthetic testing. No storage APIs.
    old=dict(prior or {})
    new=dict(old)
    within=set()
    metrics={"synthetic_fixture":True,"validated":0,"new":0,"unchanged":0,
             "status_or_date_changed":0,"missing_not_assumed_cancelled":0,
             "production_writes":0,"source_certified":False,
             "live_ingestion_permitted":False}
    for row in rows:
        key,entry=normalize(row)
        deny_if(key in within,"DUPLICATE_CASE_IN_SNAPSHOT")
        within.add(key)
        previous=old.get(key)
        if previous is None:
            metrics["new"]+=1
        else:
            deny_if(previous["docket"]!=entry["docket"],
                    "DOCKET_CHANGED_FOR_CASE_ID")
            deny_if(previous["address_digest"]!=entry["address_digest"],
                    "ADDRESS_CHANGED_REQUIRES_REVIEW")
            if previous["status"]!=entry["status"] or previous["date"]!=entry["date"]:
                metrics["status_or_date_changed"]+=1
            else:
                metrics["unchanged"]+=1
        new[key]=entry
        metrics["validated"]+=1
    # Missing IDs might reflect web pagination, filtering, or temporary
    # omission. NEVER infer a cancellation from absence.
    metrics["missing_not_assumed_cancelled"]=sum(key not in within for key in old)
    return new,metrics


def fixture(case,docket,sale,status,address):
    return {
        "state":STATE,"county_id":COUNTY,"feed":FEED,
        "case_id":case,"docket_number":docket,"sale_date":sale,
        "address":address,"city":"TEST CITY","status":status
    }


def expect_denial(rows,prior,code):
    try:
        scan_snapshot(rows,prior,fixture_mode=True)
    except SafetyHold as exc:
        assert str(exc)==code,(code,str(exc))
        return
    raise AssertionError("Unsafe fixture unexpectedly passed "+code)


def self_test():
    first=[
        fixture("260001","F-000001-26","12/02/2026","open","100 EXAMPLE ST"),
        fixture("260002","F-000002-26","01/06/2027","open","200 EXAMPLE ST"),
    ]
    known,one=scan_snapshot(first,fixture_mode=True)
    assert one["new"]==2 and one["validated"]==2
    again,two=scan_snapshot(first,known,fixture_mode=True)
    assert two["new"]==0 and two["unchanged"]==2
    assert again==known
    updated=first[:]
    updated[0]=fixture("260001","F-000001-26","01/13/2027",
                       "adjourned","100 EXAMPLE ST")
    next_state,third=scan_snapshot(updated,again,fixture_mode=True)
    assert third["status_or_date_changed"]==1 and third["unchanged"]==1
    assert third["new"]==0
    assert next_state!=known
    missing_state,four=scan_snapshot([updated[0]],next_state,fixture_mode=True)
    assert four["missing_not_assumed_cancelled"]==1
    assert len(missing_state)==2
    expect_denial(first+[first[0]],known,"DUPLICATE_CASE_IN_SNAPSHOT")
    expect_denial([
      fixture("260001","F-CHANGED-26","12/02/2026","open","100 EXAMPLE ST")
    ],known,"DOCKET_CHANGED_FOR_CASE_ID")
    expect_denial([
      fixture("260001","F-000001-26","12/02/2026","open","999 DIFFERENT ST")
    ],known,"ADDRESS_CHANGED_REQUIRES_REVIEW")
    expect_denial([
      fixture("260001","F-000001-26","12/02/2026","mystery","100 EXAMPLE ST")
    ],known,"UNRECOGNIZED_SALE_STATUS")
    expect_denial([
      fixture("260001","F-000001-26","not-a-date","open","100 EXAMPLE ST")
    ],known,"INVALID_SALE_DATE")
    wrong=fixture("260001","F-000001-26","12/02/2026","open","100 EXAMPLE ST")
    wrong["state"]="PA"
    expect_denial([wrong],known,"STATE_COUNTY_FEED_MISMATCH")
    try:
        scan_snapshot(first,fixture_mode=False)
    except SafetyHold as exc:
        assert str(exc)=="LIVE_RECORD_PROCESSING_NOT_AUTHORIZED"
    else:raise AssertionError("Live-mode bypass")
    print("SUSSEX_CASE_IDENTITY_AND_REPLAY_IDEMPOTENCY=PASS")
    print("SUSSEX_ADJOURNMENT_AS_SYNTHETIC_STATUS_CHANGE=PASS")
    print("SUSSEX_MISSING_CASE_DOES_NOT_IMPLY_CANCELLATION=PASS")
    print("SUSSEX_BAD_DOCKET_SCOPE_STATUS_AND_DUPLICATE_FAIL_CLOSED=PASS")
    print("NO_CASE_RECORD_EXPORT_NO_SOURCE_APPROVAL_NO_PRODUCTION_WRITES=PASS")
    return {
      "scope":COUNTY,"feed":FEED,"mode":"OFFLINE_SYNTHETIC_ONLY",
      "initial_insert_candidates":one["new"],
      "idempotent_replay_unchanged":two["unchanged"],
      "synthetic_change_candidates":third["status_or_date_changed"],
      "missing_not_interpreted_as_cancelled":four["missing_not_assumed_cancelled"],
      "automated_live_schema_approval":False,
      "pagination_certified":False,
      "status_semantics_certified":False,
      "approved_source_owner":False,
      "live_records_processed":0,
      "production_mutations":0,
      "triggers_installed":0,
      "mao_or_offers_authorized":False,
      "release_decision":"HOLD"
    }


if __name__=="__main__":
    try:
        report=self_test()
        print("=== REOS NJ SUSSEX OFFLINE EVENT CONTRACT ===")
        print(json.dumps(report,indent=2,sort_keys=True))
        print("RESULT=OFFLINE_CONTRACT_TEST_PASS_NO_GO")
    except (AssertionError,SafetyHold) as ex:
        print("RESULT=FAIL_CLOSED")
        print("BLOCKER="+str(ex))
        print("PRODUCTION_MUTATIONS=NONE")
        sys.exit(2)
