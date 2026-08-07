#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate_uat.py - deterministic UAT checker for LLM-generated structured JSON output.

WHAT THIS IS FOR
    Everything a script can decide, a script must decide. Reserve model-assisted
    judgement for claims that genuinely require reading. This tool takes the
    captured evidence files from a dev-server run and mechanically checks the
    output against the input that was actually given to the model.

    It cannot tell you whether a summary is *good*. It can tell you that a total
    does not reconcile, that an entity name appears nowhere in the source, that a
    field the PRD never authorised is being returned, and that two runs of the
    same input disagree. Those are the findings that get argued about least.

EVIDENCE FORMAT (one JSON file per model call, written by the dev server)
    {
      "run_id":            "run_2026-08-07_0012",
      "timestamp":         "2026-08-07T09:14:22Z",
      "model":             "opus",
      "model_version":     "claude-opus-5",
      "params":            {"temperature": 0.0, "max_tokens": 4096},
      "input_id":          "INP-001",           # same value => same logical input
      "system_prompt":     "...",
      "user_prompt":       "...",
      "retrieved_context": ["chunk 1 text", "chunk 2 text"],
      "source_documents":  {"contract.pdf": "full extracted text ..."},
      "raw_response":      "{...}",
      "output":            { ... parsed structured output ... }
      "insufficient_information": false          # optional, mirrors output flag
    }

    Only run_id, model, input_id, output and at least one source of grounding text
    (retrieved_context or source_documents) are mandatory. Missing grounding text
    is itself reported as a Critical finding: an output you cannot trace is an
    output you cannot sign off.

USAGE
    python validate_uat.py --init                       # write a starter config
    python validate_uat.py --make-samples ./evidence    # synthetic evidence, incl. planted defects
    python validate_uat.py --evidence ./evidence --config uat_config.json --out ./uat_results

OUTPUTS (all importable into UAT_Hallucination_Review_Pack.xlsx)
    findings.csv     -> paste into 03_ClaimLog / 04_DefectLog
    stability.csv    -> paste into 06_ModelStability
    summary.json     -> headline numbers for 07_Scorecard
    Exit code 0 = no Critical findings, 1 = Critical findings present, 2 = tool error.

DEPENDENCIES
    Python 3.8+, standard library only.
