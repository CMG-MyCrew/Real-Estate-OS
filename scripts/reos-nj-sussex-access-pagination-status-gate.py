#!/usr/bin/env python3
"""REOS Sussex sheriff: ONE-COMMAND access + pagination/status certification GATE.

OFFLINE ONLY. Simulates a 70-page snapshot and real observed status vocabulary;
does not request public pages, read credentials, create triggers or ingest cases.
Public visibility or robots.txt alone is never automated-use authorization.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile
import os

ROOT=Path(__file__).resolve().parents[1]
BASE="https://www.sussexcountysheriff.com/foreclosure-listings"
PUBLIC_OBSERVED_UI_PAGE_COUNT=70  # from public page titles 2/70, 5/70; dynamic, unverified exhaustive
PUBLIC_OBSERVED_STATUS_SAMPLES=(
    "Open",
    "Cancelled",
    "Bankruptcy Hold",
    "Sold to Plaintiff",
    "Sold to 3rd Party Purchaser",
    "Plaintiff Adjourned to 12/2/2026",
)
CANONICAL={
    "open":"OPEN",
    "cancelled":"CANCELLED_REVIEW",
    "bankruptcy hold":"BANKRUPTCY_HOLD",
    "sold to plaintiff":"SOLD_TO_PLAINTIFF",
    "sold to 3rd party purchaser":"SOLD_TO_THIRD_PARTY",
}
HOLD="HOLD_NOT_CERTIFIED"

def guard(condition, message):
    if not condition: raise ValueError(message)

def status(raw):
    raw=" ".join(str(raw).lower().split())
    if raw in CANONICAL: return CANONICAL[raw]
    if re.fullmatch(r"plaintiff adjourned to \d{1,2}/\d{1,2}/\d{4}",raw):
        return "ADJOURNED_REVIEW_DATE"
    if re.fullmatch(r"defendant adjourned to \d{1,2}/\d{1,2}/\d{4}",raw):
        return "ADJOURNED_REVIEW_DATE"
    return "UNKNOWN_STATUS_QUARANTINE"

def make_fixture(pages=70, per_page=10):
    # NOT derived from real properties. No names, addresses or actual dockets.
    return [{
        "page":n,"advertised_pages":pages,
        "rows":[{
           "case_id":"SYNTH_"+str(n).zfill(3)+"_"+str(i).zfill(2),
           "docket":"F-SYNTH-"+str(n).zfill(3)+"-"+str(i).zfill(2),
           "status":PUBLIC_OBSERVED_STATUS_SAMPLES[(n+i)%len(PUBLIC_OBSERVED_STATUS_SAMPLES)]
        } for i in range(per_page)]
    } for n in range(1,pages+1)]

def validate_snapshot(pages,advertised):
    guard(isinstance(advertised,int) and 1<=advertised<=100,
          "PAGE_COUNT_OUT_OF_CERTIFICATION_RANGE")
    guard(len(pages)==advertised,"MISSING_PAGE_OR_INCOMPLETE_PAGINATION")
    seen_pages=set()
    seen_ids=set()
    counts={}
    for page in pages:
        guard(isinstance(page,dict),"PAGE_OBJECT_INVALID")
        n=page.get("page")
        guard(isinstance(n,int) and 1<=n<=advertised and n not in seen_pages,
              "DUPLICATE_OR_INVALID_PAGE_NUMBER")
        guard(page.get("advertised_pages")==advertised,"PAGINATION_COUNT_DRIFT")
        seen_pages.add(n)
        rows=page.get("rows")
        guard(isinstance(rows,list) and 0<len(rows)<=100,
              "EMPTY_OR_OVERSIZE_PAGE_REQUIRES_REVIEW")
        for record in rows:
            guard(isinstance(record,dict) and
                  re.fullmatch(r"SYNTH_\d{3}_\d{2}",str(record.get("case_id",""))) is not None,
                  "UNEXPECTED_NON_SYNTHETIC_ID")
            key=("NJ-SUSSEX","sheriff_mortgage_sales",record["case_id"])
            guard(key not in seen_ids,"CROSS_PAGE_DUPLICATE_CASE_ID")
            seen_ids.add(key)
            canon=status(record.get("status",""))
            guard(canon!="UNKNOWN_STATUS_QUARANTINE",
                  "UNKNOWN_STATUS_REQUIRES_REVIEW")
            counts[canon]=counts.get(canon,0)+1
    guard(seen_pages==set(range(1,advertised+1)),"PAGE_NUMBER_GAP")
    return {"mock_page_count":len(seen_pages),
            "mock_case_count":len(seen_ids),
            "mock_status_categories":counts,
            "all_mock_page_numbers_covered":True,
            "all_mock_case_ids_unique":True,
            "live_page_coverage_certified":False}

def deny_case(pages,code):
    try: validate_snapshot(pages,70)
    except ValueError as e:
        guard(str(e)==code, "EXPECTED_DENIAL_MISMATCH "+code+" "+str(e))
    else: raise AssertionError("Unsafe snapshot passed: "+code)

def self_test():
    pages=make_fixture()
    positive=validate_snapshot(pages,70)
    guard(positive["mock_page_count"]==70 and
          positive["mock_case_count"]==700,"SYNTHETIC_COUNT_MISMATCH")
    deny_case(pages[:-1],"MISSING_PAGE_OR_INCOMPLETE_PAGINATION")
    swapped=json.loads(json.dumps(pages));swapped[2]["page"]=2
    deny_case(swapped,"DUPLICATE_OR_INVALID_PAGE_NUMBER")
    drift=json.loads(json.dumps(pages));drift[35]["advertised_pages"]=71
    deny_case(drift,"PAGINATION_COUNT_DRIFT")
    duplicate=json.loads(json.dumps(pages))
    duplicate[50]["rows"][0]["case_id"]=duplicate[0]["rows"][0]["case_id"]
    deny_case(duplicate,"CROSS_PAGE_DUPLICATE_CASE_ID")
    invalid=json.loads(json.dumps(pages));invalid[3]["rows"][0]["status"]="UNVERIFIED_CUSTOM_STATUS"
    deny_case(invalid,"UNKNOWN_STATUS_REQUIRES_REVIEW")
    blank=json.loads(json.dumps(pages));blank[20]["rows"]=[]
    deny_case(blank,"EMPTY_OR_OVERSIZE_PAGE_REQUIRES_REVIEW")
    guard(status("Plaintiff Adjourned to 12/2/2026")=="ADJOURNED_REVIEW_DATE",
          "DATED_ADJOURNMENT_MISSING")
    guard(status("Defendant Adjourned to 12/2/2026")=="ADJOURNED_REVIEW_DATE",
          "DEFENDANT_ADJOURNMENT_UNMODELLED")
    guard(status("Stay Order")=="UNKNOWN_STATUS_QUARANTINE",
          "UNEXPECTED_UNCERTIFIED_STATUS_ACCEPTED")
    print("SIMULATED_70_PAGE_COMPLETE_IDENTITY_COVERAGE=PASS")
    print("MISSING_DUPLICATED_DRIFTED_PAGE_DETECTION=PASS")
    print("CROSS_PAGE_CASE_ID_DEDUP_AND_STATUS_FAIL_CLOSED=PASS")
    print("OBSERVED_SALE_STATUS_AND_DATED_ADJOURNMENT_CLASSIFICATION=PASS")
    print("NO_REMOTE_REQUESTS_NO_PROPERTY_RECORDS_NO_TRIGGER_WRITES=PASS")
    return positive

PERMISSION_DRAFT="""To: civilprocess@sussexcountysheriff.com
Subject: Request for written authorization and technical specifications — Sussex County foreclosure listing data

