#!/usr/bin/env python3
"""Single-GET, read-only Sussex foreclosure page schema evidence.

Only GET https://www.sussexcountysheriff.com/foreclosure-listings;
no cross-host redirects, no Google, no raw cases/names/addresses stored.
No claims that public-page reachability implies source authority.
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
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[1]
PARSER=ROOT/"scripts/reos-nj-sussex-sheriff-schema-offline.py"
URL="https://www.sussexcountysheriff.com/foreclosure-listings"
MAX=1_500_000
spec=importlib.util.spec_from_file_location("reos_sussex_offline_parser",PARSER)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class SafeOnly(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        url=urllib.parse.urljoin(req.full_url,newurl)
        if url!=URL: raise RuntimeError("SUSSEX_REDIRECT_REJECTED")
        return super().redirect_request(req,fp,code,msg,headers,newurl)


def check_pin():
    actual=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,
                          check=True,text=True,capture_output=True).stdout.strip()
    expected=os.getenv("REOS_RELEASE_PIN","")
    if not re.fullmatch(r"[a-f0-9]{40}",expected) or expected!=actual:
        raise RuntimeError("PINNED_SHA_REFUSED")
    return actual


def fetch_one():
    opener=urllib.request.build_opener(
        urllib.request.ProxyHandler({}),SafeOnly())
    req=urllib.request.Request(URL,method="GET",headers={
        "User-Agent":"REOS-Sheriff-Official-ReadOnly-Schema-Evidence/1.0",
        "Accept":"text/html"
    })
    with opener.open(req,timeout=15) as r:
        if r.geturl()!=URL or r.status!=200:
            raise RuntimeError("SUSSEX_HTTP_OR_EFFECTIVE_URL_INVALID")
        if "text/html" not in (r.headers.get("Content-Type") or "").lower():
            raise RuntimeError("SUSSEX_HTML_CONTENT_TYPE_REQUIRED")
        data=r.read(MAX+1)
        if len(data)>MAX: raise RuntimeError("SUSSEX_HTML_TOO_LARGE")
        return data


def safe_error(error):
    if isinstance(error,urllib.error.HTTPError):
        return "HTTP_"+str(error.code)
    if isinstance(error,urllib.error.URLError):
        return "PUBLIC_SOURCE_UNREACHABLE"
    if isinstance(error,mod.SchemaError):
        return "SOURCE_SCHEMA_"+str(error)
    if isinstance(error,RuntimeError):
        return str(error)
    return "UNEXPECTED_"+type(error).__name__


def main():
    now=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    pin=""
    report={
        "schema":"REOS_NJ_SUSSEX_SHERIFF_READONLY_SCHEMA_V1",
        "captured_at_utc":now,
        "source_url":URL,
        "county_id":"NJ-SUSSEX",
        "feed":"sheriff_mortgage_sales",
        "http_requests_attempted":0,
        "google_requests":0,
        "apps_script_executions":0,
        "source_html_exported":False,
        "case_rows_exported":0,
        "names_or_addresses_exported":False,
        "credential_files_accessed_or_modified":False,
        "production_mutations":0,
        "triggers_installed":0,
        "source_access_attested":False,
        "distress_feeds_certified":0,
        "NJ_DE_LIVE_INGESTION":"BLOCKED",
        "mao_offers":"BLOCKED",
        "release_decision":"NO_GO",
        "source_schema_status":"UNVERIFIED"
    }
    try:
        pin=check_pin()
        report["source_pin"]=pin
        mod.self_test()
        report["offline_schema_tests"]="PASS"
        report["http_requests_attempted"]=1
        html_bytes=fetch_one()
        report["http_status"]=200
        report["html_bytes_observed"]=len(html_bytes)
        report["html_sha256"]=hashlib.sha256(html_bytes).hexdigest()
        # No HTML body, rows, or debtor names are persisted as artifacts.
        txt=html_bytes.decode("utf-8","replace")
        try:
            sample=mod.schema_probe(txt)
            report["source_schema_status"]="STRUCTURE_PARSABLE_UNCERTIFIED"
            report["schema_metrics"]={
                "required_semantic_columns":sample["required_semantic_columns"],
                "rows_schema_validated":sample["rows_schema_validated"],
                "dedup_keys_unique":sample["dedup_keys_unique"],
                "date_range_first":sample["date_range_first"],
                "date_range_last":sample["date_range_last"],
                "status_categories":sample["status_categories"]
            }
        except mod.SchemaError as e:
            report["source_schema_status"]="DOM_OR_SCHEMA_REVIEW_REQUIRED"
            report["parser_reason"]=safe_error(e)
            report["schema_hint_flags"]={
                k:bool(re.search(re.escape(k),txt,re.IGNORECASE))
                for k in ("Case Number","Docket Number","Scheduled Sale Date","Complete Status")
            }
        del html_bytes,txt
    except Exception as e:
        report["preflight_error"]=safe_error(e)
    report["source_pin"]=pin
    output=Path.home()/("REOS_NJ_SUSSEX_SCHEMA_READONLY_"+now+".zip")
    with zipfile.ZipFile(output,"x",compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("source_schema_report.json",json.dumps(report,indent=2,sort_keys=True)+"\n")
    output.chmod(0o600)
    with zipfile.ZipFile(output) as z:
        if z.testzip() is not None: raise RuntimeError("ZIP_CRC_FAIL")
    print("=== REOS NJ SUSSEX SCHEMA READ-ONLY ===")
    for k in ("source_pin","offline_schema_tests","http_status",
              "http_requests_attempted","source_schema_status",
              "html_bytes_observed","parser_reason","preflight_error"):
        if k in report:print(k.upper()+"="+str(report[k]))
    print("DISTRESS_FEEDS_CERTIFIED=0")
    print("PRODUCTION_MUTATIONS=NONE")
    print("TRIGGERS_INSTALLED=NONE")
    print("NJ_DE_ACTIVATION=HOLD")
    print("MAO_AND_OFFERS=BLOCKED")
    print("EVIDENCE_ZIP="+str(output))
    print("EVIDENCE_SHA256="+hashlib.sha256(output.read_bytes()).hexdigest())
    print("RESULT=READ_ONLY_SCHEMA_EVIDENCE_NO_GO")
    return 2 if report.get("preflight_error") else 0

if __name__=="__main__":
    sys.exit(main())
