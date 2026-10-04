#!/usr/bin/env node
// Legal-route check for the SportsGang website.
//
// 1. Starts `vite preview` (this app's vite.config.ts, so the preview hook is
//    included) on an ephemeral port against the built dist/ and checks that
//    /privacy, /terms and /support redirect to their trailing-slash form,
//    that the slash forms serve the exact bytes of public/, and that no legal
//    route ever answers with the marketing page.
// 2. Repeats the "never the marketing page" check against a copy of dist/
//    with privacy/index.html removed.
// 3. Lints hosting/netlify/_redirects (unreviewed, not deployed) for rules
//    that would shadow, loop or replace the legal pages on Netlify.
//
// Run after the build:  npm run check:routes -w @protin/web
// Optional: --json <file> writes the observed responses (status, headers that
// matter, sha256 of bodies). Exits 1 on any failed check. Uses only Node and
// the Vite already installed for this app.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview, version as viteVersion } from 'vite';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(APP, 'dist');
const PUBLIC = path.join(APP, 'public');
const REDIRECTS = path.join(APP, 'hosting', 'netlify', '_redirects');
const LEGAL = ['privacy', 'terms', 'support'];
// What a browser sends for a navigation; Vite's HTML fallback keys off it.
const ACCEPT_HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const jsonAt = process.argv.indexOf('--json');
const jsonFile = jsonAt === -1 ? null : path.resolve(process.argv[jsonAt + 1] ?? '');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const results = [];
const failures = [];
function check(name, ok, detail = '') {
  results.push({ check: name, pass: Boolean(ok), ...(detail ? { detail } : {}) });
  if (!ok) failures.push(`${name}${detail ? ` (${detail})` : ''}`);
}

function request(port, urlPath, { method = 'GET', accept = ACCEPT_HTML } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: { accept } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(10_000, () => req.destroy(new Error(`timeout: ${method} ${urlPath}`)));
    req.on('error', reject);
    req.end();
  });
}

async function startPreview(outDir) {
  const server = await preview({
    root: APP,
    logLevel: 'silent',
    build: outDir ? { outDir } : undefined,
    preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
  });
  return { server, port: server.httpServer.address().port };
}

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`missing ${path.relative(APP, file)}; run the build first`);
  return fs.readFileSync(file);
}

const home = read(path.join(DIST, 'index.html'));
const expected = {};
for (const page of LEGAL) {
  expected[page] = read(path.join(PUBLIC, page, 'index.html'));
  check(`dist/${page}/index.html equals public/`, read(path.join(DIST, page, 'index.html')).equals(expected[page]));
}
const styles = read(path.join(PUBLIC, 'styles.css'));
check('dist/styles.css equals public/', read(path.join(DIST, 'styles.css')).equals(styles));

const isHome = (body) => body.equals(home) || body.includes('<div id="root">');
function describeBody(body) {
  if (body.length === 0) return 'empty';
  if (isHome(body)) return 'marketing home page';
  for (const page of LEGAL) if (body.equals(expected[page])) return `public/${page}/index.html`;
  if (body.equals(styles)) return 'public/styles.css';
  return 'other';
}

const observed = [];
async function probe(port, urlPath, opts = {}, label = 'dist') {
  const r = await request(port, urlPath, opts);
  observed.push({
    build: label,
    request: `${opts.method ?? 'GET'} ${urlPath}`,
    accept: opts.accept ?? ACCEPT_HTML,
    status: r.status,
    location: r.headers.location ?? null,
    contentType: r.headers['content-type'] ?? null,
    bytes: r.body.length,
    sha256: sha256(r.body),
    body: describeBody(r.body),
  });
  return r;
}

