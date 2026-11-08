#!/usr/bin/env python3
"""REOS NJ/DE Philly-parity: one-command OFFLINE scope and source readiness audit.

No credential files, Google APIs, production triggers, endpoints, Sheets,
Github pushes, ScriptApp or connector execution. Read the pinned Git tree,
run the existing isolated Node VM scheduler tests, verify 24 county configs,
audit 120 5-feed slots, and write one local reproducible evidence ZIP.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FEEDS = ("code_violations", "vacant_properties", "sheriff_tax_sales",
         "sheriff_mortgage_sales", "probate")
EXPECTED = {"NJ": 21, "DE": 3}
CURRENT_TYPES = {"NJ": ("property_assessment",), "DE": ("parcel_inventory",)}
CATALOG = ROOT / "config/nj-de-philadelphia-parity-feed-catalog.json"
SCHEDULER = ROOT / "src/NJDECountyParityScheduler.gs"
NODE_TEST = ROOT / "scripts/test-nj-de-pa-parity-scheduler.mjs"


class ContractError(Exception):
    pass


def require(condition, reason):
    if not condition:
        raise ContractError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def load_json(file):
    require(file.is_file() and not file.is_symlink(), "Required file missing or symlink: " + str(file))
    return json.loads(file.read_text(encoding="utf-8"))


def csv_content(rows, headers):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=headers, extrasaction="ignore",
                            lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def county_slug(name):
    return re.sub(r"[^A-Z0-9]+", "-", name.upper().strip()).strip("-")


def source_name(state, county):
    tokens = re.split(r"[^a-zA-Z0-9]+", county)
    return state + "".join(x[:1].upper() + x[1:].lower() for x in tokens) + "CountyConnector.gs"


def collect():
    catalog = load_json(CATALOG)
    require(catalog.get("production_authority") == "NONE", "Catalog must deny production authority")
    require(catalog.get("schemaVersion") == "REOS_NJ_DE_PA_PARITY_DISCOVERY_V1",
            "Wrong catalog version")
    require(tuple(catalog.get("states", {}).keys()) == ("NJ", "DE"),
            "Unexpected catalog states")
    scheduler = SCHEDULER.read_text(encoding="utf-8")
    require("function REOS_NJ_COUNTY_SCHEDULED_RUN()" in scheduler and
            "function REOS_DE_COUNTY_SCHEDULED_RUN()" in scheduler,
            "State-specific scheduler handlers missing")
    require("NJ_DE_TRIGGER_INSTALLATION_NOT_AUTHORIZED" in scheduler and
            "HOLD_NJ_DE_ACTIVATION_NOT_AUTHORIZED" in scheduler,
            "Mandatory trigger/live stop absent")
    require("REOS_NJ_COUNTY_PARITY_SHADOW_CHECKPOINT_V1" in scheduler and
            "REOS_DE_COUNTY_PARITY_SHADOW_CHECKPOINT_V1" in scheduler,
            "State checkpoint isolation absent")

    rows = []
    county_rows = []
    failures = []
    for state in ("NJ", "DE"):
        names = load_json(ROOT / "config/states" / (state + ".json")).get("counties", [])
        require(len(names) == EXPECTED[state], "Unexpected county count in state registry: " + state)
        required_counties = [state + "-" + county_slug(name) for name in names]
        state_doc = catalog["states"][state]
        require(state_doc["counties"] == required_counties,
                "Catalog county order differs from registry: " + state)
        require(state_doc.get("feedOrder") == list(FEEDS),
                "Feed order differs from Philadelphia: " + state)
        require(state_doc.get("feedSlots") == EXPECTED[state] * 5,
                "Slot count differs from county x 5: " + state)

        expected_slots = {(county, feed) for county in required_counties for feed in FEEDS}
        found_slots = set()
        for slot in state_doc.get("slots", []):
            require(isinstance(slot, dict), "Invalid slot object: " + state)
            key = (slot.get("countyId"), slot.get("feed"))
            require(key in expected_slots and key not in found_slots,
                    "Extra, duplicate, or invalid feed slot: " + repr(key))
            found_slots.add(key)
            require(slot.get("status") == "HOLD_NO_CERTIFIED_DISTRESS_SOURCE",
                    "Unapproved feed appears active: " + repr(key))
            require(slot.get("approved_endpoint") is None and
                    slot.get("inventory_sink") is None and
                    slot.get("distress_sink") is None,
                    "Unapproved feed has production source or destination: " + repr(key))
            for flag in ("state_scope_approved", "source_schema_certified",
                         "idempotency_certified", "activation_authorized"):
                require(slot.get(flag) is False,
                        "An unapproved feed flag has become true: " + repr(key) + " " + flag)
            rows.append({
                "state": state, "county_id": key[0], "feed": key[1],
                "certification": "MISSING", "source_identity": "NOT_ATTESTED",
                "approved_endpoint": "NONE", "destination": "NONE",
                "live_approved": "NO", "candidate_official_reference": "DISCOVERY_ONLY"
            })
        require(found_slots == expected_slots,
                "Missing source slots: " + state + " expected " +
                str(len(expected_slots)) + " got " + str(len(found_slots)))

        for county, name in zip(required_counties, names):
            conf_file = ROOT / "config/county-connectors" / (county + ".json")
            conf = load_json(conf_file)
            require(conf.get("id") == county and conf.get("state") == state,
                    "Connector state/identity mismatch: " + county)
            observed = tuple(sorted(conf.get("datasets", {}).keys()))
            require(observed == CURRENT_TYPES[state], "Unexpected connector dataset type: " +
                    county + " = " + repr(observed))
            generated = ROOT / "src/connectors/generated" / source_name(state, name)
            require(generated.is_file() and not generated.is_symlink(),
                    "Generated connector source missing: " + str(generated))
            generated_text = generated.read_text(encoding="utf-8")
            require("state: \"" + state + "\"" in generated_text and
                    "id: \"" + county + "\"" in generated_text,
                    "Generated connector source identity mismatch: " + county)
            county_rows.append({
                "state": state, "county_id": county,
                "existing_dataset": observed[0],
                "existing_data_class": "INVENTORY_NOT_DISTRESS",
                "repository_manifest_enabled": str(conf.get("enabled")).lower(),
                "source_certification": "NOT_ATTESTED",
                "generated_file": str(generated.relative_to(ROOT)),
                "generator_sha256": sha(generated.read_bytes()),
                "distress_feeds_certified": 0
            })
    require(len(rows) == 120 and len(county_rows) == 24,
            "Expected exactly 120 blocked feeds and 24 county connectors")
    refs = catalog.get("official_discovery_refs", [])
    require(len(refs) > 0 and all(r.get("pipeline_cleared") is False for r in refs),
            "Discovery URLs must remain uncertified")
    for r in refs:
        require((r.get("countyId"), r.get("feed")) in {
            (row["county_id"], row["feed"]) for row in rows
        }, "Unscoped official discovery reference")

    rev = subprocess.run(["git", "rev-parse", "--verify", "HEAD"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    require(re.fullmatch(r"[0-9a-f]{40}", rev) is not None, "Bad git source identity")
    required_pin = __import__("os").environ.get("REOS_RELEASE_PIN", "").strip()
    require(re.fullmatch(r"[0-9a-f]{40}", required_pin) is not None
            and rev == required_pin, "Refusing unpinned or changed Git revision")

    node = subprocess.run(["node", str(NODE_TEST)], cwd=ROOT,
                          capture_output=True, text=True, timeout=45, check=False)
    require(node.returncode == 0 and
            "OFFLINE_PHILADELPHIA_PARITY_TESTS=ALL_PASS" in node.stdout,
            "Offline Node VM scheduler regression FAIL:\n" +
            (node.stdout + node.stderr)[-1800:])

    summary = {
        "source_git_sha": rev,
        "schema": "REOS_NJ_DE_PA_PARITY_OFFLINE_ACCEPTANCE_V1",
        "production_authority": "NONE",
        "nj_counties": 21, "de_counties": 3,
        "nj_feed_slots": 105, "de_feed_slots": 15,
        "feed_order": list(FEEDS),
        "configured_nj_connector_class": "PROPERTY_ASSESSMENT_ONLY",
        "configured_de_connector_class": "PARCEL_INVENTORY_ONLY",
        "distress_feed_slots_certified": 0,
        "distress_feed_slots_blocked": 120,
        "source_discovery_references_count": len(refs),
        "official_source_urls_live_verified": False,
        "node_vm_offline_tests": "PASS",
        "pa_scheduler_source_changed": False,
        "pa_checkpoint_read_or_written": False,
        "remote_google_requests": 0,
        "apps_script_runs": 0,
        "trigger_installations": 0,
        "new_script_versions": 0,
        "deployment_mutations": 0,
        "crm_or_sheet_writes": 0,
        "credentials_accessed_or_modified": False,
        "result": "SHADOW_BUILD_READY_SOURCE_CERTIFICATION_HOLD",
        "activation": "NO_GO",
        "maos_and_offers": "BLOCKED"
    }

    refs_rows = [{
        "county_id": r.get("countyId"),
        "feed": r.get("feed"),
        "url": r.get("url"),
        "source_status": r.get("verification"),
        "endpoint_certified": "NO",
        "ingestion_enabled": "NO"
    } for r in refs]
    return summary, rows, county_rows, refs_rows, node.stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=str(Path.home()),
                        help="Only local output destination. Default HOME.")
    args = parser.parse_args()
    try:
        summary, slots, counties, refs, tests = collect()
    except Exception as ex:
        print("=== REOS NJ DE CONSOLIDATED PARITY READ-ONLY GATE ===")
        print("RESULT=FAIL_CLOSED")
        print("BLOCKER=" + str(ex).replace("\n", " ")[:500])
        print("PRODUCTION_MUTATIONS=NONE")
        return 2

    when = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = Path(args.output_dir).expanduser().resolve()
    if not dest.is_dir() or dest.is_symlink():
        print("RESULT=FAIL_CLOSED; OUTPUT_DIR_INVALID")
        return 2
    out = dest / ("REOS_NJ_DE_PA_PARITY_READONLY_" + when + ".zip")
    if out.exists() or out.is_symlink():
        print("RESULT=FAIL_CLOSED; OUTPUT_FILE_EXISTS")
        return 2

    output = {
        "SUMMARY.txt": (
            "=== REOS NJ DE PHILADELPHIA PARITY OFFLINE ACCEPTANCE ===\n"
            + "SOURCE_SHA=" + summary["source_git_sha"] + "\n"
            + "NJ_COUNTIES=21\nDE_COUNTIES=3\n"
            + "NJ_FEED_SLOTS=105\nDE_FEED_SLOTS=15\n"
            + "CERTIFIED_DISTRESS_SLOTS=0\nBLOCKED_DISTRESS_SLOTS=120\n"
            + "OFFLINE_REGRESSION=PASS\n"
            + "TRIGGERS_INSTALLED=NONE\n"
            + "GOOGLE_REMOTE_CALLS=NONE\n"
            + "PRODUCTION_MUTATIONS=NONE\n"
            + "RESULT=SHADOW_BUILD_READY_SOURCE_CERTIFICATION_HOLD\n"
            + "NJ_DE_ACTIVATION=NO_GO\nMAO_AND_OFFERS=BLOCKED\n"),
        "acceptance.json": json.dumps(summary, sort_keys=True, indent=2) + "\n",
        "feed_certification_backlog.csv": csv_content(slots,
            ["state", "county_id", "feed", "certification", "source_identity",
             "approved_endpoint", "destination", "live_approved", "candidate_official_reference"]),
        "existing_connectors.csv": csv_content(counties,
            ["state", "county_id", "existing_dataset", "existing_data_class",
             "repository_manifest_enabled", "source_certification", "generated_file",
             "generator_sha256", "distress_feeds_certified"]),
        "discovery_references_uncertified.csv": csv_content(refs,
            ["county_id", "feed", "url", "source_status", "endpoint_certified", "ingestion_enabled"]),
        "offline_node_tests.txt": tests
    }
    with zipfile.ZipFile(out, "x", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(output):
            zf.writestr(name, output[name])
    out.chmod(0o600)
    with zipfile.ZipFile(out, "r") as zf:
        require(zf.testzip() is None, "Evidence ZIP CRC failure")
    print(output["SUMMARY.txt"], end="")
    print("EVIDENCE_ZIP=" + str(out))
    print("EVIDENCE_SHA256=" + sha(out.read_bytes()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
