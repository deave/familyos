import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore, BlobStore } from './src/store.js';
import { buildRoutes } from './src/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : headers['Content-Type'] || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limit = 64 * 1024) {
  // Some hosts (Vercel) parse JSON bodies before the handler runs.
  if (req.body !== undefined && typeof req.body !== 'string') return Promise.resolve(req.body ?? {});
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const finish = (raw) => {
      if (!raw.length) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('body must be JSON'), { status: 400 }));
      }
    };
    if (typeof req.body === 'string') return finish(req.body);
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Optional shared password: set PORTAL_PASSWORD to require it (HTTP basic auth).
function authorized(req, password) {
  if (!password) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const given = decoded.slice(decoded.indexOf(':') + 1);
  return given === password;
}

function serveStatic(req, res, urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(PUBLIC_DIR, clean === path.sep || clean === '/' ? 'index.html' : clean);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'forbidden');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // Single-page app: unknown paths render the shell.
    file = path.join(PUBLIC_DIR, 'index.html');
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'max-age=300',
  });
  fs.createReadStream(file).pipe(res);
}

// What the browser (or you, in a tab) can use to see why a deployment is
// unhappy: which backend is active, whether it can be read, and which
// environment variables are present. Never includes secret values.
async function health(store, deployment) {
  const storage = { ok: false, error: null, ...store.describe() };
  try {
    const s = await store.refresh();
    storage.ok = Boolean(s && s.members);
    storage.members = s ? Object.keys(s.members) : [];
  } catch (err) {
    storage.error = err.message;
  }
  return {
    ok: storage.ok,
    node: process.version,
    deployment,
    storage,
    env: {
      vercel: Boolean(process.env.VERCEL),
      region: process.env.VERCEL_REGION || null,
      hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      hasPassword: Boolean(process.env.PORTAL_PASSWORD),
    },
  };
}

// Picks the storage backend from the environment:
//   BLOB_READ_WRITE_TOKEN set  -> private Vercel Blob (durable on serverless)
//   explicit dataFile          -> that file
//   running on Vercel          -> /tmp (works, but is wiped between instances)
//   otherwise                  -> data/db.json next to this file
export function createStore({ dataFile, blobToken = process.env.BLOB_READ_WRITE_TOKEN } = {}) {
  if (blobToken) return { store: new BlobStore({ token: blobToken }), ephemeral: false, backend: 'blob' };
  if (dataFile) return { store: new FileStore(dataFile), ephemeral: false, backend: 'file' };
  if (process.env.VERCEL) {
    return { store: new FileStore(path.join(os.tmpdir(), 'familyos-db.json')), ephemeral: true, backend: 'tmp' };
  }
  return { store: new FileStore(path.join(__dirname, 'data', 'db.json')), ephemeral: false, backend: 'file' };
}

// A plain (req, res) handler, usable by node:http and by serverless hosts.
export function createHandler({ dataFile, password, blobToken } = {}) {
  const { store, ephemeral, backend } = createStore({ dataFile, blobToken });
  const onVercel = Boolean(process.env.VERCEL);
  const deployment = { ephemeral, backend, unprotected: onVercel && !password, hosted: onVercel };
  const api = buildRoutes(store, deployment);

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    // Hosts that rewrite /api/* to this function pass the original path along.
    const pathname = url.searchParams.get('__path') || url.pathname;

    if (!authorized(req, password)) {
      return send(res, 401, 'Sign in to the family portal', {
        'WWW-Authenticate': 'Basic realm="FamilyOS"',
      });
    }

    if (pathname === '/api/health') return send(res, 200, await health(store, deployment));

    if (pathname.startsWith('/api/')) {
      try {
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : null;
        const out = await api.dispatch(req.method, pathname, body);
        if (!out) return send(res, 404, { error: 'not found' });
        return send(res, out.status, out.body);
      } catch (err) {
        const status = err.status || 500;
        if (status === 500) console.error(err);
        const message = status === 500 ? `Server error: ${err.message || 'something went wrong'}` : err.message;
        return send(res, status, { error: message });
      }
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return serveStatic(req, res, pathname);
  };
}

export function createApp(opts = {}) {
  return http.createServer(createHandler(opts));
}

// Hosts that load this file as a function entry point (Vercel treats a
// package.json "main" as the app when it sees one) call this default export.
// It is lazy and never throws: a failure anywhere comes back as JSON with the
// real message instead of an opaque platform crash page.
let lazy = null;
export default async function entry(req, res) {
  try {
    if (!lazy) lazy = createHandler({ dataFile: process.env.DATA_FILE, password: process.env.PORTAL_PASSWORD });
    await lazy(req, res);
  } catch (err) {
    lazy = null;
    console.error(err);
    if (!res.headersSent) {
      send(res, 500, { error: `Server error: ${err.message}`, stack: String(err.stack || '').split('\n').slice(0, 4) });
    } else {
      res.end();
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  const app = createApp({ dataFile: process.env.DATA_FILE, password: process.env.PORTAL_PASSWORD });
  app.listen(port, host, () => {
    console.log(`FamilyOS is listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    if (!process.env.PORTAL_PASSWORD) {
      console.log('Tip: set PORTAL_PASSWORD to require a shared password.');
    }
  });
}
