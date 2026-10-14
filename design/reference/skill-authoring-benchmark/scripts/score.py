#!/usr/bin/env python3
"""Recompute outcome metrics from saved, stateless consumer responses."""

import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def grade(response, expected):
    text = response.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        value = json.loads(text)
        if not isinstance(value, dict):
            raise ValueError("response is not an object")
    except (ValueError, TypeError) as error:
        return {"pass": False, "parse_error": str(error),
                "fields": {key: False for key in expected}}
    fields = {}
    for key, wanted in expected.items():
        actual = value.get(key)
        if isinstance(wanted, list):
            fields[key] = (isinstance(actual, list)
                           and all(isinstance(item, str) for item in actual)
                           and sorted(actual) == sorted(wanted))
        else:
            fields[key] = (key in value and type(actual) is type(wanted)
                           and actual == wanted)
    return {"pass": all(fields.values()), "parse_error": None,
            "fields": fields, "parsed": value}


def summarize(rows, cases):
    expected = {case["id"]: case for case in cases}
    by_arm = {}
    seen = set()
    for row in rows:
        key = (row["arm"], row["case_id"], row["rep"])
        if key in seen:
            raise ValueError("duplicate trial: " + repr(key))
        seen.add(key)
        case = expected[row["case_id"]]
        result = grade(row["response"], case["expected"])
        if row.get("grade", {}).get("pass") != result["pass"]:
            raise ValueError("saved grade disagrees with recomputation: " + repr(key))
        arm = by_arm.setdefault(row["arm"], {
            "passed": 0, "total": 0, "parse_failures": 0,
            "fields_passed": 0, "fields_total": 0,
            "subjects": {}, "categories": {}, "cases": {}, "failed_trials": []})
        arm["passed"] += int(result["pass"])
        arm["total"] += 1
        arm["parse_failures"] += int(result["parse_error"] is not None)
        arm["fields_passed"] += sum(result["fields"].values())
        arm["fields_total"] += len(result["fields"])
        for container, label in [("subjects", row["subject"]),
                                 ("categories", case["category"]),
                                 ("cases", row["case_id"])]:
            bucket = arm[container].setdefault(label, {"passed": 0, "total": 0})
            bucket["passed"] += int(result["pass"])
            bucket["total"] += 1
        if not result["pass"]:
            arm["failed_trials"].append({"case_id": row["case_id"], "rep": row["rep"],
                                         "failed_fields": [k for k, v in result["fields"].items() if not v]})
    for arm in by_arm.values():
        arm["all_five_case_passes"] = sum(v["passed"] == 5 and v["total"] == 5
                                            for v in arm["cases"].values())
        arm["case_count"] = len(arm["cases"])
    return by_arm


def check_frozen_artifacts():
    manifest = json.loads((ROOT / "results/artifact-manifest.json").read_text())
    mismatches = []
    for item in manifest["files"]:
        path = ROOT / item["path"]
        actual = hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
        if actual != item["sha256"]:
            mismatches.append(item["path"])
    if mismatches:
        raise ValueError("frozen artifacts changed: " + ", ".join(mismatches))
    return len(manifest["files"])


def main():
    cases = json.loads((ROOT / "inputs/heldout-cases.json").read_text())
    rows = json.loads((ROOT / "results/holdout-responses.json").read_text())
    summary = summarize(rows, cases)
    expected_arms = {"harness-flow", "superpowers", "mattpocock", "omc", "ecc",
                     "unaided", "no-skill", "raw-procedure"}
    if set(summary) != expected_arms:
        raise ValueError("missing or unexpected comparison arms")
    for arm, result in summary.items():
        if result["total"] != 50 or result["case_count"] != 10:
            raise ValueError("incomplete trials for " + arm)
        if any(bucket["total"] != 5 for bucket in result["cases"].values()):
            raise ValueError("incomplete repetitions for " + arm)
    print(json.dumps({"trials": len(rows), "frozen_files_checked": check_frozen_artifacts(),
                      "arms": summary}, indent=2))


if __name__ == "__main__":
    main()
