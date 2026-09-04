import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createSeed } from './seed.js';

// One family, one JSON document. Two backends share the same shape:
//   FileStore  – a file on disk (home server, local dev, or /tmp on serverless)
//   BlobStore  – a Vercel Blob, re-read before every request so several
//                serverless instances never overwrite each other blindly.

class BaseStore {
  constructor() {
    this.state = null;
  }

  // Bring this.state up to date with what is persisted.
  async refresh() {
    return this.state;
  }

  // Run a mutation against the state and persist the result. A handler that
  // throws part-way must not leave half-applied edits in memory, so the state
  // is rolled back to the last persisted copy.
  async update(fn) {
    await this.refresh();
    let result;
    try {
      result = fn(this.state);
    } catch (err) {
      await this.refresh();
      throw err;
    }
    await this.save();
    return result;
  }

  // Human-readable description for the health endpoint.
  describe() {
    return { backend: 'memory' };
  }
}

export class FileStore extends BaseStore {
  constructor(file) {
    super();
    this.file = file;
  }

  async load() {
    try {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.state = createSeed();
      await this.save();
    }
    return this.state;
  }

  async refresh() {
    if (!this.state) await this.load();
    return this.state;
  }

  async save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // Rolling back means re-reading the file, so refresh must not trust memory.
  async update(fn) {
    await this.load();
    let result;
    try {
      result = fn(this.state);
    } catch (err) {
      await this.load();
      throw err;
    }
    await this.save();
    return result;
  }

  describe() {
    return { backend: 'file', file: this.file };
  }
}

// The document lives at a pathname only the token holder can derive, so even
// on a public store the URL is not guessable.
function secretPathname(token) {
  const key = createHash('sha256').update(String(token)).digest('hex').slice(0, 24);
  return `familyos/${key}/db.json`;
}

export class BlobStore extends BaseStore {
  constructor({ pathname, token, access } = {}) {
    super();
    this.token = token;
    this.pathname = pathname || secretPathname(token);
    // 'private' | 'public' | null (nothing stored yet)
    this.access = access || null;
    this.blob = null;
    this.fetch = globalThis.fetch;
  }

  async sdk() {
    if (!this.blob) this.blob = await import('@vercel/blob');
    return this.blob;
  }

  // Metadata comes from the API (never cached) and tells us which access mode
  // the store uses; null when nothing has been written yet.
  async meta() {
    const { head } = await this.sdk();
    try {
      return await head(this.pathname, { token: this.token });
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async put(access) {
    const { put } = await this.sdk();
    await put(this.pathname, JSON.stringify(this.state), {
      access,
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
      token: this.token,
    });
    this.access = access;
  }

  // First write: prefer a private blob, fall back to public on stores that
  // do not support private access (the pathname is unguessable either way).
  async create() {
    try {
      await this.put('private');
    } catch (err) {
      if (isNotFound(err) || isAccessProblem(err)) await this.put('public');
      else throw err;
    }
  }

  async load() {
    const meta = await this.meta();
    if (!meta) {
      this.state = createSeed();
      await this.create();
      return this.state;
    }
    this.access = meta.access === 'public' ? 'public' : 'private';
    let text;
    if (this.access === 'private') {
      const { get } = await this.sdk();
      const res = await get(this.pathname, { access: 'private', useCache: false, token: this.token });
      if (!res || !res.blob) throw new Error('blob vanished between head and get');
      text = await res.blob.text();
    } else {
      // Public blobs are served through a CDN; keying the URL on the upload
      // time guarantees we never read a stale copy.
      const url = new URL(meta.url);
      url.searchParams.set('v', String(new Date(meta.uploadedAt || Date.now()).getTime()));
      const r = await this.fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`blob fetch failed: ${r.status}`);
      text = await r.text();
    }
    this.state = JSON.parse(text);
    return this.state;
  }

  async refresh() {
    return this.load();
  }

  async save() {
    if (!this.access) await this.create();
    else await this.put(this.access);
  }

  describe() {
    return { backend: 'blob', access: this.access, pathname: this.pathname };
  }
}

function isAccessProblem(err) {
  return /access|private|public|forbidden|403|400/i.test((err && err.message) || '');
}

function isNotFound(err) {
  return err && (err.name === 'BlobNotFoundError' || /not.?found|404/i.test(err.message || ''));
}

// Kept for callers that only know the original name.
export const Store = FileStore;

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
