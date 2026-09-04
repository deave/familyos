import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './src/store.js';
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
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('body must be JSON'), { status: 400 }));
      }
    });
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

export function createApp({ dataFile, password } = {}) {
  const store = new Store(dataFile || path.join(__dirname, 'data', 'db.json'));
  store.load();
  const api = buildRoutes(store);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (!authorized(req, password)) {
      return send(res, 401, 'Sign in to the family portal', {
        'WWW-Authenticate': 'Basic realm="FamilyOS"',
      });
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : null;
        const out = api.dispatch(req.method, url.pathname, body);
        if (!out) return send(res, 404, { error: 'not found' });
        return send(res, out.status, out.body);
      } catch (err) {
        const status = err.status || 500;
        if (status === 500) console.error(err);
        return send(res, status, { error: status === 500 ? 'something went wrong' : err.message });
      }
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return serveStatic(req, res, url.pathname);
  });
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
