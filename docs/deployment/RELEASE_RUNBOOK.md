# Protin — Release Runbook

Command-by-command path from a green `main` to a TestFlight build, and
from TestFlight to the App Store.

Assumes:

- `flyctl` installed, `fly auth login` completed.
- `eas-cli` installed (`npm i -g eas-cli`), `eas login` completed.
- Apple Developer account enrolled; App Store Connect app record created.

---

## 1. Backend — Fly.io deploy

### First-time app creation

See `infra/fly/README.md` for the full bootstrap (postgres attach, redis,
secrets). Short version:

```bash
fly launch --no-deploy --copy-config --name protin-api --region syd
fly postgres create --name protin-pg --region syd
fly postgres attach protin-pg --app protin-api
fly redis create --name protin-redis --region syd
fly secrets set REDIS_URL="<url>" SECRET_KEY="<...>" FIELD_ENCRYPTION_KEY="<...>" \
  GOOGLE_CLIENT_ID="<...>" GOOGLE_CLIENT_SECRET="<...>" --app protin-api
fly deploy --app protin-api
fly ssh console -C 'alembic upgrade head' --app protin-api
```

Confirm:

```bash
curl -fsS https://protin-api.fly.dev/health
# {"status":"ok", ...}
```

### Subsequent deploys

```bash
# 1. From a clean main branch.
git pull --ff-only

# 2. Deploy the new image.
fly deploy --app protin-api

# 3. ALWAYS run migrations after every deploy. This step is unconditional
#    even when you do not think the release ships new revisions: skipping
#    it once cost us a production outage with relation "rank_profiles"
#    does not exist after the v1.1 cut, because /health stays green while
#    feature endpoints 500 against the stale schema.
fly ssh console -C 'alembic upgrade head' --app protin-api

# 4. Verify the DB matches the shipped image.
fly ssh console -C 'alembic current' --app protin-api
fly ssh console -C 'alembic heads' --app protin-api
# "current" must equal "heads"; otherwise feature endpoints will 500
# with UndefinedTableError even though /health reports db=ok.

# 5. Smoke the deploy.
curl -fsS https://protin-api.fly.dev/health
# {"status":"ok", ...}
```

### Post-deploy verification (every release)

After step 4 above, manually hit at least one endpoint backed by each
recently-added table so a missed migration surfaces immediately rather
than waiting for a real user. With an auth token in `$TOKEN`:

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://protin-api.fly.dev/events
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://protin-api.fly.dev/honors/me
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://protin-api.fly.dev/rankings/me?sport=tennis
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://protin-api.fly.dev/challenges
```

A 500 with `relation "..." does not exist` means migrations are stale --
re-run step 3 and then re-check `alembic current` vs `alembic heads`.

### Seed the venue catalog (first deploy, or when the DB has zero rows)

`/venues/nearby` reads the local `venues` table. If a deploy boots
against a fresh Postgres (or a wiped one) the table is empty and every
sport returns `items=[]` -- with Google Places potentially also
unavailable, the picker shows nothing in production. The seed reads
`/app/data/venues_sydney.json`, which the API Docker image now ships
via `COPY apps/api/data ./data`. The
`apps/api/tests/test_seed_venues.py` guard fails the build if that
path resolution or the data file regresses.

Run these four commands in order any time the `venues` table needs to
be (re)populated. Each is a one-shot, non-interactive `fly ssh console
-C` so it can be pasted into a runbook step:

```bash
# 1. Deploy the new API image (must include apps/api/data).
fly deploy -a protin-api

# 2. Apply migrations so the venues table exists at the latest schema.
fly ssh console -C 'alembic upgrade head' --app protin-api

# 3. Seed the venue catalog (idempotent; upserts by name+area).
fly ssh console \
  -C 'PYTHONPATH=/app /app/.venv/bin/python -m scripts.seed_venues' \
  --app protin-api
# expected stdout:
#   [seed_venues] inserted=<N> updated=0 total=<N>
# If you see "[seed_venues] No data file at /app/data/venues_sydney.json"
# the image is missing apps/api/data -- rebuild after confirming the
# Dockerfile still has `COPY apps/api/data ./data`.

