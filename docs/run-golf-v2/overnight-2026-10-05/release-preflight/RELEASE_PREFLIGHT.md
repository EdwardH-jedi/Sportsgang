# Release preflight (local, read-only)

`scripts/release/preflight.py` checks, from the repository and the current process
only, what a release build will consume, how the build is locked, and how a tested
JS export can be identified later. It also lists the release inputs and gates that
cannot be verified locally.

It is stdlib Python and read-only:

- no network access and no EAS, Fly or Expo account commands;
- git runs with `--no-optional-locks`;
- `.env` files are listed by name and never opened;
- environment values are printed only for `EXPO_PUBLIC_PRIVACY_URL`,
  `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_SUPPORT_URL`, and only when URL-shaped.
  `EXPO_PUBLIC_API_URL` is reported as set or unset only, and committed API URLs only
  as "https: yes/no".
- as defence in depth, any other environment value of 16 or more characters that
  reaches the output is replaced with `<redacted>`.

## How to run

From the repository root:

```sh
python3 scripts/release/preflight.py                        # human-readable
python3 scripts/release/preflight.py --json                 # machine-readable
python3 scripts/release/preflight.py --strict               # exit 3 if a release input is missing
python3 scripts/release/preflight.py --export-dir <dir>     # also fingerprint an `expo export` output
python3 -m unittest scripts/release/test_preflight.py -v    # its tests
```

| Exit | Meaning |
|---|---|
| 0 | No local inconsistency. Missing inputs are listed but not fatal. |
| 1 | A definite local inconsistency, for example: documented legal URLs disagree; a process value differs from the documented one; a store profile API URL is not https; the eas.json `ascAppId` differs from the App Store link; the bundle ID differs from APP_STORE_METADATA; the lockfile is out of sync with `apps/mobile/package.json`; an export has no `metadata.json` or bundle |
| 3 | `--strict` and at least one release input is missing |
| 2 | Usage error |

The local JS export it fingerprints. This is a bundle check, not a signed or store
build.

```sh
cd apps/mobile && CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 \
  npx --no-install expo export --platform ios --output-dir <dir>
```

The candidate's reports record the command as:

- `npx --no-install expo export --platform ios`, from `apps/mobile`
  (`docs/run-golf-v2/morning-fixes/IMPLEMENTATION_REPORT.md:73`);
- `expo export --platform ios`
  (`docs/run-golf-v2/release-candidate/IMPLEMENTATION_REPORT.md:242`);
- output directory `<scratch>/rc/ios-export`, per its `evidence/logs/ios-export.log`.

The added `CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1` only make Expo CLI
non-interactive, offline and telemetry-free. They do not change the bundle: the
clean-HEAD export below produced the candidate's exact bundle name.

Node 20 was used (`PATH=/opt/homebrew/opt/node@20/bin:$PATH` on this Mac, v20.20.2).
The default `node` on `PATH` here is v26.7.0. The declared requirement is
react-native's `engines.node >= 20.19.4`, and CI uses `node-version: "20"`.

## What each section means

1. **Public URL configuration.** For each variable:
   - where the shipped code reads it (file:line);
   - whether `app.config.js` or an `eas.json` build profile defines it;
   - every documented public value, with its source;
   - whether this process has it set;
   - the app's behaviour when it is unset.

   The section also lists `.env*` files that Expo CLI would auto-load during
   start/export (names only).
2. **App identity.** The values as committed, cross-checked against
   APP_STORE_METADATA §1 and the App Store link in `apps/web/src/lib/links.ts`.
   Notes cover what a store build does *not* take from the repository.
3. **Locked dependencies and build commands.** It reports:
   - `npm ci` with the `package-lock.json` sha256;
   - `uv sync --frozen` with the `apps/api/uv.lock` sha256;
   - the locked Expo, React Native and React versions, and the Node and Python
     requirements;
   - the export command above.
4. **Source identity.** It reports:
   - `HEAD`, the branch and the last source commit (the last commit touching `apps/`,
     `scripts/`, `packages/` or `.github/`);
   - whether the worktree is clean. Every modified or untracked file is listed with
     its working-tree sha256, so an export built from a dirty tree can still be tied
     to exact source.

   With `--export-dir`, it also gives:
   - sha256 and size of every exported file, and a fingerprint over the sorted list;
   - the content of `metadata.json`;
   - whether each documented legal URL is embedded in the bundle (a byte search).
5. **Missing release inputs**, the **gates that cannot be satisfied locally**, and
   **inconsistencies**.

## Current results

Run on 5 Oct 2026, 03:52 AEDT (2026-10-04T16:52Z), in worktree
`.claude/worktrees/run-golf-v2-overnight`. Outputs:

