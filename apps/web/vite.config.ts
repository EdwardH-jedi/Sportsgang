import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The Figma Make draft sits at apps/web/Protin Landing Page Design and is a
// separate Vite project we keep around as a visual reference. Exclude it so
// vite/tsc/tailwind never walk into it for the real site build.
const FIGMA_DRAFT = 'Protin Landing Page Design/**';

// The legal pages are static files copied from public/ into the build
// (privacy/index.html, terms/index.html, support/index.html). `vite preview`
// serves /privacy/ from that file, but its SPA fallback answers /privacy
// (no trailing slash) with the marketing page. This preview-only middleware
// runs before Vite's own and makes the legal routes deterministic:
//   - GET/HEAD /privacy, /terms, /support -> 301 to /privacy/ etc., query
//     string kept (the reference host, Netlify, answers the same way);
//   - any other path under a legal route with no file in the build -> 404,
//     never the marketing page.
// It changes `vite preview` only, not `vite dev` and not a production host;
// see apps/web/hosting/netlify/README.md. Checked by scripts/check-routes.mjs.
const LEGAL_ROUTES = ['/privacy', '/terms', '/support'];

function legalRoutesInPreview(): Plugin {
  return {
    name: 'sportsgang-legal-routes-preview',
    configurePreviewServer(server) {
      const outDir = path.resolve(server.config.root, server.config.build.outDir);
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const url = req.url ?? '/';
        const queryAt = url.indexOf('?');
        const query = queryAt === -1 ? '' : url.slice(queryAt);
        let pathname: string;
        try {
          pathname = decodeURIComponent(queryAt === -1 ? url : url.slice(0, queryAt));
        } catch {
          return next();
        }
        const route = LEGAL_ROUTES.find((r) => pathname === r || pathname.startsWith(`${r}/`));
        if (!route) return next();

        if (pathname === route) {
          // Location is built from the constant route, never from the request path.
          res.statusCode = 301;
          res.setHeader('Location', `${route}/${query}`);
          res.setHeader('Content-Length', '0');
          res.end();
          return;
        }

        const routeDir = path.join(outDir, route);
        const file = path.join(outDir, pathname, pathname.endsWith('/') ? 'index.html' : '');
        if (file.startsWith(routeDir + path.sep) && fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
          return next();
        }
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Not found\n');
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), legalRoutesInPreview()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    fs: {
      // Don't surface the draft folder when Vite serves files.
      deny: [FIGMA_DRAFT],
    },
  },
});