# 4. Verify /venues/nearby returns real rows (route is auth-gated, so
#    unauthenticated curl returns 401 -- not the empty list).
TOKEN=...   # bearer token from a logged-in test account
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "https://protin-api.fly.dev/venues/nearby?sport=tennis&source=seed&limit=50"
```

**Expected response shape** (must satisfy all three):

- `total` > 0 (positive integer, matches the seeded count for the sport).
- `items` is a non-empty JSON array.
- Each element in `items` is a venue row carrying `name`, location
  fields (`latitude`/`longitude` and/or `area`/`address`), and sport
  data (`sport_tags` includes the requested sport). If `items` is `[]`
  the seed has not run against this DB yet -- re-run step 3.

Repeat step 4 for the other sport tabs (`gym`, `golf`, `running`) to
confirm coverage across the app's supported sports.

**No mobile rebuild required.** This recovery is purely a backend API
image and reference-data packaging fix. An EAS build, App Store
resubmission, or OTA update is **not** needed for the venue picker to
start showing rows again -- the mobile client calls
`/venues/nearby` unchanged. Only rebuild the mobile app if `apps/mobile`
code or native config (`app.config.js`, `eas.json`, native modules)
was separately modified in the same release.

#### Optional broader smoke checks

These belong to the general post-deploy verification above, not to
venue recovery. Run them in addition to step 4 if you also want to
flush any unrelated migration drift on the same release:

```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://protin-api.fly.dev/rankings/me?sport=tennis
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://protin-api.fly.dev/honors/me
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://protin-api.fly.dev/challenges
```

The Google Places provider is a *separate* code path. A `403` from
`places.googleapis.com` (logged as `Google Places non-200 ... status=403`)
does not affect seed results -- the seed fallback works even when the
Places key is missing or rejected. See
`docs/archive/release/GOOGLE_PLACES_RELEASE_QA.md` for the manual Places
checklist.

### Rollback

```bash
fly releases --app protin-api
fly deploy --image <previous-image-ref> --app protin-api
# If a migration shipped, roll it back manually:
fly ssh console -C 'alembic downgrade -1' --app protin-api
```

---

## 2. Mobile — EAS build to TestFlight

### Preflight (once per release)

1. Confirm `apps/mobile/eas.json` production `EXPO_PUBLIC_API_URL` points
   to the actual Fly hostname (default `https://protin-api.fly.dev`).
2. Confirm `apps/mobile/eas.json` `submit.production.ios.ascAppId` and
   `appleTeamId` are real values (placeholders will fail `eas submit`).
3. Confirm `apps/mobile/app.config.js` has `ios.bundleIdentifier` set.
   EAS will refuse to build otherwise.
4. Bump `expo.version` in `apps/mobile/app.config.js` if this is a
   user-visible release. `autoIncrement: true` handles build number.

### Build

```bash
cd apps/mobile

# Production iOS build (unsigned binary → signed by EAS using stored creds).
eas build --platform ios --profile production

# First time on a machine EAS will prompt to generate/upload signing
# credentials — accept the managed-credentials flow unless your team
# uses an external cert store.
```

Wait for the build to finish (link is printed; also visible at
`https://expo.dev/accounts/<org>/projects/protin/builds`).

### Submit to TestFlight

```bash
eas submit --platform ios --latest
```

This uploads the `.ipa` to App Store Connect. Apple's processing
typically completes in 5-30 minutes. Once processed, the build appears
under **App Store Connect → Your App → TestFlight**.

### Add internal testers

1. App Store Connect → TestFlight → Internal Testing → **+** next to a
   group → add the build.
2. Testers receive the invite email; they install via the TestFlight iOS
   app.

### Promote external testers (optional)

TestFlight → External Testing → add the build → fill out the test info
form → submit for Beta App Review (typically <24h).

---

## 3. Promoting from TestFlight to the App Store

1. App Store Connect → **App Store** tab → **+ Version or Platform** →
   enter the new version number (matches `expo.version`).
2. In the version screen:
   - **Build**: select the TestFlight build to promote.
   - Fill in What's New, screenshots (if changed), review notes.
3. **Save** → **Add for Review** → **Submit for Review**.
4. Apple review SLA is typically 24-48h. On approval, the release will
   be available in the App Store according to the release option chosen
   (manual release or automatic).

---

## 4. Post-release checks

```bash
# API health
curl -fsS https://protin-api.fly.dev/health

# Tail production logs for errors in the first 30 minutes
fly logs --app protin-api
```

If a regression is found:

- Backend: `fly deploy --image <prev>` (see rollback above).
- Mobile: pull the App Store version (Apple → "Remove from Sale"), or
  ship a patch build via TestFlight → promote.