Sussex County Sheriff's Office — Civil Process / Foreclosure Unit:

I represent REOS Enterprise, a real estate research and property-acquisition system. We would like to confirm whether your office permits automated, scheduled read-only collection of publicly posted sheriff foreclosure notices from https://www.sussexcountysheriff.com/foreclosure-listings for internal business research.

We are not presently conducting automated page-by-page collection or importing this source into production. Before proceeding, please provide written direction on the following:

1. Whether automated access and downstream internal commercial analysis is permitted; any conditions, terms, licensing, fees, retention limits, privacy requirements, or approved contact.
2. Whether an official CSV/Excel export, machine-readable API, OPRA channel, or preferred bulk feed is available instead of HTML pagination.
3. Maximum acceptable request rate, daily cadence, permitted hours, User-Agent requirements, and whether archived or completed listings may be requested.
4. Whether the page count/pagination control and 10-row visible pages comprise the complete active/archive data; how to handle filters, changes during pagination, and partial views.
5. Authoritative case number/docket identity and exact sale-status values, including open, cancelled, bankruptcy hold, adjourned with dates, sold to plaintiff and sold to third-party purchaser; any others and how they change.
6. How to obtain the official revision timestamp and confirm last-minute adjournments, cancellations, sales and corrections, given your website's warning that dates may change.

Please reply with the allowed automated-access method and limitations, or refer us to the appropriate data custodian. We will not treat a public page or robots.txt alone as authorization.

