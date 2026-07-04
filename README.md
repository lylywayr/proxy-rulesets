# proxy-rulesets

Open proxy rule sets for `Surge`, `Loon`, `Egern`, and `Clash`.

This repository is intentionally smaller than `blackmatrix7/ios_rule_script`. The goal here is:

- keep a manageable set of high-value categories
- keep every upstream source explicit
- fetch, merge, deduplicate, and publish automatically
- generate client-specific output instead of forcing one format everywhere

## Supported clients

- `Surge`: plain text ruleset
- `Loon`: plain text ruleset
- `Clash` / `mihomo`: `rule-providers` classical YAML
- `Egern`: native YAML rule set

## Repository layout

- [`sources/catalog.json`](sources/catalog.json): rule categories and upstream source URLs
- [`scripts/build_rules.py`](scripts/build_rules.py): fetch, parse, deduplicate, and render outputs
- [`dist`](dist): generated rule files
- [`.github/workflows/update-rules.yml`](.github/workflows/update-rules.yml): scheduled automation

## Built-in categories

- `Apple`
- `GitHub`
- `Google`
- `Microsoft`
- `OpenAI`
- `Telegram`
- `China`

## Output paths

- `dist/surge/<Name>.list`
- `dist/loon/<Name>.list`
- `dist/clash/<Name>.yaml`
- `dist/egern/<Name>.yaml`
- `dist/index.json`

## Usage

### Surge

```ini
RULE-SET,https://raw.githubusercontent.com/lylywayr/proxy-rulesets/main/dist/surge/Apple.list,Proxy
```

### Loon

```ini
RULE-SET,https://raw.githubusercontent.com/lylywayr/proxy-rulesets/main/dist/loon/Apple.list,Proxy
```

### Clash / mihomo

```yaml
rule-providers:
  apple:
    type: http
    behavior: classical
    url: https://raw.githubusercontent.com/lylywayr/proxy-rulesets/main/dist/clash/Apple.yaml
    path: ./ruleset/apple.yaml
    interval: 86400

rules:
  - RULE-SET,apple,Proxy
```

### Egern

```yaml
rules:
  - rule_set:
      match: https://raw.githubusercontent.com/lylywayr/proxy-rulesets/main/dist/egern/Apple.yaml
      policy: Proxy
      update_interval: 86400
```

## Merge strategy

This repository keeps the merge logic deliberately conservative:

- remove exact duplicates
- remove `DOMAIN` entries already covered by a `DOMAIN-SUFFIX`
- remove `DOMAIN-SUFFIX` entries already covered by a shorter suffix
- collapse overlapping `IP-CIDR` and `IP-CIDR6` networks
- keep unsupported types out of client formats that cannot represent them

The generator does not try to be clever about every possible upstream syntax. It focuses on the common rule types used by these clients and records per-client omissions in `dist/index.json`.

## Source attribution

All upstream URLs are declared in [`sources/catalog.json`](sources/catalog.json). Generated metadata in `dist/index.json` preserves the source list used for each category.

## Automation

GitHub Actions rebuilds the repository every day and also supports manual triggering through `workflow_dispatch`.

## License

This repository is released under the MIT License. Upstream rule content remains subject to the licenses and terms of its original authors.