const run = async () => {
  // 1. The real build.
  const { server, port } = await startPreview();
  try {
    const root = await probe(port, '/');
    check('/ -> 200 marketing page', root.status === 200 && root.body.equals(home), `status ${root.status}`);

    for (const page of LEGAL) {
      for (const method of ['GET', 'HEAD']) {
        const r = await probe(port, `/${page}`, { method });
        check(
          `${method} /${page} -> 301 /${page}/`,
          r.status === 301 && r.headers.location === `/${page}/` && !isHome(r.body),
          `status ${r.status}, location ${r.headers.location}`
        );
      }
      const curlLike = await probe(port, `/${page}`, { accept: '*/*' });
      check(`/${page} (Accept */*) -> 301 /${page}/`, curlLike.status === 301 && curlLike.headers.location === `/${page}/`);

      for (const p of [`/${page}/`, `/${page}/index.html`]) {
        const r = await probe(port, p);
        check(
          `${p} -> 200 exact bytes of public/${page}/index.html`,
          r.status === 200 && /^text\/html/.test(r.headers['content-type'] ?? '') && r.body.equals(expected[page]),
          `status ${r.status}, ${describeBody(r.body)}`
        );
      }
      const missing = await probe(port, `/${page}/no-such-file`);
      check(`/${page}/no-such-file -> 404, not the marketing page`, missing.status === 404 && !isHome(missing.body));
    }

    const q = await probe(port, '/privacy?x=1');
    check('/privacy?x=1 -> 301 /privacy/?x=1', q.status === 301 && q.headers.location === '/privacy/?x=1', `location ${q.headers.location}`);
    if (q.headers.location) {
      const next = await probe(port, q.headers.location);
      check(
        'following /privacy?x=1 reaches the privacy page in one hop',
        next.status === 200 && next.body.equals(expected.privacy),
        `status ${next.status}, ${describeBody(next.body)}`
      );
    }

    const css = await probe(port, '/styles.css', { accept: 'text/css,*/*;q=0.1' });
    check(
      '/styles.css -> 200 exact bytes of public/styles.css',
      css.status === 200 && /^text\/css/.test(css.headers['content-type'] ?? '') && css.body.equals(styles),
      `status ${css.status}`
    );
  } finally {
    await server.close();
  }

  // 2. A build that lost a legal page must fail loudly, not show the home page.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sportsgang-routes-'));
  try {
    fs.cpSync(DIST, tmp, { recursive: true });
    fs.rmSync(path.join(tmp, 'privacy', 'index.html'));
    const broken = await startPreview(tmp);
    try {
      const r = await probe(broken.port, '/privacy/', {}, 'dist without privacy/index.html');
      check('build without privacy/index.html: /privacy/ -> 404, not the marketing page', r.status === 404 && !isHome(r.body), `status ${r.status}, ${describeBody(r.body)}`);
    } finally {
      await broken.server.close();
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // 3. hosting/netlify/_redirects (Netlify syntax: from to [status[!]] [conditions]).
  const lines = fs.readFileSync(REDIRECTS, 'utf8').split('\n');
  const rules = [];
  lines.forEach((line, i) => {
    const text = line.replace(/#.*$/, '').trim();
    if (!text) return;
    const [from, to, status = '301'] = text.split(/\s+/);
    const parsed = Boolean(from && to && /^(\/|https?:\/\/)/.test(from) && /^\d{3}!?$/.test(status));
    check(`_redirects line ${i + 1} parses`, parsed, text);
    if (parsed) rules.push({ line: i + 1, from, to, status, forced: status.endsWith('!') });
  });
  const legalPath = (from) => LEGAL.some((page) => from.replace(/\/+$/, '') === `/${page}`);
  const catchAll = (from) => from === '/*' || /^\/[:*]/.test(from);
  for (const r of rules) {
    // Netlify matches rules with or without a trailing slash: a rule for a
    // legal route is shadowed by its file or loops.
    check(`_redirects line ${r.line} does not target a legal route`, !legalPath(r.from), `${r.from} ${r.to} ${r.status}`);
    check(`_redirects line ${r.line} is not a forced catch-all`, !(catchAll(r.from) && r.forced), `${r.from} ${r.to} ${r.status}`);
  }
  check('_redirects is outside public/ (does not ship with the build)', !fs.existsSync(path.join(PUBLIC, '_redirects')) && !fs.existsSync(path.join(DIST, '_redirects')));
  return rules.length;
};

const timer = setTimeout(() => {
  console.error('check-routes: timed out after 60 s');
  process.exit(1);
}, 60_000);

let ruleCount = null;
try {
  ruleCount = await run();
} catch (err) {
  failures.push(`error: ${err instanceof Error ? err.message : String(err)}`);
}
clearTimeout(timer);

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}${r.pass || !r.detail ? '' : `  [${r.detail}]`}`);
if (jsonFile) {
  const out = {
    tool: `apps/web/scripts/check-routes.mjs, Node ${process.version}, Vite ${viteVersion} preview, node:http client`,
    homeSha256: sha256(home),
    netlifyRedirectRules: ruleCount,
    results,
    responses: observed,
  };
  fs.writeFileSync(jsonFile, `${JSON.stringify(out, null, 2)}\n`);
}
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} route checks passed.`);
process.exit(0);
