#!/usr/bin/env python3
from __future__ import annotations

import ipaddress
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "sources" / "catalog.json"
DIST = ROOT / "dist"

RULE_ORDER = [
    "DOMAIN",
    "DOMAIN-SUFFIX",
    "DOMAIN-KEYWORD",
    "DOMAIN-REGEX",
    "USER-AGENT",
    "PROCESS-NAME",
    "IP-ASN",
    "IP-CIDR",
    "IP-CIDR6",
    "URL-REGEX",
]

TYPE_ALIASES = {
    "HOST": "DOMAIN",
    "HOST-SUFFIX": "DOMAIN-SUFFIX",
    "HOST-KEYWORD": "DOMAIN-KEYWORD",
    "IP6-CIDR": "IP-CIDR6",
}

SURGE_EGERN_SUPPORTED = {
    "DOMAIN",
    "DOMAIN-SUFFIX",
    "DOMAIN-KEYWORD",
    "DOMAIN-REGEX",
    "IP-CIDR",
    "IP-CIDR6",
    "IP-ASN",
    "URL-REGEX",
    "USER-AGENT",
}

CLASH_SUPPORTED = SURGE_EGERN_SUPPORTED | {"PROCESS-NAME"}
SURGE_LOON_SUPPORTED = CLASH_SUPPORTED
EGERN_SUPPORTED = {
    "DOMAIN",
    "DOMAIN-SUFFIX",
    "DOMAIN-KEYWORD",
    "DOMAIN-REGEX",
    "IP-CIDR",
    "IP-CIDR6",
    "IP-ASN",
    "URL-REGEX",
    "USER-AGENT",
}

EGERN_FIELD_MAP = {
    "DOMAIN": "domain_set",
    "DOMAIN-SUFFIX": "domain_suffix_set",
    "DOMAIN-KEYWORD": "domain_keyword_set",
    "DOMAIN-REGEX": "domain_regex_set",
    "IP-CIDR": "ip_cidr_set",
    "IP-CIDR6": "ip_cidr6_set",
    "IP-ASN": "asn_set",
    "URL-REGEX": "url_regex_set",
    "USER-AGENT": "user_agent_set",
}

COMMENT_PREFIXES = ("#", ";", "//")
HTTP_HEADERS = {
    "User-Agent": "proxy-rulesets/1.0 (+https://github.com/lylywayr/proxy-rulesets)",
    "Accept": "*/*",
}


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers=HTTP_HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def normalize_rule_type(rule_type: str) -> str:
    return TYPE_ALIASES.get(rule_type.strip().upper(), rule_type.strip().upper())


def split_rule_line(line: str) -> tuple[str, str] | None:
    parts = [part.strip() for part in line.split(",")]
    if len(parts) < 2:
        return None
    rule_type = normalize_rule_type(parts[0])
    value = parts[1]
    if not rule_type or not value:
        return None
    return rule_type, value


def extract_rule_lines(text: str) -> list[str]:
    lines: list[str] = []
    in_payload = False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("payload:"):
            in_payload = True
            continue
        if in_payload:
            if line.startswith("- "):
                lines.append(line[2:].strip().strip("\"'"))
            elif re.match(r"^[A-Za-z0-9_-]+:", line):
                in_payload = False
        if not in_payload:
            if line.startswith(COMMENT_PREFIXES):
                continue
            lines.append(line.strip().strip("\"'"))
    return lines


def collect_rules(text: str) -> dict[str, set[str]]:
    buckets: dict[str, set[str]] = defaultdict(set)
    for line in extract_rule_lines(text):
        if not line or line.startswith(COMMENT_PREFIXES):
            continue
        parsed = split_rule_line(line)
        if parsed is None:
            continue
        rule_type, value = parsed
        if rule_type in {"OR", "AND", "NOT", "RULE-SET", "GEOIP", "DST-PORT", "SRC-PORT"}:
            continue
        buckets[rule_type].add(value)
    return buckets


def collapse_ip_networks(values: set[str], version: int) -> list[str]:
    networks = []
    for value in values:
        try:
            network = ipaddress.ip_network(value, strict=False)
        except ValueError:
            continue
        if network.version == version:
            networks.append(network)
    return [str(network) for network in ipaddress.collapse_addresses(networks)]


def domain_is_covered(domain: str, suffixes: set[str]) -> bool:
    domain = domain.lower()
    for suffix in suffixes:
        suffix = suffix.lower()
        if domain == suffix or domain.endswith("." + suffix):
            return True
    return False


def prune_suffixes(values: set[str]) -> list[str]:
    ordered = sorted({value.lower() for value in values}, key=lambda item: (item.count("."), len(item)))
    kept: list[str] = []
    for value in ordered:
        if any(value == parent or value.endswith("." + parent) for parent in kept):
            continue
        kept.append(value)
    return kept


def deduplicate_rules(buckets: dict[str, set[str]]) -> dict[str, list[str]]:
    deduped: dict[str, list[str]] = {}

    suffixes = prune_suffixes(buckets.get("DOMAIN-SUFFIX", set()))
    deduped["DOMAIN-SUFFIX"] = suffixes

    domains = sorted(
        value.lower()
        for value in buckets.get("DOMAIN", set())
        if not domain_is_covered(value, set(suffixes))
    )
    deduped["DOMAIN"] = sorted(set(domains))

    for rule_type in ("DOMAIN-KEYWORD", "DOMAIN-REGEX", "PROCESS-NAME", "USER-AGENT", "IP-ASN", "URL-REGEX"):
        deduped[rule_type] = sorted(buckets.get(rule_type, set()))

    deduped["IP-CIDR"] = collapse_ip_networks(buckets.get("IP-CIDR", set()), version=4)
    deduped["IP-CIDR6"] = collapse_ip_networks(buckets.get("IP-CIDR6", set()), version=6)
    return deduped