- [preflight.txt](preflight.txt) and [preflight.json](preflight.json) (no export);
- [preflight-export-clean-head.txt](preflight-export-clean-head.txt) and `.json`;
- [preflight-export-worktree.txt](preflight-export-worktree.txt) and `.json`. This
  snapshot was taken immediately after that export, by the script before the
  informational Sentry note was added; its export and source sections are what
  count;
- export logs: [ios-export-clean-head.log](ios-export-clean-head.log),
  [ios-export-worktree.log](ios-export-worktree.log).

**Result: `CONSISTENT_WITH_MISSING_INPUTS`**: exit 0, exit 3 with `--strict`, no
inconsistencies.

### Public URLs

| Variable | Read at | In committed build config | Documented value (5 sources agree) | This process |
|---|---|---|---|---|
| `EXPO_PUBLIC_PRIVACY_URL` | `apps/mobile/src/lib/legal.ts:21` | **no**: not in `app.config.js`, not in any `eas.json` profile | `https://sportgang.netlify.app/privacy/` | unset |
| `EXPO_PUBLIC_TERMS_URL` | `legal.ts:24` | **no** | `https://sportgang.netlify.app/terms/` | unset |
| `EXPO_PUBLIC_SUPPORT_URL` | `legal.ts:27` | **no** | `https://sportgang.netlify.app/support/` | unset |
| `EXPO_PUBLIC_API_URL` | `app.config.js:19`, `src/lib/api.ts:8` | yes: `eas.json` development, preview, production (preview/production https) | (presence only) | unset |

- The documented sources are `.env.example:76-78`, `apps/mobile/.env.example:67-69`,
  `apps/mobile/.env.staging.example:23-25`, `docs/release/APP_STORE_METADATA.md:216-218`
  and `apps/web/src/lib/links.ts:17-19`.
- Unset behaviour (`legal.ts`): each URL is `process.env.… ?? null`. `openLegal()` then
  shows the Alert "`<label>` not available / This link is not available yet. Please
  contact support." instead of opening a link, and there is no hard-coded fallback.
- Other public names the app reads (names only): `EXPO_PUBLIC_GOOGLE_MAPS_*`,
  `EXPO_PUBLIC_GOOGLE_REDIRECT_URI`, `EXPO_PUBLIC_SENTRY_DSN`.
- No local `.env` file exists in `apps/mobile/` or the root, so Expo CLI loads none.

APP_STORE_METADATA §8 states the three URLs "have been pinned on the EAS `preview`
and `production` environments". That claim lives in EAS remote state. It cannot be
verified from the repository, and verifying it needs `eas env:list`, which was not
run.

### App identity (as committed)

| Field | Value | Source |
|---|---|---|
| name / slug / version | `SportsGang` / `protin` / `1.0.0` | `app.config.js` |
| iOS `bundleIdentifier` | `com.edh1223.protin` (matches APP_STORE_METADATA §1) | `app.config.js` |
| iOS `buildNumber` | `1`. Not authoritative: `eas.json` `cli.appVersionSource: "remote"` with production `autoIncrement: true`, so EAS keeps the store build number | `app.config.js`, `eas.json` |
| Android `package` | `com.edh1223.protin` | `app.config.js` |
| `runtimeVersion` / `updates` | none (no OTA channel configured) | – |
| `owner` | none. The EAS project is identified only by `extra.eas.projectId` `b36f95b3-3757-4f7e-ab29-08da31cbb00f`. APP_STORE_METADATA names the project `@edwardh1234/protin`, which is not committed in config | `app.config.js` |
| `ascAppId` / `appleTeamId` | `6767027447` / `37C8A2733Y` (`ascAppId` matches the App Store link `id6767027447`) | `eas.json` `submit.production.ios` |
| Sentry Expo plugin | no `organization`/`project` committed. The export log warns and falls back to build-environment variables. Informational only: no document marks it a required release input | `app.config.js` |

No identity inconsistency was found.

### Locked build

| Item | Value |
|---|---|
| `npm ci` | `package-lock.json` sha256 `ce1eef03271dfd0ff02ef6ce9f666d328744065f4c0ebee83ef46f6da8ec7a23` (lockfileVersion 3). Locked `expo` 54.0.34 (SDK 54; declared `^54.0.34`), `react-native` 0.81.5, `react` 19.1.0 |
| `uv sync --frozen` | `apps/api/uv.lock` sha256 `5527d8521f09c8ffc2bdd734a3da8be0c989f2c6371d2600f121a9387feb71c4`, `requires-python >=3.12`, `.python-version` 3.12 |

### Source and export identity

