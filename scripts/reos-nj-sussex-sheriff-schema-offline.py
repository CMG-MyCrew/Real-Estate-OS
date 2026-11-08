#!/usr/bin/env python3
"""REOS NJ Sussex sheriff-sale schema probe; synthetic/offline only.

Pure HTML parsing for a locally provided input (no network). Retains no actual
names/address in outputs, never touches Google/ScriptApp, has no live adapter
or persistence path. This is NOT authorization to import records.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
from html.parser import HTMLParser
import html
import json
from pathlib import Path
import re
import sys

REQUIRED=("case_id","docket_number","sale_date","address","city","status")
HEADER_ALIASES={
    "case number advertisement":"case_id",
    "case number":"case_id",
    "sheriff number":"case_id",
    "docket number":"docket_number",
    "scheduled sale date":"sale_date",
    "sale date":"sale_date",
    "address":"address",
    "city":"city",
    "complete status":"status",
    "sale status":"status",
    "status":"status",
}
SYNTHETIC_HTML="""<!doctype html>
<html><body>
<table><tr><th>Unrelated</th></tr><tr><td>unrelated</td></tr></table>
<table id="foreclosure">
<tr><th>Case Number / Advertisement</th><th>Docket Number</th><th>Scheduled Sale Date</th>
<th>Plaintiff</th><th>Defendant</th><th>Address</th><th>City</th><th>Complete Status</th></tr>
<tr><td>26000001</td><td>F-000001-26</td><td>12/02/2026</td>
<td>TEST BANK A</td><td>TEST PARTY A</td><td>100 EXAMPLE ST</td><td>NEWTON</td><td>Open</td></tr>
<tr><td>26000002</td><td>F-000002-26</td><td>01/06/2027</td>
<td>TEST BANK B</td><td>TEST PARTY B</td><td>200 EXAMPLE RD</td><td>ANDOVER</td><td>Adjourned</td></tr>
</table></body></html>"""

class SchemaError(ValueError):
    pass

def require(ok,code):
    if not ok: raise SchemaError(code)

def norm_header(raw):
    raw=html.unescape(raw or "").strip().lower()
    raw=re.sub(r"[^a-z0-9]+"," ",raw).strip()
    return raw

class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables=[]
        self.level=0
        self.rows=None
        self.row=None
        self.cell=None
        self.cell_type=None

    def handle_starttag(self,tag,attrs):
        if tag=="table":
            if self.level==0:
                self.rows=[]
            self.level+=1
        elif self.level==1 and tag=="tr":
            self.row=[]
        elif self.level==1 and tag in ("td","th") and self.row is not None:
            self.cell=[]
            self.cell_type=tag

    def handle_data(self,data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self,tag):
        if tag in ("td","th") and self.cell is not None:
            if self.row is not None:
                self.row.append(" ".join(" ".join(self.cell).split()))
            self.cell=None
            self.cell_type=None
        elif tag=="tr" and self.level==1 and self.row is not None:
            if self.row: self.rows.append(self.row)
            self.row=None
        elif tag=="table" and self.level:
            self.level-=1
            if self.level==0:
                self.tables.append(self.rows or [])
                self.rows=None

def schema_probe(text):
    require(isinstance(text,str) and len(text)<5_000_000, "HTML_TOO_LARGE_OR_INVALID")
    parser=Tables()
    parser.feed(text)
    eligible=[]
    for table in parser.tables:
        if not table: continue
        header=[HEADER_ALIASES.get(norm_header(x)) for x in table[0]]
        present=[x for x in header if x is not None]
        if all(r in present for r in REQUIRED):
            require(len(present)==len(set(present)),"DUPLICATE_SEMANTIC_COLUMNS")
            eligible.append((header,table[1:]))
    require(len(eligible)==1,"MISSING_OR_AMBIGUOUS_SHERIFF_TABLE")
    columns,rows=eligible[0]
    require(0<len(rows)<=500, "ROW_COUNT_OUT_OF_SAFE_RANGE")
    digests=[]
    dates=[]
    status_counts={}
    for row_index,row in enumerate(rows):
        require(len(row)==len(columns),"ROW_WIDTH_MISMATCH")
        record={key:row[i] for i,key in enumerate(columns) if key is not None}
        case=record["case_id"].strip()
        docket=record["docket_number"].strip()
        addr=record["address"].strip()
        city=record["city"].strip()
        sale=record["sale_date"].strip()
        status=record["status"].strip()
        require(bool(re.fullmatch(r"[A-Za-z0-9-]{4,40}",case)),
                "INVALID_CASE_ID")
        require(bool(re.fullmatch(r"[A-Za-z0-9-]{5,40}",docket)),
                "INVALID_DOCKET")
        require(len(addr)>=5 and len(city)>=2 and len(status)>=2 and
                len(status)<=60,"MISSING_ADDRESS_CITY_OR_STATUS")
        try:
            parsed=dt.datetime.strptime(sale,"%m/%d/%Y").date()
            require(parsed.year>=2000 and parsed.year<=2100,"SALE_DATE_OUT_OF_RANGE")
        except ValueError as ex:
            raise SchemaError("INVALID_SALE_DATE") from ex
        # Stable scope-specific fingerprint, no raw case or defendant exported.
        digest=hashlib.sha256(
            ("NJ|SUSSEX|sheriff_mortgage_sales|"+case).encode()
        ).hexdigest()
        require(digest not in digests,"DUPLICATE_CASE_ID")
        digests.append(digest)
        dates.append(parsed.isoformat())
        bucket=status.lower()
        status_counts[bucket]=status_counts.get(bucket,0)+1
    return {
       "county_id":"NJ-SUSSEX",
       "feed":"sheriff_mortgage_sales",
       "schema_only":True,
       "synthetic_or_user_provided_snapshot":True,
       "source_live_queried":False,
       "records_written":0,
       "records_sent_to_google":0,
       "case_records_exported":0,
       "required_semantic_columns":list(REQUIRED),
       "rows_schema_validated":len(rows),
       "dedup_keys_unique":len(set(digests))==len(digests),
       "date_range_first":min(dates),
       "date_range_last":max(dates),
       "status_categories":sorted(status_counts.keys()),
       "data_freshness_attested":False,
       "source_access_approved":False,
       "live_ingestion_authorized":False,
       "distress_feeds_certified":0,
       "release_decision":"HOLD"
    }

def self_test():
    good=schema_probe(SYNTHETIC_HTML)
    assert good["rows_schema_validated"]==2
    assert good["dedup_keys_unique"]
    assert good["status_categories"]==["adjourned","open"]
    print("SUSSEX_SYNTHETIC_CASE_SCHEMA_VALIDATION=PASS")
    tests=[
        (SYNTHETIC_HTML.replace("<th>Complete Status</th>","<th>UNKNOWN</th>"),
         "MISSING_OR_AMBIGUOUS_SHERIFF_TABLE"),
        (SYNTHETIC_HTML.replace("26000002","26000001"),
         "DUPLICATE_CASE_ID"),
        (SYNTHETIC_HTML.replace("01/06/2027","01/06/NOT_A_YEAR"),
         "INVALID_SALE_DATE"),
        (SYNTHETIC_HTML.replace("200 EXAMPLE RD",""),
         "MISSING_ADDRESS_CITY_OR_STATUS"),
        (SYNTHETIC_HTML.replace("F-000002-26",""),
         "INVALID_DOCKET"),
    ]
    for fixture,reason in tests:
        try:
            schema_probe(fixture)
            raise AssertionError("Fixture passed unexpectedly: "+reason)
        except SchemaError as ex:
            assert str(ex)==reason,(reason,str(ex))
    print("SUSSEX_BAD_FIELDS_DATES_DUPLICATES_FAIL_CLOSED=PASS")
    assert good["records_written"]==0 and not good["live_ingestion_authorized"]
    assert good["case_records_exported"]==0 and good["distress_feeds_certified"]==0
    print("NO_LIVE_RECORD_EXPORT_NO_OFFER_AUTHORITY=PASS")
    return good

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--snapshot",type=Path,default=None,
                    help="Optional user-provided local HTML snapshot, never fetched")
    args=ap.parse_args()
    self_test()
    if args.snapshot:
        p=args.snapshot.expanduser().resolve()
        require(p.is_file() and p.stat().st_size<5_000_000 and
                p.suffix.lower() in (".html",".htm"),"LOCAL_HTML_SNAPSHOT_REQUIRED")
        receipt=schema_probe(p.read_text(encoding="utf-8",errors="replace"))
    else:
        receipt=schema_probe(SYNTHETIC_HTML)
    # No raw foreclosure records, addresses, names, or docket numbers printed.
    print("=== REOS NJ SUSSEX SHERIFF SCHEMA OFFLINE ===")
    for key in ("county_id","feed","rows_schema_validated","dedup_keys_unique",
                "source_live_queried","records_written","case_records_exported",
                "distress_feeds_certified","release_decision"):
        print(str(key).upper()+"="+str(receipt[key]))
    print("PRODUCTION_MUTATIONS=NONE")
    return 0

if __name__=="__main__":
    try: sys.exit(main())
    except (SchemaError,AssertionError) as exc:
        print("RESULT=FAIL_CLOSED")
        print("BLOCKER="+str(exc))
        print("PRODUCTION_MUTATIONS=NONE")
        sys.exit(2)
