"""Unit tests for scripts/release/preflight.py (stdlib unittest, temp fixture repos).

Run from the repository root:
  python3 -m unittest scripts/release/test_preflight.py -v
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import preflight  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]

PRIVACY = "https://example.test/privacy/"
TERMS = "https://example.test/terms/"
SUPPORT = "https://example.test/support/"
API_COMMITTED = "https://api-committed-value.example.test"

CANARY_SECRET = "sg-canary-7f3a9c1e5b2d4086a1c3e5f7b9d1f3a5"
CANARY_API = "https://canary-api-0d9e8f7a6b5c.example.test"
CANARY_MAPS = "AIzaCanaryMapsKey-1234567890abcdefghij"

APP_CONFIG = """\
// header comment: name: "CommentedOut"
module.exports = () => ({
  expo: {
    name: "FixtureApp",
    slug: "fixture",
    version: "2.3.4",
    ios: {
      bundleIdentifier: "test.fixture.app",
      buildNumber: "7",
    },
    android: { package: "test.fixture.app" },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000",
      eas: { projectId: "00000000-0000-4000-8000-000000000000" },
    },
  },
});
"""

LEGAL_TS = """\
import { Alert, Linking } from 'react-native';
export const PRIVACY_URL: string | null =
  process.env.EXPO_PUBLIC_PRIVACY_URL ?? null;
export const TERMS_URL: string | null =
  process.env.EXPO_PUBLIC_TERMS_URL ?? null;
export const SUPPORT_URL: string | null =
  process.env.EXPO_PUBLIC_SUPPORT_URL ?? null;
export function openLegal(url: string | null, label: string): void {
  if (!url) {
    Alert.alert(
      `${label} not available`,
      'This link is not available yet. Please contact support.'
    );
    return;
  }
  void Linking.openURL(url);
}
"""

METADATA = f"""\
# Metadata

## 1. Identity and naming

| Field | Draft value | Notes |
|---|---|---|
| Bundle identifier | `test.fixture.app` | doc |

## 8. URLs

### Mobile env values (EAS — applied)

```
EXPO_PUBLIC_PRIVACY_URL={PRIVACY}
EXPO_PUBLIC_TERMS_URL={TERMS}
EXPO_PUBLIC_SUPPORT_URL={SUPPORT}
```

## 9. Next
"""

LINKS_TS = f"""\
export const APP_STORE_URL = 'https://apps.apple.com/au/app/fixture/id123456789';