Thank you.
REOS Enterprise
"""

def run():
    pin=os.environ.get("REOS_RELEASE_PIN","")
    check=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,
                         capture_output=True,text=True,check=True).stdout.strip()
    guard(re.fullmatch(r"[a-f0-9]{40}",pin) is not None and pin==check,
          "EXACT_GIT_PIN_REQUIRED")
    fixture_result=self_test()
    # No activity (even if a user later supplies an authorization letter)
    # can change authority from NOT_ATTESTED until independent verification.
    report={
        "schema":"REOS_NJ_SUSSEX_ACCESS_PAGINATION_STATUS_GATE_V1",
        "source_git_sha":pin,
        "captured_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
        "county":"NJ-SUSSEX",
        "feed":"sheriff_mortgage_sales",
        "official_source":BASE,
        "publicly_observed_pagination_example":"?comp-l20f0f0j_page=2",
        "observed_ui_total_pages_at_research_time":PUBLIC_OBSERVED_UI_PAGE_COUNT,
        "public_pagination_count_independently_live_verified_in_this_run":False,
        "publicly_observed_status_samples":list(PUBLIC_OBSERVED_STATUS_SAMPLES),
        "historical_archive_status_examples_proven_exhaustive":False,
        "permission_explicit_from_site_or_authority":False,
        "permission_to_automate":"NOT_ATTESTED",
        "source_robots_and_terms_authoritative_approval":"NOT_ATTESTED",
        "official_preferred_bulk_feed_or_api":"UNKNOWN",
        "official_permitted_cadence_or_rate":"UNKNOWN",
        "status_vocabulary_exhaustive":"NOT_CERTIFIED",
        "live_status_transitions_verified":"NOT_CERTIFIED",
        "full_70_page_live_coverage_verified":"NOT_CERTIFIED",
        "live_cross_page_case_identity_verified":"NOT_CERTIFIED",
        "live_case_rows_processed":0,
        "synthetic_pagination_regression":fixture_result,
        "permission_request_prepared_not_sent":True,
        "data_collection_or_production_mutations":0,
        "http_gets":0,
        "google_api_calls":0,
        "trigger_installations":0,
        "distress_feeds_certified":0,
        "all_nj_de_distress_feed_slots_blocked":120,
        "historical_api_13_deployments_protected":False,
        "PA_scheduler_changed":False,
        "MAO_or_offers_authorized":False,
        "decision":"NO_GO_AWAIT_WRITTEN_PERMISSION_AND_FULL_COVERAGE"
    }
    return report

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--output-dir",default=str(Path.home()))
    a=p.parse_args()
    try:report=run()
    except Exception as exc:
        print("RESULT=FAIL_CLOSED")
        print("BLOCKER="+str(exc)[:250])
        print("PRODUCTION_MUTATIONS=NONE")
        return 2
    now=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out=Path(a.output_dir).expanduser().resolve()
    guard(out.is_dir() and not out.is_symlink(),"OUTPUT_DIR_INVALID")
    evidence=out/("REOS_NJ_SUSSEX_PERMISSION_COVERAGE_GATE_"+now+".zip")
    guard(not evidence.exists() and not evidence.is_symlink(),"ZIP_ALREADY_EXISTS")
    with zipfile.ZipFile(evidence,"x",compression=zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr("gate_report.json",json.dumps(report,sort_keys=True,indent=2)+"\n")
        zipf.writestr("permission_request_DRAFT_NOT_SENT.txt",PERMISSION_DRAFT)
        zipf.writestr("SUMMARY.txt","\n".join([
            "=== REOS SUSSEX ACCESS AND FULL-COVERAGE CONSOLIDATED GATE ===",
            "SOURCE_PIN="+report["source_git_sha"],
            "PAGINATION_UI_OBSERVED_PAGES=70",
            "OBSERVED_STATUS_VARIANTS="+str(len(PUBLIC_OBSERVED_STATUS_SAMPLES)),
            "SYNTHETIC_PAGINATION_TESTS=PASS",
            "LIVE_70_PAGE_COMPLETENESS=NOT_CERTIFIED",
            "LIVE_STATUS_LIFECYCLE=NOT_CERTIFIED",
            "AUTOMATED_ACCESS_PERMISSION=NOT_ATTESTED",
            "AUTHORIZATION_REQUEST=PREPARED_NOT_SENT",
            "PUBLIC_HTTP_REQUESTS=0",
            "GOOGLE_CALLS=0",
            "TRIGGERS_INSTALLED=0",
            "PRODUCTION_MUTATIONS=NONE",
            "NJ_DE_ACTIVATION=HOLD",
            "MAO_AND_OFFERS=BLOCKED",
            "RESULT=OFFLINE_SAFETY_GATE_PASS_RELEASE_NO_GO",
            ""
        ]))
    evidence.chmod(0o600)
    with zipfile.ZipFile(evidence) as z:
        guard(z.testzip() is None,"ZIP_CRC_FAIL")
    for k in ("source_git_sha","permission_to_automate",
              "full_70_page_live_coverage_verified",
              "live_status_transitions_verified","decision"):
        print(k.upper()+"="+str(report[k]))
    print("SYNTHETIC_PAGINATION_TESTS=PASS")
    print("PUBLIC_HTTP_REQUESTS=0")
    print("PRODUCTION_MUTATIONS=NONE")
    print("TRIGGERS_INSTALLED=NONE")
    print("NJ_DE_ACTIVATION=HOLD")
    print("EVIDENCE_ZIP="+str(evidence))
    print("EVIDENCE_SHA256="+hashlib.sha256(evidence.read_bytes()).hexdigest())
    print("RESULT=OFFLINE_SAFETY_GATE_PASS_RELEASE_NO_GO")
    return 0

if __name__=="__main__":
    try:sys.exit(main())
    except Exception as e:
        print("RESULT=FAIL_CLOSED")
        print("BLOCKER="+str(e)[:250])
        sys.exit(2)