"""

import argparse
import csv
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime

TOOL_VERSION = "1.0"

# ---------------------------------------------------------------------------
# Starter configuration
# ---------------------------------------------------------------------------

STARTER_CONFIG = {
    "_comment": "Edit this to describe YOUR application's output. Every rule you add here is "
                "a judgement call removed from the human reviewer.",

    "required_evidence_fields": [
        "run_id", "model", "input_id", "output"
    ],

    "output_schema": {
        "_comment": "field -> {type, required, enum, nullable}. type: string|number|integer|"
                    "boolean|array|object|any. Fields NOT listed here are reported as "
                    "UNAUTHORIZED_FIELD (invented scope).",
        "counterparty_legal_name": {"type": "string", "required": True, "nullable": True},
        "governing_law":           {"type": "string", "required": True, "nullable": True},
        "effective_date":          {"type": "string", "required": True, "nullable": True,
                                    "format": "date"},
        "total_contract_value":    {"type": "number", "required": True, "nullable": True},
        "payment_schedule":        {"type": "array",  "required": True, "nullable": True},
        "executive_summary":       {"type": "string", "required": True, "nullable": True},
        "insufficient_information": {"type": "boolean", "required": True, "nullable": False}
    },

    "allow_unlisted_fields": False,

    "grounding": {
        "_comment": "Fields whose values must appear verbatim in the source text. This is the "
                    "single highest-yield automated hallucination check.",
        "verbatim_string_fields": ["counterparty_legal_name", "governing_law"],
        "verbatim_number_fields": [],
        "normalise": True,
        "min_source_chars": 50
    },

    "reconciliation": [
        {
            "name": "contract_value_reconciles_to_schedule",
            "total_field": "total_contract_value",
            "components_path": "payment_schedule[].amount",
            "tolerance": 0.01,
            "severity": "Critical"
        }
    ],

    "cross_field_rules": [
        {
            "_comment": "Prefer field-level flags over one global insufficient_information flag. "
                        "A global flag forces an all-or-nothing null list and produces noise.",
            "name": "insufficient_information_implies_null_governing_law",
            "if_field": "insufficient_information",
            "equals": True,
            "then_fields_must_be_null": ["governing_law"],
            "severity": "Critical"
        },
        {
            "name": "null_governing_law_not_asserted_in_summary",
            "if_field": "governing_law",
            "equals": None,
            "then_text_field_must_not_match": {
                "field": "executive_summary",
                "patterns": ["governed by", "governing law", "jurisdiction of"]
            },
            "severity": "Critical"
        }
    ],

    "numeric_ranges": {
        "total_contract_value": {"min": 0, "max": 1000000000}
    },

    "date_fields": {
        "effective_date": {"min": "1990-01-01", "max": "2050-12-31"}
    },

    "placeholder_patterns": [
        r"\bTBD\b", r"\bTODO\b", r"\bXXX+\b", r"\bN/?A\b",
        r"\[insert[^\]]*\]", r"\[[A-Z_ ]{3,}\]", r"lorem ipsum",
        r"\bplaceholder\b", r"<[a-z_]+>", r"\bFIXME\b",
        r"as an AI language model", r"I don't have access to",
        r"\bexample\.com\b", r"\bJohn Doe\b"
    ],

    "hedging_patterns": {
        "_comment": "Confident language on fields flagged insufficient is a defect. "
                    "Also catches the opposite: hedging where the source is explicit.",
        "patterns": [r"\blikely\b", r"\bpresumably\b", r"\bit appears that\b",
                     r"\btypically\b", r"\bgenerally\b", r"\bshould be\b",
                     r"\bis probably\b", r"\bwe can assume\b", r"\bin most cases\b"],
        "apply_to_fields": ["executive_summary"],
        "severity": "Major"
    },

    "stability": {
        "compare_fields": ["counterparty_legal_name", "governing_law",
                           "effective_date", "total_contract_value",
                           "insufficient_information"],
        "min_runs": 2,
        "pass_threshold": 0.98
    },

    "severity_gate": {
        "fail_on": ["Critical"]
    }
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalise(text):
    """Fold case, unicode, punctuation and whitespace so that 'Meridian  Logistics
    Pte. Ltd.' matches 'meridian logistics pte ltd'. Deliberately aggressive: a
    false NEGATIVE here means a human wastes time; a false POSITIVE means a
    hallucination gets through."""
    if text is None:
        return ""
    t = unicodedata.normalize("NFKD", str(text))
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = t.lower()
    t = t.replace("’", "'").replace("‘", "'")
    t = t.replace("“", '"').replace("”", '"')
    t = t.replace("–", "-").replace("—", "-")
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def collect_source_text(ev):
    """Everything the model was actually given. Nothing else counts as a source."""
    parts = []
    rc = ev.get("retrieved_context")
    if isinstance(rc, list):
        parts.extend(str(x) for x in rc)
    elif isinstance(rc, str):
        parts.append(rc)
    sd = ev.get("source_documents")
    if isinstance(sd, dict):
        parts.extend(str(v) for v in sd.values())
    elif isinstance(sd, list):
        parts.extend(str(x) for x in sd)
    elif isinstance(sd, str):
        parts.append(sd)
    # The user prompt often carries the input inline.
    if ev.get("user_prompt"):
        parts.append(str(ev["user_prompt"]))
    return "\n\n".join(parts)


def resolve_path(obj, path):
    """Resolve 'payment_schedule[].amount' -> list of values. Supports one [] level."""
    if "[]" in path:
        head, tail = path.split("[]", 1)
        head = head.strip(".")
        tail = tail.strip(".")
        seq = obj.get(head) if isinstance(obj, dict) else None
        if not isinstance(seq, list):
            return None
        out = []
        for item in seq:
            if tail:
                if isinstance(item, dict) and tail in item:
                    out.append(item[tail])
                else:
                    return None
            else:
                out.append(item)
        return out
    cur = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def type_ok(value, expected):
    if expected == "any":
        return True
    if expected == "string":
        return isinstance(value, str)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    return True


def walk_strings(value, prefix=""):
    """Yield (path, string) for every string in a nested structure."""
    if isinstance(value, str):
        yield prefix, value
    elif isinstance(value, dict):
        for k, v in value.items():
            for r in walk_strings(v, "%s.%s" % (prefix, k) if prefix else k):
                yield r
    elif isinstance(value, list):
        for i, v in enumerate(value):
            for r in walk_strings(v, "%s[%d]" % (prefix, i)):
                yield r


# ---------------------------------------------------------------------------
# Finding record
# ---------------------------------------------------------------------------

class Findings(object):
    COLUMNS = ["finding_id", "check", "run_id", "input_id", "model", "field",
               "severity", "halluc_type", "verdict", "observed", "expected", "detail"]

    def __init__(self):
        self.rows = []
        self._n = 0

    def add(self, check, ev, field, severity, verdict, observed="", expected="",
            detail="", halluc_type="-"):
        self._n += 1
        self.rows.append({
            "finding_id": "AUTO-%04d" % self._n,
            "check": check,
            "run_id": ev.get("run_id", "?") if isinstance(ev, dict) else str(ev),
            "input_id": ev.get("input_id", "?") if isinstance(ev, dict) else "",
            "model": ev.get("model", "?") if isinstance(ev, dict) else "",
            "field": field,
            "severity": severity,
            "halluc_type": halluc_type,
            "verdict": verdict,
            "observed": str(observed)[:500],
            "expected": str(expected)[:500],
            "detail": str(detail)[:800],
        })

    def count(self, severity):
        return sum(1 for r in self.rows if r["severity"] == severity)


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

def check_envelope(ev, cfg, F, filename):
    ok = True
    for field in cfg.get("required_evidence_fields", []):
        if field not in ev or ev[field] in (None, ""):
            F.add("EVIDENCE_INCOMPLETE", ev, field, "Critical", "FAIL",
                  observed="missing",
                  detail="Evidence file %s lacks '%s'. Output that cannot be traced to its "
                         "input cannot be reviewed." % (filename, field))
            ok = False
    src = collect_source_text(ev)
    min_chars = cfg.get("grounding", {}).get("min_source_chars", 50)
    if len(src.strip()) < min_chars:
        F.add("NO_GROUNDING_TEXT", ev, "-", "Critical", "FAIL",
              observed="%d chars" % len(src.strip()), expected=">= %d chars" % min_chars,
              detail="No retrieved_context / source_documents / user_prompt captured. Every claim in "
                     "this run is unverifiable by definition. Fix the capture layer and re-run.")
        ok = False
    return ok


def check_schema(ev, cfg, F):
    out = ev.get("output")
    if not isinstance(out, dict):
        F.add("OUTPUT_NOT_OBJECT", ev, "output", "Critical", "FAIL",
              observed=type(out).__name__, expected="object",
              detail="Structured output expected but the parsed output is not a JSON object.")
        return
    schema = {k: v for k, v in cfg.get("output_schema", {}).items() if not k.startswith("_")}

    for field, spec in schema.items():
        present = field in out
        if spec.get("required") and not present:
            F.add("MISSING_REQUIRED_FIELD", ev, field, "Critical", "FAIL",
                  observed="absent", expected="present", halluc_type="H5",
                  detail="Required output field absent.")
            continue
        if not present:
            continue
        val = out[field]
        if val is None:
            if not spec.get("nullable", True):
                F.add("NULL_NOT_ALLOWED", ev, field, "Major", "FAIL",
                      observed="null", expected="non-null")
            continue
        if not type_ok(val, spec.get("type", "any")):
            F.add("TYPE_MISMATCH", ev, field, "Major", "FAIL",
                  observed=type(val).__name__, expected=spec.get("type"))
        if "enum" in spec and val not in spec["enum"]:
            F.add("ENUM_VIOLATION", ev, field, "Major", "FAIL",
                  observed=val, expected="one of %s" % spec["enum"])

    if not cfg.get("allow_unlisted_fields", False):
        for field in out:
            if field not in schema:
                F.add("UNAUTHORIZED_FIELD", ev, field, "Major", "FAIL",
                      observed=field, expected="field declared in output_schema",
                      detail="Field returned by the application but not authorised by the schema "
                             "derived from the PRD. Trace it on 02_ReverseTrace before accepting it.")


def check_placeholders(ev, cfg, F):
    pats = [re.compile(p, re.I) for p in cfg.get("placeholder_patterns", [])]
    out = ev.get("output")
    if not isinstance(out, dict):
        return
    for path, text in walk_strings(out):
        for p in pats:
            m = p.search(text)
            if m:
                F.add("PLACEHOLDER_TEXT", ev, path, "Major", "FAIL",
                      observed=m.group(0), expected="real content",
                      detail="Placeholder / template residue reached the output.")
                break


def check_hedging(ev, cfg, F):
    hp = cfg.get("hedging_patterns", {})
    pats = [re.compile(p, re.I) for p in hp.get("patterns", [])]
    fields = hp.get("apply_to_fields", [])
    sev = hp.get("severity", "Minor")
    out = ev.get("output")
    if not isinstance(out, dict) or not pats:
        return
    for field in fields:
        text = out.get(field)
        if not isinstance(text, str):
            continue
        hits = sorted({p.search(text).group(0) for p in pats if p.search(text)})
        if hits:
            F.add("HEDGED_LANGUAGE", ev, field, sev, "REVIEW",
                  observed=", ".join(hits), halluc_type="H2",
                  detail="Hedging language usually marks an inference the source does not support. "
                         "Route each instance to manual claim review rather than accepting it.")


def check_grounding(ev, cfg, F):
    g = cfg.get("grounding", {})
    out = ev.get("output")
    if not isinstance(out, dict):
        return
    src_raw = collect_source_text(ev)
    src = normalise(src_raw) if g.get("normalise", True) else src_raw

    for field in g.get("verbatim_string_fields", []):
        val = out.get(field)
        if not isinstance(val, str) or not val.strip():
            continue
        needle = normalise(val) if g.get("normalise", True) else val
        if needle and needle not in src:
            F.add("UNGROUNDED_STRING", ev, field, "Critical", "FAIL",
                  observed=val, expected="verbatim occurrence in source text",
                  halluc_type="H1",
                  detail="Value does not appear anywhere in the input or retrieved context. "
                         "Fabrication unless the reviewer can produce a source quote.")

    for field in g.get("verbatim_number_fields", []):
        val = out.get(field)
        if not isinstance(val, (int, float)) or isinstance(val, bool):
            continue
        variants = _number_variants(val)
        if not any(v in src_raw.replace(",", "") or v in src_raw for v in variants):
            F.add("UNGROUNDED_NUMBER", ev, field, "Critical", "FAIL",
                  observed=val, expected="figure present in source (or derivable via a reconciliation rule)",
                  halluc_type="H3",
                  detail="Number appears nowhere in the source. If it is meant to be derived, "
                         "declare a reconciliation rule so it is checked rather than trusted.")


def _number_variants(val):
    out = set()
    if float(val).is_integer():
        i = int(val)
        out.add(str(i))
        out.add("{:,}".format(i))
    out.add(str(val))
    out.add("{:.2f}".format(float(val)))
    out.add("{:,.2f}".format(float(val)))
    return out


def check_reconciliation(ev, cfg, F):
    out = ev.get("output")
    if not isinstance(out, dict):
        return
    for rule in cfg.get("reconciliation", []):
        total = resolve_path(out, rule["total_field"])
        comps = resolve_path(out, rule["components_path"])
        if total is None or comps is None:
            continue
        try:
            total_f = float(total)
            comps_f = [float(c) for c in comps]
        except (TypeError, ValueError):
            F.add("RECONCILE_UNPARSEABLE", ev, rule["total_field"], "Major", "FAIL",
                  observed=repr(total)[:100], detail="Rule %s: non-numeric values." % rule["name"])
            continue
        s = sum(comps_f)
        tol = float(rule.get("tolerance", 0.01))
        if abs(total_f - s) > tol:
            F.add("RECONCILIATION_FAIL", ev, rule["total_field"],
                  rule.get("severity", "Critical"), "FAIL",
                  observed=total_f, expected=s, halluc_type="H3",
                  detail="Rule %s: stated total differs from the sum of its components by %s. "
                         "Components: %s" % (rule["name"], round(total_f - s, 6), comps_f))


def check_cross_field(ev, cfg, F):
    out = ev.get("output")
    if not isinstance(out, dict):
        return
    for rule in cfg.get("cross_field_rules", []):
        trigger_field = rule.get("if_field")
        if trigger_field not in out:
            continue

        # Trigger form 1: field equals a value. Form 2: field does NOT equal a value.
        if "not_equals" in rule:
            if out.get(trigger_field) == rule["not_equals"]:
                continue
            F.add("CROSS_FIELD_VIOLATION", ev, trigger_field,
                  rule.get("severity", "Major"), "FAIL",
                  observed=out.get(trigger_field),
                  expected="== %r" % rule["not_equals"], halluc_type="H3",
                  detail="Rule %s. %s" % (rule["name"], rule.get("note", "")))
            continue
        elif "equals" in rule:
            if out.get(trigger_field) != rule["equals"]:
                continue
        else:
            continue

        # Consequent 3: a numeric field must sit inside a band whenever the trigger fires.
        # This is how a prompt-only threshold guardrail becomes a mechanical assertion.
        nm = rule.get("then_numeric_must_satisfy")
        if nm:
            nf = nm.get("field")
            nv = out.get(nf)
            if isinstance(nv, (int, float)) and not isinstance(nv, bool):
                bad = (("min" in nm and nv < nm["min"]) or
                       ("max" in nm and nv > nm["max"]))
                if bad:
                    bound = ">= %s" % nm["min"] if "min" in nm else "<= %s" % nm["max"]
                    F.add("THRESHOLD_VIOLATION", ev, nf,
                          rule.get("severity", "Critical"), "FAIL",
                          observed="%s=%s while %s=%r" % (nf, nv, trigger_field,
                                                          rule.get("equals")),
                          expected="%s %s" % (nf, bound), halluc_type="H6",
                          detail="Rule %s: the model returned a verdict its own metrics do not "
                                 "support. %s" % (rule["name"], rule.get("note", "")))

        for f in rule.get("then_fields_must_be_null", []):
            if out.get(f) is not None:
                F.add("CROSS_FIELD_VIOLATION", ev, f, rule.get("severity", "Major"), "FAIL",
                      observed=out.get(f), expected="null", halluc_type="H1",
                      detail="Rule %s: %s == %r requires %s to be null. The model produced a value "
                             "where it had declared it lacked the information." %
                             (rule["name"], trigger_field, rule.get("equals"), f))

        tm = rule.get("then_text_field_must_not_match")
        if tm:
            text = out.get(tm["field"])
            if isinstance(text, str):
                for pat in tm.get("patterns", []):
                    m = re.search(pat, text, re.I)
                    if m:
                        F.add("ASSERTION_ON_NULL_FIELD", ev, tm["field"],
                              rule.get("severity", "Major"), "FAIL",
                              observed=m.group(0), expected="no assertion about %s" % trigger_field,
                              halluc_type="H6",
                              detail="Rule %s: %s is null, yet the narrative asserts it. "
                                     "Structured null + confident prose is the most damaging "
                                     "failure mode because only the prose is read." %
                                     (rule["name"], trigger_field))
                        break


def check_ranges_and_dates(ev, cfg, F):
    out = ev.get("output")
    if not isinstance(out, dict):
        return
    for field, spec in cfg.get("numeric_ranges", {}).items():
        val = out.get(field)
        if not isinstance(val, (int, float)) or isinstance(val, bool):
            continue
        if "min" in spec and val < spec["min"]:
            F.add("NUMERIC_RANGE", ev, field, "Major", "FAIL", observed=val,
                  expected=">= %s" % spec["min"])
        if "max" in spec and val > spec["max"]:
            F.add("NUMERIC_RANGE", ev, field, "Major", "FAIL", observed=val,
                  expected="<= %s" % spec["max"])

    for field, spec in cfg.get("date_fields", {}).items():
        val = out.get(field)
        if not isinstance(val, str) or not val.strip():
            continue
        parsed = None
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d %B %Y", "%B %d, %Y", "%Y-%m-%dT%H:%M:%SZ"):
            try:
                parsed = datetime.strptime(val.strip(), fmt)
                break
            except ValueError:
                continue
        if parsed is None:
            F.add("DATE_UNPARSEABLE", ev, field, "Major", "FAIL", observed=val,
                  expected="ISO-8601 date")
            continue
        for bound, op in (("min", "<"), ("max", ">")):
            if bound in spec:
                b = datetime.strptime(spec[bound], "%Y-%m-%d")
                if (op == "<" and parsed < b) or (op == ">" and parsed > b):
                    F.add("DATE_RANGE", ev, field, "Major", "FAIL", observed=val,
                          expected="%s %s" % (bound, spec[bound]))


# ---------------------------------------------------------------------------
# Stability
# ---------------------------------------------------------------------------

def analyse_stability(evidence, cfg, F):
    st = cfg.get("stability", {})
    fields = st.get("compare_fields", [])
    min_runs = st.get("min_runs", 2)
    threshold = float(st.get("pass_threshold", 0.98))

    groups = defaultdict(list)
    for ev in evidence:
        groups[(ev.get("input_id", "?"), ev.get("model", "?"))].append(ev)

    rows = []
    for (input_id, model), runs in sorted(groups.items()):
        if len(runs) < min_runs:
            rows.append({
                "input_id": input_id, "model": model, "runs": len(runs),
                "compared_fields": len(fields), "stable_fields": "",
                "unstable_fields": "", "stability_rate": "",
                "verdict": "INSUFFICIENT RUNS",
                "detail": "Need at least %d runs to assess determinism." % min_runs})
            continue

        stable, unstable, detail = 0, 0, []
        for f in fields:
            vals = [json.dumps(r.get("output", {}).get(f), sort_keys=True, default=str)
                    for r in runs]
            if len(set(vals)) == 1:
                stable += 1
            else:
                unstable += 1
                distinct = sorted(set(vals))[:4]
                detail.append("%s -> %s" % (f, " | ".join(d[:60] for d in distinct)))
                F.add("UNSTABLE_FIELD", runs[0], f, "Major", "FAIL",
                      observed="%d distinct values across %d runs" % (len(set(vals)), len(runs)),
                      expected="identical across runs", halluc_type="H2",
                      detail="Input %s on %s. A field that changes across identical inputs is a "
                             "hallucination candidate by definition. Values: %s" %
                             (input_id, model, " | ".join(d[:80] for d in distinct)))

        total = stable + unstable
        rate = (float(stable) / total) if total else 0.0
        verdict = "PASS" if rate >= threshold else ("REVIEW" if rate >= 0.95 else "FAIL")
        rows.append({
            "input_id": input_id, "model": model, "runs": len(runs),
            "compared_fields": total, "stable_fields": stable,
            "unstable_fields": unstable, "stability_rate": round(rate, 4),
            "verdict": verdict, "detail": "; ".join(detail)})
    return rows


# ---------------------------------------------------------------------------
# Load / run / report
# ---------------------------------------------------------------------------

def load_evidence(path, F):
    files = []
    if os.path.isfile(path):
        files = [path]
    else:
        for root, _dirs, names in os.walk(path):
            for n in sorted(names):
                if n.lower().endswith(".json"):
                    files.append(os.path.join(root, n))
    evidence = []
    for fp in files:
        try:
            with open(fp, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as exc:
            F.add("EVIDENCE_UNREADABLE", {"run_id": os.path.basename(fp)}, "-",
                  "Critical", "FAIL", observed=str(exc)[:200],
                  detail="Evidence file could not be parsed: %s" % fp)
            continue
        if isinstance(data, list):
            for item in data:
                item.setdefault("_file", fp)
                evidence.append(item)
        else:
            data.setdefault("_file", fp)
            evidence.append(data)
    return evidence, files


def run(args):
    with open(args.config, "r", encoding="utf-8") as fh:
        cfg = json.load(fh)

    F = Findings()
    evidence, files = load_evidence(args.evidence, F)

    if not evidence:
        print("ERROR: no evidence files found under %s" % args.evidence, file=sys.stderr)
        return 2

    for ev in evidence:
        fname = os.path.basename(ev.get("_file", "?"))
        if not check_envelope(ev, cfg, F, fname):
            continue
        check_schema(ev, cfg, F)
        check_placeholders(ev, cfg, F)
        check_hedging(ev, cfg, F)
        check_grounding(ev, cfg, F)
        check_reconciliation(ev, cfg, F)
        check_cross_field(ev, cfg, F)
        check_ranges_and_dates(ev, cfg, F)

    stability_rows = analyse_stability(evidence, cfg, F)

    os.makedirs(args.out, exist_ok=True)

    fpath = os.path.join(args.out, "findings.csv")
    with open(fpath, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=Findings.COLUMNS)
        w.writeheader()
        for row in F.rows:
            w.writerow(row)

    spath = os.path.join(args.out, "stability.csv")
    with open(spath, "w", newline="", encoding="utf-8-sig") as fh:
        cols = ["input_id", "model", "runs", "compared_fields", "stable_fields",
                "unstable_fields", "stability_rate", "verdict", "detail"]
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for row in stability_rows:
            w.writerow(row)

    by_check = defaultdict(int)
    by_model = defaultdict(int)
    for r in F.rows:
        by_check[r["check"]] += 1
        if r["severity"] in ("Critical", "Major"):
            by_model[r["model"]] += 1

    summary = {
        "tool_version": TOOL_VERSION,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "evidence_files": len(files),
        "runs_analysed": len(evidence),
        "findings_total": len(F.rows),
        "critical": F.count("Critical"),
        "major": F.count("Major"),
        "minor": F.count("Minor"),
        "by_check": dict(sorted(by_check.items(), key=lambda kv: -kv[1])),
        "material_findings_by_model": dict(by_model),
        "stability": stability_rows,
        "gate": "FAIL" if F.count("Critical") > 0 else ("PASS WITH CONDITIONS"
                if F.count("Major") > 0 else "PASS"),
    }
    with open(os.path.join(args.out, "summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)

    print("=" * 74)
    print("UAT DETERMINISTIC VALIDATION  |  validate_uat.py v%s" % TOOL_VERSION)
    print("=" * 74)
    print("Evidence files : %d" % len(files))
    print("Runs analysed  : %d" % len(evidence))
    print("Findings       : %d  (Critical %d | Major %d | Minor %d)"
          % (len(F.rows), F.count("Critical"), F.count("Major"), F.count("Minor")))
    print("-" * 74)
    for check, n in sorted(by_check.items(), key=lambda kv: -kv[1]):
        print("  %-28s %d" % (check, n))
    print("-" * 74)
    for row in stability_rows:
        print("  stability  %-10s %-8s runs=%-3s rate=%-7s %s"
              % (row["input_id"], row["model"], row["runs"],
                 row["stability_rate"], row["verdict"]))
    print("-" * 74)
    print("SCRIPT GATE    : %s" % summary["gate"])
    print("Written to     : %s" % os.path.abspath(args.out))
    print("=" * 74)
    print("NOTE: a clean script run is necessary, not sufficient. It proves nothing about")
    print("      narrative claims. Complete 03_ClaimLog by hand before sign-off.")

    return 1 if F.count("Critical") > 0 else 0


# ---------------------------------------------------------------------------
# Sample generator (smoke test with planted defects)
# ---------------------------------------------------------------------------

SOURCE_TEXT = (
    "MASTER SERVICES AGREEMENT\n"
    "This Agreement is made between Northwind Industries Limited and Meridian Logistics "
    "Pte Ltd (the 'Counterparty').\n"
    "Effective Date: 2025-04-01.\n"
    "Schedule 2 - Payments: Year 1: USD 1,500,000; Year 2: USD 1,350,000; "
    "Year 3: USD 1,300,000.\n"
    "Clause 14.2 - Renewal: either party may terminate on not less than sixty (60) days "
    "prior written notice.\n"
)
SOURCE_NO_LAW = SOURCE_TEXT  # deliberately contains no governing law clause


def make_samples(dest):
    os.makedirs(dest, exist_ok=True)

    def env(run_id, model, input_id, output, src=SOURCE_TEXT):
        return {
            "run_id": run_id, "timestamp": "2026-08-07T09:00:00Z",
            "model": model, "model_version": "claude-%s-5" % model,
            "params": {"temperature": 0.0}, "input_id": input_id,
            "system_prompt": "You extract contract metadata.",
            "user_prompt": "Analyse the following contract.\n\n" + src,
            "retrieved_context": [src], "source_documents": {"contract.pdf": src},
            "raw_response": json.dumps(output), "output": output,
        }

    clean = {
        "counterparty_legal_name": "Meridian Logistics Pte Ltd",
        "governing_law": None,
        "effective_date": "2025-04-01",
        "total_contract_value": 4150000,
        "payment_schedule": [{"year": 1, "amount": 1500000},
                             {"year": 2, "amount": 1350000},
                             {"year": 3, "amount": 1300000}],
        "executive_summary": "A three-year master services agreement with staged annual payments.",
        "insufficient_information": True,
    }

    bad_total = json.loads(json.dumps(clean))
    bad_total["total_contract_value"] = 4250000          # H3 reconciliation
    bad_total["insufficient_information"] = True

    fabricated = json.loads(json.dumps(clean))
    fabricated["governing_law"] = "State of New York"    # H1 ungrounded + cross-field
    fabricated["executive_summary"] = ("The agreement is governed by the laws of the State of "
                                       "New York and likely carries an above-market penalty.")
    fabricated["insufficient_information"] = True

    scope = json.loads(json.dumps(clean))
    scope["risk_score"] = 72                              # unauthorized field
    scope["executive_summary"] = "Summary pending - TBD."  # placeholder

    drift_a = json.loads(json.dumps(clean))
    drift_b = json.loads(json.dumps(clean))
    drift_b["effective_date"] = "2025-04-15"              # instability

    # Structured null, but the narrative asserts the fact anyway. Only the prose gets read.
    silent_assert = json.loads(json.dumps(clean))
    silent_assert["executive_summary"] = ("A three-year agreement governed by Singapore law "
                                          "with staged annual payments.")

    samples = [
        ("run_0008.json", env("run_0008", "sonnet", "INP-006", silent_assert)),
        ("run_0001.json", env("run_0001", "opus", "INP-001", clean)),
        ("run_0002.json", env("run_0002", "opus", "INP-001", drift_a)),
        ("run_0003.json", env("run_0003", "opus", "INP-001", drift_b)),
        ("run_0004.json", env("run_0004", "sonnet", "INP-002", bad_total)),
        ("run_0005.json", env("run_0005", "sonnet", "INP-003", fabricated, SOURCE_NO_LAW)),
        ("run_0006.json", env("run_0006", "opus", "INP-004", scope)),
    ]
    # A run with the capture layer misconfigured - no grounding text at all.
    broken = env("run_0007", "opus", "INP-005", clean)
    broken["retrieved_context"] = []
    broken["source_documents"] = {}
    broken["user_prompt"] = ""
    samples.append(("run_0007.json", broken))

    for name, data in samples:
        with open(os.path.join(dest, name), "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
    print("Wrote %d sample evidence files to %s" % (len(samples), os.path.abspath(dest)))
    print("Planted defects: reconciliation error, fabricated governing law, assertion on a null "
          "field, hedged language, unauthorized field, placeholder text, run instability, "
          "missing grounding text.")


def main():
    ap = argparse.ArgumentParser(description="Deterministic UAT checker for LLM structured output.")
    ap.add_argument("--evidence", help="Directory (or file) of captured evidence JSON.")
    ap.add_argument("--config", default="uat_config.json", help="Validation config JSON.")
    ap.add_argument("--out", default="uat_results", help="Output directory for CSV/JSON results.")
    ap.add_argument("--init", action="store_true", help="Write a starter uat_config.json and exit.")
    ap.add_argument("--make-samples", metavar="DIR",
                    help="Generate synthetic evidence with planted defects, then exit.")
    args = ap.parse_args()

    if args.init:
        if os.path.exists(args.config):
            print("Refusing to overwrite existing %s" % args.config, file=sys.stderr)
            return 2
        with open(args.config, "w", encoding="utf-8") as fh:
            json.dump(STARTER_CONFIG, fh, indent=2)
        print("Wrote starter config to %s - edit it to match your output schema." % args.config)
        return 0

    if args.make_samples:
        make_samples(args.make_samples)
        return 0

    if not args.evidence:
        ap.error("--evidence is required (or use --init / --make-samples)")
    if not os.path.exists(args.config):
        print("Config %s not found. Run: python validate_uat.py --init" % args.config,
              file=sys.stderr)
        return 2
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