export const PRIVACY_URL = '{PRIVACY}';
export const TERMS_URL = '{TERMS}';
export const SUPPORT_URL = '{SUPPORT}';
"""

ENV_EXAMPLE = f"""\
# comment line EXPO_PUBLIC_PRIVACY_URL=https://ignored.example.test/
EXPO_PUBLIC_API_URL=http://localhost:8000
EXPO_PUBLIC_PRIVACY_URL={PRIVACY}
EXPO_PUBLIC_TERMS_URL={TERMS}
EXPO_PUBLIC_SUPPORT_URL={SUPPORT}
"""

MOBILE_DEPS = {"expo": "^54.0.34", "react": "19.1.0", "react-native": "0.81.5"}


def eas_json(profile_env: dict | None = None) -> dict:
    prod_env = {"EXPO_PUBLIC_API_URL": API_COMMITTED, **(profile_env or {})}
    return {
        "cli": {"version": ">= 12.0.0", "appVersionSource": "remote"},
        "build": {
            "development": {"env": {"EXPO_PUBLIC_API_URL": "http://localhost:8000"}},
            "preview": {"env": dict(prod_env)},
            "production": {"autoIncrement": True, "env": dict(prod_env)},
        },
        "submit": {"production": {"ios": {"ascAppId": "123456789", "appleTeamId": "TEAMID0000"}}},
    }


def make_repo(root: Path, *, eas: dict | None = None, links: str = LINKS_TS, lock_deps: dict | None = None) -> None:
    files = {
        "apps/mobile/app.config.js": APP_CONFIG,
        "apps/mobile/app.json": json.dumps({"expo": {"_comment": "minimal"}}),
        "apps/mobile/eas.json": json.dumps(eas or eas_json(), indent=2),
        "apps/mobile/package.json": json.dumps({"name": "@fixture/mobile", "dependencies": MOBILE_DEPS}),
        "apps/mobile/src/lib/legal.ts": LEGAL_TS,
        "apps/mobile/.env.example": ENV_EXAMPLE,
        ".env.example": ENV_EXAMPLE,
        "docs/release/APP_STORE_METADATA.md": METADATA,
        "apps/web/src/lib/links.ts": links,
        "package-lock.json": json.dumps(
            {
                "lockfileVersion": 3,
                "packages": {
                    "apps/mobile": {"dependencies": lock_deps if lock_deps is not None else MOBILE_DEPS},
                    "node_modules/expo": {"version": "54.0.34"},
                    "node_modules/react": {"version": "19.1.0"},
                    "node_modules/react-native": {"version": "0.81.5", "engines": {"node": ">= 20.19.4"}},
                },
            }
        ),
        "apps/api/pyproject.toml": '[project]\nname = "fixture-api"\nrequires-python = ">=3.12"\n',
        "apps/api/uv.lock": 'version = 1\nrequires-python = ">=3.12"\n',
        "apps/api/.python-version": "3.12\n",
        ".github/workflows/ci.yml": 'jobs:\n  m:\n    steps:\n      - with:\n          node-version: "20"\n',
    }
    for rel, content in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")


def run(root: Path, *args: str, environ: dict | None = None) -> tuple[int, str]:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = preflight.main(["--root", str(root), *args], environ=environ or {})
    return code, buf.getvalue()


class PreflightFixtureTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_consistent_fixture_reports_missing_legal_urls_but_exits_zero(self) -> None:
        make_repo(self.root)
        code, out = run(self.root, "--json")
        self.assertEqual(code, 0)
        r = json.loads(out)
        self.assertEqual(r["result"], "CONSISTENT_WITH_MISSING_INPUTS")
        self.assertEqual(r["inconsistencies"], [])
        for var in preflight.LEGAL_VARS:
            self.assertTrue(
                any(
                    m.startswith(f"{var}: not recorded in committed build config") for m in r["missing_release_inputs"]
                ),
                var,
            )
            v = r["public_urls"]["variables"][var]
            self.assertTrue(v["documented_values_agree"])
            self.assertEqual(len(v["documented"]), 4)  # two .env.example files, metadata §8, links.ts
            self.assertIsNone(v["process_env_value"])
        self.assertEqual(
            r["public_urls"]["variables"]["EXPO_PUBLIC_PRIVACY_URL"]["read_at"], ["apps/mobile/src/lib/legal.ts:3"]
        )
        ident = r["app_identity"]
        self.assertEqual(ident["name"], "FixtureApp")  # the commented-out name is ignored
        self.assertEqual(ident["ios_bundle_identifier"], "test.fixture.app")
        self.assertEqual(ident["eas"]["submit_production_ios_asc_app_id"], "123456789")
        self.assertIn("not verifiable locally", " ".join(r["notes"]))
        self.assertEqual(r["locked_build"]["npm"]["locked_expo"], "54.0.34")
        self.assertEqual(r["locked_build"]["npm"]["expo_sdk"], 54)
        self.assertEqual(r["source"], {"git": "not a git repository (or git unavailable)"})
        fallback = r["public_urls"]["unset_fallback"]
        self.assertTrue(all(x["unset_reads_as_null"] for x in fallback["reads"].values()))
        self.assertTrue(any("Please contact support" in a for a in fallback["alert_lines"]))
        self.assertEqual(len(r["gates_not_satisfiable_locally"]), 5)

    def test_sentry_plugin_without_org_is_noted_not_fatal(self) -> None:
        make_repo(self.root)
        cfg = self.root / "apps/mobile/app.config.js"
        cfg.write_text(
            cfg.read_text().replace("    extra: {", '    plugins: ["@sentry/react-native/expo"],\n    extra: {')
        )
        code, out = run(self.root, "--json")
        self.assertEqual(code, 0)
        self.assertTrue(any("@sentry/react-native/expo" in n for n in json.loads(out)["notes"]))

    def test_strict_turns_missing_inputs_into_exit_3(self) -> None:
        make_repo(self.root)
        code, _ = run(self.root, "--strict")
        self.assertEqual(code, 3)

    def test_legal_urls_in_store_profiles_are_not_missing(self) -> None:
        make_repo(
            self.root,
            eas=eas_json(
                {"EXPO_PUBLIC_PRIVACY_URL": PRIVACY, "EXPO_PUBLIC_TERMS_URL": TERMS, "EXPO_PUBLIC_SUPPORT_URL": SUPPORT}
            ),
        )
        code, out = run(self.root, "--json")
        self.assertEqual(code, 0)
        missing = json.loads(out)["missing_release_inputs"]
        self.assertFalse(any("not recorded in committed build config" in m for m in missing))

    def test_documented_values_that_disagree_are_an_inconsistency(self) -> None:
        make_repo(self.root, links=LINKS_TS.replace(TERMS, "https://other.example.test/terms/"))
        code, out = run(self.root, "--json")
        self.assertEqual(code, 1)
        r = json.loads(out)
        self.assertEqual(r["result"], "INCONSISTENT")
        self.assertTrue(any("EXPO_PUBLIC_TERMS_URL: documented values disagree" in i for i in r["inconsistencies"]))

    def test_store_id_mismatch_is_an_inconsistency(self) -> None:
        make_repo(self.root, links=LINKS_TS.replace("id123456789", "id999"))
        code, out = run(self.root, "--json")
        self.assertEqual(code, 1)
        self.assertTrue(any("ascAppId" in i for i in json.loads(out)["inconsistencies"]))

    def test_lockfile_out_of_sync_is_an_inconsistency(self) -> None:
        make_repo(self.root, lock_deps={**MOBILE_DEPS, "expo": "^53.0.0"})
        code, out = run(self.root, "--json")
        self.assertEqual(code, 1)
        self.assertTrue(any("npm ci would fail" in i for i in json.loads(out)["inconsistencies"]))

    def test_plaintext_store_api_url_is_an_inconsistency_without_printing_it(self) -> None:
        eas = eas_json()
        eas["build"]["production"]["env"]["EXPO_PUBLIC_API_URL"] = "http://plaintext-api-value.example.test"
        make_repo(self.root, eas=eas)
        code, out = run(self.root)
        self.assertEqual(code, 1)
        self.assertIn("is not https://", out)
        self.assertNotIn("plaintext-api-value", out)

    def test_process_legal_value_is_shown_and_mismatch_is_flagged(self) -> None:
        make_repo(self.root)
        code, out = run(
            self.root,
            environ={"EXPO_PUBLIC_PRIVACY_URL": PRIVACY, "EXPO_PUBLIC_TERMS_URL": "https://other.example.test/t/"},
        )
        self.assertEqual(code, 1)
        self.assertIn(f"this process: set = {PRIVACY}", out)
        self.assertIn("EXPO_PUBLIC_TERMS_URL: this process's value differs", out)

    def test_non_url_legal_value_is_withheld(self) -> None:
        make_repo(self.root)
        _, out = run(self.root, environ={"EXPO_PUBLIC_SUPPORT_URL": "token=abc123 not-a-url"})
        self.assertNotIn("abc123", out)
        self.assertIn("value withheld", out)

    def test_dotenv_files_are_listed_by_name_and_never_read(self) -> None:
        make_repo(self.root)
        (self.root / "apps/mobile/.env").write_text(f"EXPO_PUBLIC_GOOGLE_MAPS_API_KEY={CANARY_MAPS}\n")
        (self.root / "apps/mobile/.env.local").write_text(f"SECRET={CANARY_SECRET}\n")
        for args in ((), ("--json",)):
            _, out = run(self.root, *args)
            self.assertIn("apps/mobile/.env", out)
            self.assertIn("apps/mobile/.env.local", out)
            self.assertNotIn(CANARY_MAPS, out)
            self.assertNotIn(CANARY_SECRET, out)

    def test_export_manifest_hashes_files_and_detects_embedded_urls(self) -> None:
        make_repo(self.root)
        export = Path(self._tmp.name) / "ios-export"
        bundle = export / "_expo/static/js/ios/index-0123abcd.hbc"
        bundle.parent.mkdir(parents=True)
        bundle.write_bytes(b"\x00hermes\x00" + PRIVACY.encode() + b"\x00")
        (export / "metadata.json").write_text(
            json.dumps(
                {
                    "version": 0,
                    "bundler": "metro",
                    "fileMetadata": {"ios": {"bundle": "_expo/static/js/ios/index-0123abcd.hbc", "assets": []}},
                }
            )
        )
        code, out = run(self.root, "--json", "--export-dir", str(export))
        self.assertEqual(code, 0, out)
        e = json.loads(out)["export"]
        self.assertEqual(e["file_count"], 2)
        self.assertEqual(e["dir"], "ios-export")  # inside --root: shown repo-relative
        self.assertEqual(e["bundles"][0]["sha256"], preflight._sha256_file(bundle))
        self.assertEqual(e["metadata_json"]["bundler"], "metro")
        emb = e["documented_legal_urls_embedded_in_bundle"]
        self.assertEqual(emb["EXPO_PUBLIC_PRIVACY_URL"], {PRIVACY: True})
        self.assertEqual(emb["EXPO_PUBLIC_TERMS_URL"], {TERMS: False})
        # Same content -> same fingerprint; one byte changed -> a different one.
        _, again = run(self.root, "--json", "--export-dir", str(export))
        self.assertEqual(json.loads(again)["export"]["fingerprint_sha256"], e["fingerprint_sha256"])
        bundle.write_bytes(bundle.read_bytes() + b"\x01")
        _, changed = run(self.root, "--json", "--export-dir", str(export))
        self.assertNotEqual(json.loads(changed)["export"]["fingerprint_sha256"], e["fingerprint_sha256"])

    def test_export_outside_root_is_shown_as_placeholder(self) -> None:
        make_repo(self.root / "repo")
        with tempfile.TemporaryDirectory() as other:
            export = Path(other) / "ios-export"
            (export / "_expo/static/js/ios").mkdir(parents=True)
            (export / "_expo/static/js/ios/index-x.hbc").write_bytes(b"x")
            (export / "metadata.json").write_text("{}")
            _, out = run(self.root / "repo", "--json", "--export-dir", str(export))
            self.assertEqual(json.loads(out)["export"]["dir"], "<export-dir>")
            self.assertNotIn(str(other), out)

    def test_export_without_metadata_is_an_inconsistency(self) -> None:
        make_repo(self.root)
        export = self.root / "not-an-export"
        export.mkdir()
        (export / "file.txt").write_text("x")
        code, out = run(self.root, "--json", "--export-dir", str(export))
        self.assertEqual(code, 1)
        self.assertTrue(any("metadata.json" in i for i in json.loads(out)["inconsistencies"]))


class CanaryTests(unittest.TestCase):
    """No environment value outside the allow-list may appear in any output."""

    def canary_env(self) -> dict:
        return {
            "SG_PREFLIGHT_CANARY": CANARY_SECRET,
            "EXPO_PUBLIC_API_URL": CANARY_API,  # presence only, never the value
            "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY": CANARY_MAPS,
            "EXPO_PUBLIC_SENTRY_DSN": CANARY_SECRET + "-dsn",
            "EXPO_PUBLIC_PRIVACY_URL": PRIVACY,  # allow-listed: may be shown
            "PATH": "/usr/bin:/bin",
        }

    def assert_no_canary(self, out: str) -> None:
        for canary in (CANARY_SECRET, CANARY_API, CANARY_MAPS, "canary-api", "AIzaCanary"):
            self.assertNotIn(canary, out)

    def test_fixture_repo_text_and_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_repo(root)
            for args in ((), ("--json",)):
                code, out = run(root, *args, environ=self.canary_env())
                self.assert_no_canary(out)
                self.assertIn(PRIVACY, out)
                self.assertIn("EXPO_PUBLIC_API_URL", out)
                self.assertNotIn(API_COMMITTED, out)  # committed API URL: presence/https only

    def test_real_repository_text_and_json(self) -> None:
        for args in ((), ("--json",)):
            code, out = run(REPO_ROOT, *args, environ=self.canary_env())
            self.assertIn(code, (0, 1))
            self.assert_no_canary(out)
            self.assertNotIn(str(Path.home()), out)

    def test_sanitizer_redacts_leaked_values_but_keeps_allow_listed_ones(self) -> None:
        quoted = "quoted-canary-value-" + '"' + "9d8c7b6a"
        env = {
            "SOME_TOKEN": CANARY_SECRET,
            "QUOTED": quoted,
            "EXPO_PUBLIC_TERMS_URL": TERMS,
            "SAME_AS_TERMS": TERMS,
            "SHORT": "abc",
        }
        text = "a " + CANARY_SECRET + " b " + json.dumps({"v": quoted}) + " c " + TERMS + " d abc"
        out = preflight._sanitize(text, env)
        self.assertNotIn("quoted-canary-value", out)
        self.assertNotIn(CANARY_SECRET, out)
        self.assertIn(TERMS, out)
        self.assertIn(" abc", out)
        self.assertIn("<redacted>", out)


if __name__ == "__main__":
    unittest.main()
