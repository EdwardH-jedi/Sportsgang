# Hosting routes: Netlify (reference host `sportgang.netlify.app`)

**Status: unreviewed, not deployed.** Nothing in `apps/web/hosting/` is part
of the build: it is outside `public/`, so `npm run build` never copies it
into `dist/`. Copy `_redirects` into a publish directory only after review,
and only for a Netlify site.

## What every host must do for the legal pages

The app and the App Store record link to `/privacy/`, `/terms/` and
`/support/`. In the build these are static files (`dist/privacy/index.html`
etc., byte-for-byte copies of `public/`), and they load `../styles.css`.

| Request (GET or HEAD) | Required response |
|---|---|
| `/privacy`, `/terms`, `/support` | 301 or 308 to `/privacy/`, `/terms/`, `/support/`, query string kept, one hop |
| `/privacy/`, `/terms/`, `/support/` (with or without a query) | 200 with that folder's `index.html`, unchanged |
| `/styles.css` | 200 with `styles.css` |
| any other path under `/privacy/`, `/terms/`, `/support/` with no file | 404 |
| any legal path above | never the marketing page (`index.html`) |

The marketing page has no client-side routes (only `#` anchors), so it needs
no single-page-app fallback. Unknown paths can return 404.

## Netlify

`_redirects` here is intentionally **empty** (comments only):

- Observed on the reference host on 5 Oct 2026 (read-only requests,
  `curl` without following redirects). That site serves the separate
  official-website build (`apps/web/site` on `feature/sportgang-official-website`),
  which has no `_redirects` or `netlify.toml`:
  - `/privacy`, `/terms`, `/support` gave `301` with `Location: /privacy/`, `/terms/`, `/support/`.
  - `/privacy?x=1` gave `301` with `Location: /privacy/?x=1`.
  - `/privacy/` gave `200`.
  - Details: `docs/run-golf-v2/overnight-2026-10-05/evidence/web/routes-netlify-observed.json`.
- Netlify's docs ("Redirect options", trailing slash) say rules match "regardless
  of whether or not they contain a trailing slash", and that a rule redirecting
  a path to its own slash variant causes an infinite redirect. A rule for a path
  that has a file does not apply unless it is forced with `!` (shadowing).
- So `/privacy /privacy/ 301` would do nothing while `privacy/index.html`
  exists. It would loop if the file were missing or the rule forced.
- A forced catch-all such as `/* /index.html 200!` would replace the legal
  pages with the marketing page. It must not be added.

Not verified: whether a new Netlify site, or a change to its settings, keeps
the same 301. After any deploy, repeat the observation:

```bash
for p in /privacy /terms /support '/privacy?x=1' /privacy/ /terms/ /support/; do
  curl -sS -o /dev/null -w "$p %{http_code} %{redirect_url}\n" "https://<site>$p"
done
```

## Other hosts

Configure the 301s from the table yourself. Serve the `index.html` in each
legal folder for the slash form, and do not route `/privacy*`, `/terms*` or
`/support*` to the marketing `index.html`. Many static hosts do this by
default; check with the commands above.

## Local preview only

`apps/web/vite.config.ts` adds a `vite preview` middleware with the
behaviour in the table. It does not change `vite dev` or any production
host. `npm run check:routes -w @protin/web` (CI job `web`) runs it against
`dist/`. The same command checks that `_redirects` has no rule for a legal
route and no forced catch-all.
