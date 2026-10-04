#!/usr/bin/env python3
"""SportsGang local release preflight — read-only, stdlib only.

Reports, from the committed repository and the current process only:

  1. public URL configuration the mobile build consumes
     (EXPO_PUBLIC_PRIVACY_URL / _TERMS_URL / _SUPPORT_URL, and the presence of
     EXPO_PUBLIC_API_URL): where each is read, whether committed build config
     defines it, the documented public values, whether this process has it
     set, and the app's behaviour when it is unset;
  2. app identity as committed (app.config.js, app.json, eas.json);
  3. locked dependency/build commands (package-lock.json, uv.lock);
  4. source identity (git HEAD, clean or not) and, with --export-dir, a
     manifest of a local `expo export` so a tested bundle can be identified;
  5. missing release inputs and the gates that cannot be closed locally.

It never contacts a network service, never runs EAS/Fly/Expo commands, never
reads `.env` files (it only lists their names), and prints environment values
only for the three public legal URL variables (and only when URL-shaped). As
defence in depth, any other environment value of 16+ characters that would
appear in the report is replaced with "<redacted>".

Exit status: 0 = no local inconsistency (missing inputs are reported);
1 = a definite local inconsistency; 3 = --strict and a release input is
missing; 2 = usage error.

Usage (from the repository root):
  python3 scripts/release/preflight.py [--json] [--strict] [--export-dir DIR]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

LEGAL_VARS = ("EXPO_PUBLIC_PRIVACY_URL", "EXPO_PUBLIC_TERMS_URL", "EXPO_PUBLIC_SUPPORT_URL")
API_VAR = "EXPO_PUBLIC_API_URL"
ALLOWED_VALUE_VARS = frozenset(LEGAL_VARS)
# apps/web links.ts constant -> mobile variable carrying the same public URL.
WEB_LINK_CONSTANTS = {
    "PRIVACY_URL": "EXPO_PUBLIC_PRIVACY_URL",
    "TERMS_URL": "EXPO_PUBLIC_TERMS_URL",
    "SUPPORT_URL": "EXPO_PUBLIC_SUPPORT_URL",
}
STORE_PROFILES = ("preview", "production")
DOC_ENV_FILES = (".env.example", "apps/mobile/.env.example", "apps/mobile/.env.staging.example")
METADATA_DOC = "docs/release/APP_STORE_METADATA.md"
WEB_LINKS = "apps/web/src/lib/links.ts"
LEGAL_TS = "apps/mobile/src/lib/legal.ts"
APP_CONFIG = "apps/mobile/app.config.js"
APP_JSON = "apps/mobile/app.json"
EAS_JSON = "apps/mobile/eas.json"
MOBILE_PKG = "apps/mobile/package.json"
CI_WORKFLOW = ".github/workflows/ci.yml"
EXPORT_CMD = (
    "cd apps/mobile && CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 "
    "npx --no-install expo export --platform ios --output-dir <dir>"
)
URL_SHAPE = re.compile(r"^https?://[^\s\"'<>]{1,300}$")
REDACT_MIN_LEN = 16

GATES = [
    {
        "id": "physical-device",
        "gate": "Physical iPhone (and Android) test of the release build, incl. VoiceOver",
        "status": "NOT_RUN",
        "why_not_local": "needs a device; simulators and Expo Go are not the release binary",
    },
    {
        "id": "signed-store-build",
        "gate": "Signed store build (EAS) and TestFlight / App Store submission",
        "status": "NOT_RUN",
        "why_not_local": "signing credentials are EAS-managed; a store build runs on EAS, not locally",
    },
    {
        "id": "push-provider",
        "gate": "Real Expo push service / APNs delivery to a device",
        "status": "NOT_RUN",
        "why_not_local": "needs the real provider, APNs capability and a device push token",
    },
    {
        "id": "r6-provenance",
        "gate": "Production audit-timestamp provenance (R6)",
        "status": "OPEN / NOT_RUN",
        "why_not_local": "production database, authorised operator only: "
        "docs/run-golf-v2/morning-fixes/R6_C01_DEPLOYMENT_GATE.md §3",
    },
    {
        "id": "ws-topology",
        "gate": "Deployed API is exactly one process/machine serving WebSockets",
        "status": "PENDING / NOT_RUN",
        "why_not_local": "live Fly topology, authorised operator only: "
        "docs/run-golf-v2/overnight-2026-10-05/release-preflight/TOPOLOGY_OPERATOR_CHECK.md",
    },
]


# ---------------------------------------------------------------- helpers


def _read(root: Path, rel: str) -> str | None:
    try:
        return (root / rel).read_text(encoding="utf-8")
    except (FileNotFoundError, IsADirectoryError, NotADirectoryError, UnicodeDecodeError):
        return None


def _load_json(root: Path, rel: str):
    text = _read(root, rel)
    if text is None:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return "<invalid JSON>"


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _file_digest(root: Path, rel: str) -> str | None:
    p = root / rel
    return _sha256_file(p) if p.is_file() else None


def _env_assignments(text: str) -> dict[str, tuple[str, int]]:
    """Uncommented EXPO_PUBLIC_*=VALUE lines -> {key: (value, line)}."""
    out: dict[str, tuple[str, int]] = {}
    for n, line in enumerate(text.splitlines(), 1):
        m = re.match(r"^\s*(EXPO_PUBLIC_[A-Z0-9_]+)=(.*?)\s*$", line)
        if m:
            out[m.group(1)] = (m.group(2), n)
    return out


def _public_value(value: str | None) -> str | None:
    """An allow-listed legal URL value is shown only if it is URL-shaped."""
    if value is None:
        return None
    return value if URL_SHAPE.match(value) else "<set, not URL-shaped; value withheld>"


def _git(root: Path, *args: str) -> str | None:
    """Read-only git (no optional index refresh), minimal environment."""
    try:
        r = subprocess.run(
            ["git", "--no-optional-locks", "-C", str(root), *args],
            capture_output=True,
            text=True,
            timeout=30,
            env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LC_ALL": "C", "GIT_TERMINAL_PROMPT": "0"},
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.rstrip("\n") if r.returncode == 0 else None


def _is_comment(line: str) -> bool:
    return line.strip().startswith(("*", "//", "/*"))


# ---------------------------------------------------------------- 1. public URLs


def _read_sites(root: Path) -> dict[str, list[str]]:
    """process.env.EXPO_PUBLIC_* reads in shipped mobile code -> {name: [file:line]}."""
    mobile = root / "apps/mobile"
    files = [mobile / "App.tsx", mobile / "index.js", mobile / "app.config.js"]
    src = mobile / "src"
    if src.is_dir():
        files += [
            p
            for p in sorted(src.rglob("*"))
            if p.suffix in (".ts", ".tsx", ".js", ".jsx") and "__tests__" not in p.parts
        ]
    sites: dict[str, list[str]] = {}
    for p in files:
        if not p.is_file():
            continue
        try:
            lines = p.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for n, line in enumerate(lines, 1):
            if _is_comment(line):
                continue
            for m in re.finditer(r"process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)", line):
                sites.setdefault(m.group(1), []).append(f"{p.relative_to(root).as_posix()}:{n}")
    return sites


def _documented_values(root: Path) -> dict[str, list[dict]]:
    """Documented public values of the legal URL variables, by source file:line."""
    docs: dict[str, list[dict]] = {v: [] for v in LEGAL_VARS}
    for rel in DOC_ENV_FILES:
        text = _read(root, rel)
        if text is None:
            continue
        for key, (value, line) in _env_assignments(text).items():
            if key in docs:
                docs[key].append({"source": f"{rel}:{line}", "value": value})
    text = _read(root, METADATA_DOC)
    if text is not None:
        lines = text.splitlines()
        start = next((i for i, ln in enumerate(lines) if ln.startswith("### Mobile env values")), None)
        if start is not None:
            in_block = False
            for i in range(start + 1, len(lines)):
                ln = lines[i]
                if ln.startswith("```"):
                    if in_block:
                        break
                    in_block = True
                    continue
                if ln.startswith("#") and not in_block:
                    break
                m = re.match(r"^(EXPO_PUBLIC_[A-Z0-9_]+)=(\S+)\s*$", ln) if in_block else None
                if m and m.group(1) in docs:
                    docs[m.group(1)].append({"source": f"{METADATA_DOC}:{i + 1}", "value": m.group(2)})
    text = _read(root, WEB_LINKS)
    if text is not None:
        for n, ln in enumerate(text.splitlines(), 1):
            m = re.match(r"^export const ([A-Z_]+)\s*=\s*'([^']*)';", ln)
            if m and m.group(1) in WEB_LINK_CONSTANTS:
                docs[WEB_LINK_CONSTANTS[m.group(1)]].append({"source": f"{WEB_LINKS}:{n}", "value": m.group(2)})
    return docs


def _local_dotenv_files(root: Path) -> list[str]:
    """Non-example .env* files (names only, never opened)."""
    found = []
    for d in (root / "apps/mobile", root):
        if d.is_dir():
            for p in sorted(d.iterdir()):
                if p.is_file() and p.name.startswith(".env") and not p.name.endswith(".example"):
                    found.append(p.relative_to(root).as_posix())
    return found


def _fallback(root: Path) -> dict:
    text = _read(root, LEGAL_TS)
    if text is None:
        return {"file": LEGAL_TS, "present": False}
    lines = text.splitlines()
    null_default = {}
    for var in LEGAL_VARS:
        idx = next((i for i, ln in enumerate(lines) if f"process.env.{var}" in ln and not _is_comment(ln)), None)
        if idx is None:
            null_default[var] = None
            continue
        stmt = " ".join(lines[idx : idx + 2])
        null_default[var] = {"line": f"{LEGAL_TS}:{idx + 1}", "unset_reads_as_null": "?? null" in stmt}
    alerts = [
        f"{LEGAL_TS}:{n}: {ln.strip()}"
        for n, ln in enumerate(lines, 1)
        if "not available" in ln and not _is_comment(ln)
    ]
    return {
        "file": LEGAL_TS,
        "present": True,
        "reads": null_default,
        "alert_lines": alerts,
        "behaviour": "unset or non-http URL -> openLegal() shows the Alert below instead of opening a link; "
        "no hard-coded fallback URL. LEGAL_LINKS_CONFIGURED is true only when privacy and terms are both set.",
    }


def public_urls(root: Path, environ: dict[str, str]) -> tuple[dict, list[str], list[str]]:
    inconsistencies: list[str] = []
    missing: list[str] = []
    sites = _read_sites(root)
    docs = _documented_values(root)
    eas = _load_json(root, EAS_JSON)
    profiles = eas.get("build", {}) if isinstance(eas, dict) else {}
    app_config = _read(root, APP_CONFIG) or ""

    variables: dict[str, dict] = {}
    for var in (*LEGAL_VARS, API_VAR):
        in_profiles = {
            name: var in ((prof or {}).get("env") or {})
            for name, prof in sorted(profiles.items())
            if isinstance(prof, dict)
        }
        entry: dict = {
            "read_at": sites.get(var, []),
            "in_app_config_js": f"process.env.{var}" in app_config,
            "in_eas_build_profiles": in_profiles,
            "process_env": "set" if var in environ else "unset",
        }
        if var in LEGAL_VARS:
            values = sorted({d["value"] for d in docs[var]})
            entry["documented"] = docs[var]
            entry["documented_values_agree"] = len(values) <= 1
            entry["process_env_value"] = _public_value(environ.get(var))
            if len(values) > 1:
                inconsistencies.append(f"{var}: documented values disagree across sources: {values}")
            if not values:
                missing.append(f"{var}: no documented public value found")
            if not entry["read_at"]:
                inconsistencies.append(f"{var}: required for store builds but not read anywhere in apps/mobile")
            absent = [p for p in STORE_PROFILES if not in_profiles.get(p)]
            if absent:
                missing.append(
                    f"{var}: not recorded in committed build config (eas.json build profiles {absent}); "
                    "a store build gets it only from EAS remote environment variables or the build "
                    "machine — not verifiable locally"
                )
            current = environ.get(var)
            if current is not None and values and current not in values:
                inconsistencies.append(f"{var}: this process's value differs from the documented value")
        else:
            https = {}
            for p in STORE_PROFILES:
                prof = profiles.get(p)
                value = ((prof or {}).get("env") or {}).get(var) if isinstance(prof, dict) else None
                if value is None:
                    missing.append(f"{var}: not set in eas.json build profile '{p}'")
                else:
                    https[p] = value.startswith("https://")
                    if not https[p]:
                        inconsistencies.append(f"{var}: eas.json build profile '{p}' is not https://")
            entry["store_profile_https"] = https
        variables[var] = entry

    report = {
        "variables": variables,
        "other_public_env_names_read": {n: s for n, s in sorted(sites.items()) if n not in variables},
        "local_dotenv_files": _local_dotenv_files(root),
        "local_dotenv_note": "Expo CLI auto-loads apps/mobile/.env* during start/export; "
        "names are listed, contents are never read",
        "unset_fallback": _fallback(root),
    }
    return report, inconsistencies, missing


# ---------------------------------------------------------------- 2. identity


def _js_literals(text: str, key: str) -> list[str]:
    return re.findall(rf"(?<![\w.]){re.escape(key)}:\s*[\"']([^\"']*)[\"']", text)


def app_identity(root: Path) -> tuple[dict, list[str], list[str]]:
    inconsistencies: list[str] = []
    notes: list[str] = []
    text = _read(root, APP_CONFIG)
    ident: dict = {"source": APP_CONFIG, "present": text is not None}
    if text is not None:
        uncommented = "\n".join(ln for ln in text.splitlines() if not _is_comment(ln))
        for field, key in (
            ("name", "name"),
            ("slug", "slug"),
            ("version", "version"),
            ("ios_bundle_identifier", "bundleIdentifier"),
            ("ios_build_number", "buildNumber"),
            ("android_package", "package"),
            ("runtime_version", "runtimeVersion"),
            ("owner", "owner"),
            ("eas_project_id", "projectId"),
        ):
            vals = sorted(set(_js_literals(uncommented, key)))
            ident[field] = vals[0] if len(vals) == 1 else (vals or None)
            if len(vals) > 1:
                inconsistencies.append(f"{APP_CONFIG}: '{key}' has several literal values {vals}")
        ident["has_updates_block"] = re.search(r"(?<![\w.])updates:\s*\{", uncommented) is not None

    app_json = _load_json(root, APP_JSON)
    if isinstance(app_json, dict):
        expo = app_json.get("expo", {}) if isinstance(app_json.get("expo"), dict) else {}
        static_keys = sorted(k for k in expo if not k.startswith("_"))
        ident["app_json_static_keys"] = static_keys
        for k in ("name", "slug", "version"):
            if k in expo and text is not None and ident.get(k) not in (None, expo[k]):
                inconsistencies.append(f"{APP_JSON} expo.{k}={expo[k]!r} differs from {APP_CONFIG}")
    elif app_json == "<invalid JSON>":
        inconsistencies.append(f"{APP_JSON}: invalid JSON")

    eas = _load_json(root, EAS_JSON)
    if isinstance(eas, dict):
        cli = eas.get("cli", {})
        prod = (eas.get("build") or {}).get("production") or {}
        ios_submit = ((eas.get("submit") or {}).get("production") or {}).get("ios") or {}
        ident["eas"] = {
            "cli_version": cli.get("version"),
            "app_version_source": cli.get("appVersionSource"),
            "production_auto_increment": prod.get("autoIncrement"),
            "submit_production_ios_asc_app_id": ios_submit.get("ascAppId"),
            "submit_production_ios_apple_team_id": ios_submit.get("appleTeamId"),
            "build_profiles": sorted((eas.get("build") or {}).keys()),
        }
        if cli.get("appVersionSource") == "remote":
            notes.append(
                "eas.json cli.appVersionSource is 'remote' (production autoIncrement="
                f"{prod.get('autoIncrement')}): the store build number is kept by EAS, so "
                f"ios.buildNumber={ident.get('ios_build_number')!r} in app.config.js is not what a store build "
                "carries — not verifiable locally"
            )
    elif eas == "<invalid JSON>":
        inconsistencies.append(f"{EAS_JSON}: invalid JSON")

    if text is not None:
        if ident.get("runtime_version") is None:
            notes.append("no runtimeVersion / updates block committed (no OTA channel configured)")
        if ident.get("owner") is None:
            notes.append("app.config.js has no 'owner'; the EAS project is identified only by extra.eas.projectId")
        uncommented = "\n".join(ln for ln in text.splitlines() if not _is_comment(ln))
        if '"@sentry/react-native/expo"' in uncommented and "organization" not in uncommented:
            notes.append(
                "the @sentry/react-native/expo plugin has no organization/project committed (Expo warns and "
                "falls back to build-environment variables); not documented as a required release input"
            )

    # Cross-checks against identifiers the repository documents elsewhere.
    meta = _read(root, METADATA_DOC) or ""
    m = re.search(r"\|\s*Bundle identifier\s*\|\s*`([^`]+)`", meta)
    documented_bundle = m.group(1) if m else None
    links = _read(root, WEB_LINKS) or ""
    m = re.search(r"apps\.apple\.com/[^'\"]*/id(\d+)", links)
    store_url_id = m.group(1) if m else None
    ident["documented"] = {
        "bundle_identifier": {"source": METADATA_DOC, "value": documented_bundle},
        "app_store_url_id": {"source": WEB_LINKS, "value": store_url_id},
    }
    if documented_bundle and ident.get("ios_bundle_identifier") not in (None, documented_bundle):
        inconsistencies.append(
            f"iOS bundleIdentifier {ident.get('ios_bundle_identifier')!r} != documented {documented_bundle!r}"
        )
    asc = (ident.get("eas") or {}).get("submit_production_ios_asc_app_id")
    if store_url_id and asc and str(asc) != store_url_id:
        inconsistencies.append(f"eas.json ascAppId {asc!r} != App Store URL id {store_url_id!r} in {WEB_LINKS}")
    if text is not None:
        for field in ("name", "slug", "version", "ios_bundle_identifier", "eas_project_id"):
            if ident.get(field) is None:
                inconsistencies.append(f"{APP_CONFIG}: no literal '{field}' found")
    return ident, inconsistencies, notes


# ---------------------------------------------------------------- 3. locked build


def _version_key(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])


def locked_build(root: Path) -> tuple[dict, list[str]]:
    inconsistencies: list[str] = []
    lock = _load_json(root, "package-lock.json")
    mobile_pkg = _load_json(root, MOBILE_PKG)
    npm: dict = {
        "command": "npm ci   (repository root; workspaces apps/* and packages/*)",
        "lockfile": "package-lock.json",
        "lockfile_sha256": _file_digest(root, "package-lock.json"),
    }
    if isinstance(lock, dict):
        pkgs = lock.get("packages", {})
        npm["lockfile_version"] = lock.get("lockfileVersion")
        for name in ("expo", "react-native", "react"):
            npm[f"locked_{name.replace('-', '_')}"] = (pkgs.get(f"node_modules/{name}") or {}).get("version")
        npm["react_native_engines_node"] = ((pkgs.get("node_modules/react-native") or {}).get("engines") or {}).get(
            "node"
        )
        if isinstance(mobile_pkg, dict):
            declared = mobile_pkg.get("dependencies", {})
            locked_decl = (pkgs.get("apps/mobile") or {}).get("dependencies", {})
            npm["mobile_declared_expo"] = declared.get("expo")
            if declared != locked_decl:
                diff = sorted(k for k in set(declared) | set(locked_decl) if declared.get(k) != locked_decl.get(k))
                inconsistencies.append(
                    f"package-lock.json apps/mobile dependencies differ from {MOBILE_PKG}: {diff} (npm ci would fail)"
                )
        if npm.get("locked_expo"):
            npm["expo_sdk"] = _version_key(npm["locked_expo"])[0]
    elif lock is None:
        inconsistencies.append("package-lock.json missing")
    ci = _read(root, CI_WORKFLOW) or ""
    npm["ci_node_versions"] = sorted(set(re.findall(r"node-version:\s*[\"']?([\w.]+)", ci)))
    node = None
    try:
        r = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=10)
        node = r.stdout.strip() if r.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        pass
    npm["node_on_path"] = node or "not found"
    npm["node_note"] = "informational: the declared engine/CI version is what counts, not the PATH default"

    uv: dict = {
        "command": "uv sync --frozen   (apps/api; CI adds --dev, the Dockerfile uses --no-dev --no-install-project)",
        "lockfile": "apps/api/uv.lock",
        "lockfile_sha256": _file_digest(root, "apps/api/uv.lock"),
    }
    pyproject = _read(root, "apps/api/pyproject.toml") or ""
    m = re.search(r'^requires-python\s*=\s*"([^"]+)"', pyproject, re.M)
    uv["requires_python"] = m.group(1) if m else None
    uv["python_version_file"] = (_read(root, "apps/api/.python-version") or "").strip() or None
    uvlock = _read(root, "apps/api/uv.lock") or ""
    m = re.search(r'^requires-python\s*=\s*"([^"]+)"', uvlock, re.M)
    uv["lock_requires_python"] = m.group(1) if m else None
    if uvlock == "":
        inconsistencies.append("apps/api/uv.lock missing")
    elif uv["requires_python"] and uv["lock_requires_python"] and uv["requires_python"] != uv["lock_requires_python"]:
        inconsistencies.append("apps/api/uv.lock requires-python differs from pyproject.toml (uv sync --frozen)")
    return {"npm": npm, "uv": uv, "ios_export_command": EXPORT_CMD}, inconsistencies


# ---------------------------------------------------------------- 4. source + export


def source_identity(root: Path) -> dict:
    head = _git(root, "rev-parse", "HEAD")
    if head is None:
        return {"git": "not a git repository (or git unavailable)"}
    status = _git(root, "status", "--porcelain=v1", "--untracked-files=normal") or ""
    dirty = []
    for ln in status.splitlines():
        if not ln.strip():
            continue
        rel = ln[3:].split(" -> ")[-1].strip('"')
        p = root / rel
        dirty.append(
            {
                "status": ln[:2].strip(),
                "path": rel,
                # Content hash of the working-tree file, so an export built from a
                # dirty tree can still be tied to exact source (directories: none).
                "sha256": _sha256_file(p) if p.is_file() else None,
            }
        )
    return {
        "head": head,
        "branch": _git(root, "rev-parse", "--abbrev-ref", "HEAD"),
        "worktree_clean": not dirty,
        "dirty_paths": dirty[:50],
        "dirty_count": len(dirty),
        "last_source_commit": _git(root, "log", "-1", "--format=%H", "--", "apps", "scripts", "packages", ".github"),
        "last_source_commit_definition": "last commit touching apps/, scripts/, packages/ or .github/",
    }


def export_manifest(export_dir: Path, documented: dict[str, list[dict]], display: str) -> tuple[dict, list[str]]:
    inconsistencies: list[str] = []
    if not export_dir.is_dir():
        return {"dir": display, "present": False}, [f"--export-dir {display} is not a directory"]
    files = []
    for p in sorted(export_dir.rglob("*")):
        if p.is_file():
            files.append(
                {"path": p.relative_to(export_dir).as_posix(), "bytes": p.stat().st_size, "sha256": _sha256_file(p)}
            )
    fingerprint = hashlib.sha256("\n".join(f"{f['sha256']}  {f['path']}" for f in files).encode("utf-8")).hexdigest()
    meta_path = export_dir / "metadata.json"
    metadata = None
    if meta_path.is_file():
        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            inconsistencies.append("export metadata.json is not valid JSON")
    else:
        inconsistencies.append("export has no metadata.json (not an expo export output?)")
    bundles = [f for f in files if f["path"].startswith("_expo/static/js/") and f["path"].endswith((".hbc", ".js"))]
    if not bundles:
        inconsistencies.append("export has no JS/Hermes bundle under _expo/static/js/")
    listed = set()
    if isinstance(metadata, dict):
        for plat in (metadata.get("fileMetadata") or {}).values():
            if isinstance(plat, dict) and plat.get("bundle"):
                listed.add(plat["bundle"])
                if not (export_dir / plat["bundle"]).is_file():
                    inconsistencies.append(f"metadata.json lists missing bundle {plat['bundle']}")
    embedded: dict[str, dict] = {}
    for var, sources in documented.items():
        values = sorted({d["value"] for d in sources})
        hits = {}
        for value in values:
            needle = value.encode("utf-8")
            hits[value] = any(needle in (export_dir / b["path"]).read_bytes() for b in bundles)
        embedded[var] = hits
    return (
        {
            "dir": display,
            "present": True,
            "file_count": len(files),
            "fingerprint_sha256": fingerprint,
            "fingerprint_definition": "sha256 over sorted lines '<sha256>  <relative path>'",
            "bundles": bundles,
            "metadata_json": metadata,
            "documented_legal_urls_embedded_in_bundle": embedded,
            "files": files,
        },
        inconsistencies,
    )


# ---------------------------------------------------------------- report


def build_report(root: Path, environ: dict[str, str], export_dir: Path | None = None) -> dict:
    urls, url_inc, url_missing = public_urls(root, environ)
    ident, ident_inc, ident_notes = app_identity(root)
    build, build_inc = locked_build(root)
    report: dict = {
        "schema_version": 1,
        "tool": "scripts/release/preflight.py",
        "read_only": True,
        "public_urls": urls,
        "app_identity": ident,
        "locked_build": build,
        "source": source_identity(root),
    }
    inconsistencies = url_inc + ident_inc + build_inc
    if export_dir is not None:
        try:
            display = export_dir.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            display = "<export-dir>"
        docs = {v: urls["variables"][v]["documented"] for v in LEGAL_VARS}
        manifest, exp_inc = export_manifest(export_dir, docs, display)
        report["export"] = manifest
        inconsistencies += exp_inc
    missing = list(url_missing)
    missing.append(
        "iOS signing certificate / provisioning profile and APNs key: EAS-managed (no credentials.json "
        "committed) — not verifiable locally"
    )
    if (ident.get("eas") or {}).get("app_version_source") == "remote":
        missing.append("store build number: kept remotely by EAS (appVersionSource=remote) — not verifiable locally")
    report["notes"] = ident_notes
    report["missing_release_inputs"] = missing
    report["gates_not_satisfiable_locally"] = GATES
    report["inconsistencies"] = inconsistencies
    report["result"] = (
        "INCONSISTENT" if inconsistencies else "CONSISTENT_WITH_MISSING_INPUTS" if missing else "CONSISTENT"
    )
    return report


def _sanitize(text: str, environ: dict[str, str]) -> str:
    """Replace any non-allow-listed environment value (16+ chars) that leaked into text."""
    allowed_values = {environ[k] for k in ALLOWED_VALUE_VARS if k in environ}
    for key, value in environ.items():
        if key in ALLOWED_VALUE_VARS or len(value) < REDACT_MIN_LEN or value in allowed_values:
            continue
        for form in {value, json.dumps(value)[1:-1]}:
            if form and form in text:
                text = text.replace(form, "<redacted>")
    return text


def render_text(r: dict) -> str:
    out: list[str] = []
    w = out.append
    w("SportsGang release preflight (local, read-only)")
    w(f"result: {r['result']}")
    w("")
    w("== 1. Public URL configuration (mobile build) ==")
    for var, e in r["public_urls"]["variables"].items():
        w(f"{var}")
        w(f"  read at: {', '.join(e['read_at']) or 'NOT READ'}")
        w(f"  in app.config.js: {'yes' if e['in_app_config_js'] else 'no'}")
        prof = ", ".join(f"{k}={'yes' if v else 'no'}" for k, v in e["in_eas_build_profiles"].items())
        w(f"  in eas.json build profiles: {prof or 'none'}")
        if var in LEGAL_VARS:
            for d in e["documented"]:
                w(f"  documented: {d['value']}  ({d['source']})")
            if not e["documented"]:
                w("  documented: none found")
            w(f"  documented values agree: {'yes' if e['documented_values_agree'] else 'NO'}")
            shown = e["process_env_value"]
            w(f"  this process: {'unset' if shown is None else 'set = ' + shown}")
        else:
            w(f"  store profiles https: {e.get('store_profile_https') or 'none'}  (value not printed)")
            w(f"  this process: {e['process_env']}  (value not printed)")
    other = r["public_urls"]["other_public_env_names_read"]
    if other:
        w("other EXPO_PUBLIC_* names read by the app (names only): " + ", ".join(sorted(other)))
    dot = r["public_urls"]["local_dotenv_files"]
    w(f"local .env files Expo would auto-load: {', '.join(dot) if dot else 'none'} (contents never read)")
    fb = r["public_urls"]["unset_fallback"]
    w(f"unset behaviour ({fb['file']}): {fb.get('behaviour', 'file missing')}")
    for line in fb.get("alert_lines", []):
        w(f"  {line}")
    w("")
    w("== 2. App identity (as committed) ==")
    ident = r["app_identity"]
    for k in (
        "name",
        "slug",
        "version",
        "ios_bundle_identifier",
        "ios_build_number",
        "android_package",
        "runtime_version",
        "owner",
        "eas_project_id",
        "has_updates_block",
    ):
        w(f"  {k}: {ident.get(k)}")
    for k, v in (ident.get("eas") or {}).items():
        w(f"  eas.{k}: {v}")
    w(f"  app.json static keys: {ident.get('app_json_static_keys')}")
    for k, v in (ident.get("documented") or {}).items():
        w(f"  documented {k}: {v['value']}  ({v['source']})")
    for n in r["notes"]:
        w(f"  note: {n}")
    w("")
    w("== 3. Locked dependencies and build commands ==")
    npm, uv = r["locked_build"]["npm"], r["locked_build"]["uv"]
    w(f"  {npm['command']}")
    w(f"    package-lock.json sha256 {npm['lockfile_sha256']} (lockfileVersion {npm.get('lockfile_version')})")
    w(
        f"    expo {npm.get('locked_expo')} (SDK {npm.get('expo_sdk')}; declared {npm.get('mobile_declared_expo')}), "
        f"react-native {npm.get('locked_react_native')}, react {npm.get('locked_react')}"
    )
    w(
        f"    node: react-native engines {npm.get('react_native_engines_node')}; CI node-version "
        f"{npm.get('ci_node_versions')}; on PATH {npm.get('node_on_path')} ({npm['node_note']})"
    )
    w(f"  {uv['command']}")
    w(f"    uv.lock sha256 {uv['lockfile_sha256']}")
    w(
        f"    requires-python {uv['requires_python']} (lock {uv['lock_requires_python']}); "
        f".python-version {uv['python_version_file']}"
    )
    w(f"  iOS JS export: {r['locked_build']['ios_export_command']}")
    w("")
    w("== 4. Source identity ==")
    src = r["source"]
    if "head" in src:
        w(f"  HEAD {src['head']} ({src['branch']})")
        w(f"  worktree clean: {'yes' if src['worktree_clean'] else 'NO (' + str(src['dirty_count']) + ' paths)'}")
        for d in src["dirty_paths"]:
            w(f"    {d['status']:>2} {d['path']}" + (f"  sha256 {d['sha256']}" if d["sha256"] else ""))
        w(f"  last source commit: {src['last_source_commit']} ({src['last_source_commit_definition']})")
    else:
        w(f"  {src['git']}")
    if "export" in r:
        e = r["export"]
        w(f"  export dir: {e['dir']}")
        if e.get("present"):
            w(f"  export fingerprint sha256 {e['fingerprint_sha256']} over {e['file_count']} files")
            for b in e["bundles"]:
                w(f"    bundle {b['path']} {b['bytes']} B sha256 {b['sha256']}")
            for f in e["files"]:
                if f not in e["bundles"]:
                    w(f"    file {f['path']} {f['bytes']} B sha256 {f['sha256']}")
            w("  metadata.json: " + json.dumps(e["metadata_json"], sort_keys=True))
            for var, hits in e["documented_legal_urls_embedded_in_bundle"].items():
                w(
                    f"  {var} documented value embedded in bundle: "
                    + (", ".join(f"{v} -> {'yes' if h else 'no'}" for v, h in hits.items()) or "no documented value")
                )
    w("")
    w("== 5. Missing release inputs ==")
    for m in r["missing_release_inputs"] or ["none"]:
        w(f"  - {m}")
    w("")
    w("== Gates that cannot be satisfied locally ==")
    for g in r["gates_not_satisfiable_locally"]:
        w(f"  - {g['gate']}: {g['status']} ({g['why_not_local']})")
    w("")
    w("== Inconsistencies (exit 1 if any) ==")
    for i in r["inconsistencies"] or ["none"]:
        w(f"  - {i}")
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None, environ: dict[str, str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--strict", action="store_true", help="exit 3 when a release input is missing")
    ap.add_argument("--export-dir", type=Path, help="directory produced by `expo export` to fingerprint")
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2], help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    env = dict(os.environ if environ is None else environ)
    report = build_report(args.root.resolve(), env, args.export_dir)
    text = json.dumps(report, indent=2, sort_keys=False) + "\n" if args.json else render_text(report)
    sys.stdout.write(_sanitize(text, env))
    if report["inconsistencies"]:
        return 1
    if args.strict and report["missing_release_inputs"]:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
