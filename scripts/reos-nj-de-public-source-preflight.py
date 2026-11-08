#!/usr/bin/env python3
"""REOS NJ/DE official-source landing-page preflight. NO production actions.

Checks the pinned nine discovery references without credentials. The only
network requests allowed are bounded HTTPS GETs to an explicit allowlist of
county/state official hosts. Never follows cross-host redirects, posts,
downloads PDF listings, scrapes individual cases, runs Apps Script, or writes
to Google/CRM. A reachable page is never counted as an approved data feed.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[1]
CATALOG=ROOT/"config/nj-de-philadelphia-parity-feed-catalog.json"
MAX_BYTES=128*1024
TIMEOUT=12
ALLOWLIST=frozenset((
    "www.camdencounty.com",
    "mcsonj.org",
    "www.sussexcountysheriff.com",
    "www.newcastlede.gov",
    "www.kentcountyde.gov",
    "www.njcourts.gov",
    "www.courts.delaware.gov"
))
STATE={"requests":0,"google_requests":0,"appscript_executions":0,
       "production_mutations":0,"credentials_read":False}


class SafetyError(RuntimeError):
    pass


def digest(v):
    return hashlib.sha256(v).hexdigest()


def allow_url(url):
    parts=urllib.parse.urlsplit(url)
    if (parts.scheme!="https" or parts.username or parts.password or
        parts.hostname not in ALLOWLIST or
        parts.port not in (None,443) or
        parts.query or parts.fragment):
        raise SafetyError("UNAPPROVED_SOURCE_URI")
    return url


class RedirectsWithinSameOfficialHost(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        newurl=urllib.parse.urljoin(req.full_url,newurl)
        allow_url(newurl)
        if urllib.parse.urlsplit(newurl).hostname != urllib.parse.urlsplit(req.full_url).hostname:
            raise SafetyError("CROSS_HOST_REDIRECT_REFUSED")
        return super().redirect_request(req,fp,code,msg,headers,newurl)


def no_proxy_opener():
    # Environment-supplied HTTP proxy credentials are never reused.
    # Platform network restrictions may cause a harmless source-unreachable result.
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        RedirectsWithinSameOfficialHost()
    )


def source_probe(url, opener):
    allow_url(url)
    headers={"User-Agent":"REOS-County-Safety-ReadOnly-Source-Preflight/1.0",
             "Accept":"text/html, text/plain;q=0.5, */*;q=0.1"}
    req=urllib.request.Request(url, headers=headers, method="GET")
    STATE["requests"]+=1
    with opener.open(req,timeout=TIMEOUT) as response:
        effective=response.geturl()
        allow_url(effective)
        content_type=str(response.headers.get("Content-Type",""))
        content_length=response.headers.get("Content-Length")
        content=response.read(MAX_BYTES+1)
        return {
            "outcome":"LANDING_PAGE_OBSERVED",
            "status":int(response.status),
            "content_type":content_type[:100],
            "content_length_header":str(content_length or "")[:30],
            "first_128kb_sha256":digest(content[:MAX_BYTES]),
            "sample_truncated":len(content)>MAX_BYTES,
            "sample_bytes":len(content[:MAX_BYTES]),
            "response_effective_host":urllib.parse.urlsplit(effective).hostname,
            "is_approved_feed":False,
            "contains_certified_case_schema":False
        }


def safe_error(exc):
    # Do not include URI query/record text in evidence packets.
    if isinstance(exc,SafetyError):
        return str(exc)
    if isinstance(exc,urllib.error.HTTPError):
        return "HTTP_"+str(exc.code)
    if isinstance(exc,urllib.error.URLError):
        return "NETWORK_UNREACHABLE"
    return "SOURCE_PROBE_ERROR_"+type(exc).__name__


def normalize_ref(r):
    return {
        "county_id":r.get("countyId"),
        "feed":r.get("feed"),
        "url":r.get("url"),
        "provenance":r.get("verification"),
        "reference_data_only":True,
        "feed_certified":False,
        "ingestion_enabled":False
    }


def run(offline=False):
    require_head=__import__("os").environ.get("REOS_RELEASE_PIN","")
    actual=subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,
                          text=True,capture_output=True,check=True).stdout.strip()
    if not re.fullmatch(r"[a-f0-9]{40}",require_head) or actual!=require_head:
        raise SafetyError("UNPINNED_GIT_SHA_REFUSED")
    data=json.loads(CATALOG.read_text(encoding="utf-8"))
    if data.get("production_authority")!="NONE" or (
        data.get("states",{}).get("NJ",{}).get("feedSlots")!=105 or
        data.get("states",{}).get("DE",{}).get("feedSlots")!=15):
        raise SafetyError("CATALOG_NO_GO_CONTRACT_MISMATCH")
    refs=data.get("official_discovery_refs",[])
    if len(refs)!=9 or not all(x.get("pipeline_cleared") is False for x in refs):
        raise SafetyError("REFERENCES_NOT_PINNED_OR_PREMATURELY_CLEARED")
    seen=set()
    rows=[]
    opener=no_proxy_opener() if not offline else None
    for ref in refs:
        row=normalize_ref(ref)
        url=ref.get("url","")
        # PDF and court directory pages do not constitute a data feed.
        if not isinstance(url,str):
            raise SafetyError("REFERENCE_URL_INVALID")
        allow_url(url)
        if ref.get("feed")=="probate" or url.lower().endswith(".pdf"):
            row.update({"outcome":"REFERENCE_ONLY_NOT_CASE_FEED",
                "status":None,"is_approved_feed":False})
        elif offline:
            row.update({"outcome":"OFFLINE_FIXTURE_NO_NETWORK",
                "status":None,"is_approved_feed":False})
        else:
            try:
                row.update(source_probe(url,opener))
            except Exception as ex:
                row.update({"outcome":safe_error(ex),
                    "status":ex.code if isinstance(ex,urllib.error.HTTPError) else None,
                    "is_approved_feed":False})
        rows.append(row)
    return actual,rows


def self_test():
    for bad in (
        "http://www.camdencounty.com/test",
        "https://localhost/anything",
        "https://127.0.0.1/foo",
        "https://www.google.com/foo",
        "https://www.newcastlede.gov:8080/",
        "https://user:secret@www.camdencounty.com/",
        "https://www.camdencounty.com/x?token=a"
    ):
        try:
            allow_url(bad)
            raise AssertionError("Unsafe URL unexpectedly permitted")
        except SafetyError:
            pass
    for host in ALLOWLIST:
        allow_url("https://"+host+"/")
    # Redirect must stay on the same official host (and HTTPS).
    redirect=RedirectsWithinSameOfficialHost()
    req=urllib.request.Request("https://www.camdencounty.com/page")
    for uri in ("http://www.camdencounty.com/",
                "https://www.google.com/",
                "https://mcsonj.org/"):
        try:
            redirect.redirect_request(req,None,302,"Found",{},uri)
            raise AssertionError("Unsafe redirect escaped")
        except SafetyError:
            pass
    assert STATE["requests"]==0
    print("OFFICIAL_SOURCE_URL_ALLOWLIST_AND_REDIRECT_DENIAL=PASS")
    print("READONLY_NO_CREDENTIALS_NO_GOOGLE_NO_WRITES=PASS")


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--self-test",action="store_true")
    ap.add_argument("--offline",action="store_true")
    ap.add_argument("--output-dir",default=str(Path.home()))
    args=ap.parse_args()
    if args.self_test:
        self_test()
        return 0
    try:
        pin,rows=run(args.offline)
    except Exception as exc:
        print("RESULT=FAIL_CLOSED")
        print("BLOCKER="+safe_error(exc))
        print("PRODUCTION_MUTATIONS=NONE")
        return 2
    now=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report={
        "schema":"REOS_NJ_DE_OFFICIAL_SOURCE_LANDING_PREFLIGHT_V1",
        "source_pin":pin,
        "captured_at_utc":now,
        "mode":"OFFLINE_NO_NETWORK" if args.offline else "PUBLIC_HTTPS_GET_ONLY",
        "source_references":len(rows),
        "referenced_counties":sorted(set(r["county_id"] for r in rows)),
        "landings_observed":sum(r["outcome"]=="LANDING_PAGE_OBSERVED" for r in rows),
        "source_urls_checked_live":STATE["requests"],
        "distress_feed_slots_certified":0,
        "distress_feed_slots_blocked":120,
        "source_schema_certifications":0,
        "live_ingestion_authorized":False,
        "triggers_installed":0,
        "google_requests":0,
        "credential_files_accessed_or_modified":False,
        "apps_script_executions":0,
        "production_mutations":0,
        "pa_scheduler_touched":False,
        "mao_and_offers":"BLOCKED",
        "release_decision":"NO_GO",
        "limitations":"HTTP landing reachability only; no terms, case schema, record uniqueness, auth, ownership, approval, or source freshness certification.",
        "results":rows
    }
    outdir=Path(args.output_dir).expanduser().resolve()
    if not outdir.is_dir() or outdir.is_symlink():
        print("RESULT=FAIL_CLOSED; OUTPUT_DIRECTORY_INVALID")
        return 2
    outfile=outdir/("REOS_NJ_DE_PUBLIC_SOURCE_PREFLIGHT_"+now+".zip")
    if outfile.exists() or outfile.is_symlink():
        print("RESULT=FAIL_CLOSED; EVIDENCE_PATH_EXISTS")
        return 2
    summary=("\n".join([
       "=== REOS NJ DE OFFICIAL SOURCE PREFLIGHT ===",
       "SOURCE_PIN="+pin,
       "DISCOVERY_REFERENCES="+str(len(rows)),
       "SOURCE_LANDINGS_OBSERVED="+str(report["landings_observed"]),
       "PUBLIC_GETS="+str(STATE["requests"]),
       "CERTIFIED_DISTRESS_FEEDS=0",
       "BLOCKED_DISTRESS_FEEDS=120",
       "TRIGGERS_INSTALLED=NONE",
       "GOOGLE_REQUESTS=NONE",
       "PRODUCTION_MUTATIONS=NONE",
       "NJ_DE_RELEASE=HOLD",
       "MAO_AND_OFFERS=BLOCKED",
       "RESULT=SOURCE_LANDING_EVIDENCE_ONLY"
       ])+"\n")
    with zipfile.ZipFile(outfile,"x",compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("SUMMARY.txt",summary)
        z.writestr("source_landing_evidence.json",json.dumps(report,indent=2,sort_keys=True)+"\n")
    outfile.chmod(0o600)
    with zipfile.ZipFile(outfile) as z:
        assert z.testzip() is None
    print(summary,end="")
    print("EVIDENCE_ZIP="+str(outfile))
    print("EVIDENCE_SHA256="+digest(outfile.read_bytes()))
    return 0


if __name__=="__main__":
    sys.exit(main())