def format_rule_line(rule_type: str, value: str, no_resolve_for_ip: bool) -> str:
    if no_resolve_for_ip and rule_type in {"IP-CIDR", "IP-CIDR6"}:
        return f"{rule_type},{value},no-resolve"
    return f"{rule_type},{value}"


def render_plain_rules(name: str, rules: dict[str, list[str]], sources: list[dict[str, str]], supported: set[str]) -> tuple[str, dict[str, int]]:
    omitted: dict[str, int] = {}
    lines = [
        f"# NAME: {name}",
        "# REPO: https://github.com/lylywayr/proxy-rulesets",
        f"# UPDATED: {datetime.now(timezone.utc).isoformat()}",
        f"# SOURCES: {len(sources)}",
    ]
    body: list[str] = []
    total = 0
    for rule_type in RULE_ORDER:
        values = rules.get(rule_type, [])
        if not values:
            continue
        if rule_type not in supported:
            omitted[rule_type] = len(values)
            continue
        lines.append(f"# {rule_type}: {len(values)}")
        for value in values:
            body.append(format_rule_line(rule_type, value, no_resolve_for_ip=True))
        total += len(values)
    lines.append(f"# TOTAL: {total}")
    lines.append("")
    return "\n".join(lines + body) + "\n", omitted


def render_clash_yaml(name: str, rules: dict[str, list[str]]) -> tuple[str, dict[str, int]]:
    omitted: dict[str, int] = {}
    payload: list[str] = []
    total = 0
    for rule_type in RULE_ORDER:
        values = rules.get(rule_type, [])
        if not values:
            continue
        if rule_type not in CLASH_SUPPORTED:
            omitted[rule_type] = len(values)
            continue
        for value in values:
            payload.append(f"  - {format_rule_line(rule_type, value, no_resolve_for_ip=False)}")
        total += len(values)
    header = [
        f"# NAME: {name}",
        "# REPO: https://github.com/lylywayr/proxy-rulesets",
        f"# UPDATED: {datetime.now(timezone.utc).isoformat()}",
        f"# TOTAL: {total}",
        "payload:",
    ]
    return "\n".join(header + payload) + "\n", omitted


def render_egern_yaml(name: str, rules: dict[str, list[str]]) -> tuple[str, dict[str, int]]:
    omitted: dict[str, int] = {}
    lines = [
        f"# NAME: {name}",
        "# REPO: https://github.com/lylywayr/proxy-rulesets",
        f"# UPDATED: {datetime.now(timezone.utc).isoformat()}",
        "no_resolve: true",
    ]
    total = 0
    for rule_type in RULE_ORDER:
        values = rules.get(rule_type, [])
        if not values:
            continue
        if rule_type not in EGERN_SUPPORTED:
            omitted[rule_type] = len(values)
            continue
        field_name = EGERN_FIELD_MAP[rule_type]
        lines.append(f"{field_name}:")
        for value in values:
            quoted = json.dumps(value, ensure_ascii=False)
            lines.append(f"  - {quoted}")
        total += len(values)
    lines.append(f"# TOTAL: {total}")
    return "\n".join(lines) + "\n", omitted


def ensure_directories() -> None:
    for name in ("surge", "loon", "clash", "egern"):
        (DIST / name).mkdir(parents=True, exist_ok=True)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def main() -> int:
    ensure_directories()
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "repository": "lylywayr/proxy-rulesets",
        "categories": [],
    }

    for category in catalog["categories"]:
        merged: dict[str, set[str]] = defaultdict(set)
        fetched_sources: list[dict[str, str]] = []
        print(f"[build] {category['name']}")
        for source in category["sources"]:
            try:
                text = fetch_text(source["url"])
            except urllib.error.URLError as exc:
                print(f"  ! failed to fetch {source['url']}: {exc}", file=sys.stderr)
                continue
            fetched_sources.append(source)
            parsed = collect_rules(text)
            for rule_type, values in parsed.items():
                merged[rule_type].update(values)

        rules = deduplicate_rules(merged)
        surge_text, surge_omitted = render_plain_rules(category["name"], rules, fetched_sources, SURGE_LOON_SUPPORTED)
        loon_text, loon_omitted = render_plain_rules(category["name"], rules, fetched_sources, SURGE_LOON_SUPPORTED)
        clash_text, clash_omitted = render_clash_yaml(category["name"], rules)
        egern_text, egern_omitted = render_egern_yaml(category["name"], rules)

        write_text(DIST / "surge" / f"{category['name']}.list", surge_text)
        write_text(DIST / "loon" / f"{category['name']}.list", loon_text)
        write_text(DIST / "clash" / f"{category['name']}.yaml", clash_text)
        write_text(DIST / "egern" / f"{category['name']}.yaml", egern_text)

        counts = {rule_type: len(values) for rule_type, values in rules.items() if values}
        manifest["categories"].append(
            {
                "name": category["name"],
                "description": category["description"],
                "sources": fetched_sources,
                "counts": counts,
                "omitted": {
                    "surge": surge_omitted,
                    "loon": loon_omitted,
                    "clash": clash_omitted,
                    "egern": egern_omitted,
                },
            }
        )

    write_text(DIST / "index.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