`HEAD` is `68d8bcc10663b126affc461b1084a353d52b36ce`
(`fix/run-golf-v2-overnight-2026-10-05`). The last source commit is
`a515b0073cb0f32dad97f88430a203e3427444fe`, the candidate's final source. The
worktree is **not clean**: other overnight tasks have uncommitted work in it, for
example `apps/mobile/src/screens/chat/ChatScreen.tsx` and `apps/web/**`. The
preflight lists every such path with its hash. During this task `ChatScreen.tsx`
changed from `3925e008…` (at export time) to `ad1fb909…`.

| Export | Source | Bundle | Bundle sha256 | Export fingerprint |
|---|---|---|---|---|
| **clean HEAD** | `git archive HEAD` into scratch, with the worktree's `node_modules` cloned. `apps/` is identical to `a515b00`. | `_expo/static/js/ios/index-5e22a2d074c6cec04cacd5bb8506e913.hbc`, 4,415,686 B | `8404dbf70ff0a9ac6f82f0aa08255c4102ba3b4654b804e22cafb7d9c3f19e4b` | `7a2c5e62c385d3554f874b7941c08963045fb40c8a429e52c07ed789478fdb39` (8 files) |
| worktree (dirty) | `HEAD` plus uncommitted changes, including `ChatScreen.tsx` sha256 `3925e008dee2ff767bfdae3639b22ae96fd7f5799707907cdc14…` (full hash in the `.json`) | `index-5279208d55cf5542835e6a3374236e88.hbc`, 4,425,653 B | `36b257e2ac8776be8546bd76af5dab5bc63066dedbe74343e01ae1e6f728bb4c` | `c1f971a5d6baedcc8fbf35041e6a9fc8086e761fa9f8caee731b10ac97ef0366` |

- The clean-HEAD bundle has **the same file name and size (4.42 MB)** as the
  candidate's recorded export
  (`docs/run-golf-v2/release-candidate/evidence/logs/ios-export.log`). The name
  carries Expo's content hash, so the candidate's tested JS bundle is reproducible
  from committed source. The candidate did not record a sha256, so this comparison is
  by name and size.
- Neither export embeds any documented legal URL: the byte search finds none. A JS
  bundle exported without the three variables, which is how the candidate's was
  made, shows the "not available" Alert for Privacy, Terms and Support.
- The worktree export differs because it includes another task's in-progress chat
  change. This is the case the dirty-path hashes exist for: identify an export by
  the export fingerprint plus `HEAD` plus the dirty-file hashes.

### Missing release inputs (reported, not fatal)

1. `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_SUPPORT_URL`
   are not recorded in committed build config (eas.json `preview`/`production`). A
   store build gets them only from EAS remote environment variables or the build
   machine. This is not verifiable locally, and the repository does not record which
   values the shipped binary was built with. The documented values are listed
   above; nothing new is proposed here.
2. iOS signing certificate, provisioning profile and APNs key are EAS-managed (no
   `credentials.json` committed), so they are not verifiable locally.
3. The store build number is kept remotely by EAS (`appVersionSource: remote`), so it
   is not verifiable locally.

### Gates that cannot be satisfied locally

| Gate | Status | Where |
|---|---|---|
| Physical iPhone (and Android) test of the release build, incl. VoiceOver | NOT_RUN | needs a device |
| Signed store build (EAS) and TestFlight / App Store submission | NOT_RUN | EAS-managed signing, not local |
| Real Expo push service / APNs delivery | NOT_RUN | needs the provider and a device token |
| Production audit-timestamp provenance (R6) | OPEN / NOT_RUN | `../../morning-fixes/R6_C01_DEPLOYMENT_GATE.md` §3. Procedure validated on fixtures in [r6/R6_PROCEDURE_VALIDATION.md](r6/R6_PROCEDURE_VALIDATION.md) |
| Deployed API is exactly one process/machine serving WebSockets | PENDING / NOT_RUN | [TOPOLOGY_OPERATOR_CHECK.md](TOPOLOGY_OPERATOR_CHECK.md) |

## Tests

`python3 -m unittest scripts/release/test_preflight.py -v` ran **17 tests, OK**.
They build temporary fixture repositories and cover:

- consistent and missing-input results, and `--strict`;
- each kind of inconsistency;
- the legal values in this process: shown when URL-shaped, withheld otherwise, and
  flagged when they differ from the documented value;
- `.env` files listed by name with their contents never read;
- the export manifest and fingerprint, and the `<export-dir>` placeholder;
- the Sentry note;
- the sanitiser.

The canary tests put an unrelated secret-like variable, an `EXPO_PUBLIC_API_URL`, a
maps key and a DSN into the environment, then assert that none of their values
appear in text or JSON output. They do this for a fixture repository and for this
repository. A mutation check was also run: with the URL-shape gate and the sanitiser
disabled and the API value leaked into the report, the canary tests failed (2/2).

The new Python files were checked with `ruff check --select E,F,W,I,B
--line-length 120`. They are clean except for long lines inside the R6 runner's
embedded proof SQL string.
