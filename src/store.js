import fs from 'node:fs';
import path from 'node:path';
import { createSeed } from './seed.js';

// One family, one JSON document. Two backends share the same shape:
//   FileStore  – a file on disk (home server, local dev, or /tmp on serverless)
//   BlobStore  – a private Vercel Blob, re-read before every request so
//                several serverless instances never overwrite each other blindly.

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
}

export class BlobStore extends BaseStore {
  constructor({ pathname = 'familyos/db.json', token } = {}) {
    super();
    this.pathname = pathname;
    this.token = token;
    this.blob = null;
  }

  async sdk() {
    if (!this.blob) this.blob = await import('@vercel/blob');
    return this.blob;
  }

  async load() {
    const { get } = await this.sdk();
    const res = await get(this.pathname, { access: 'private', useCache: false, token: this.token });
    if (res && res.blob) {
      this.state = JSON.parse(await res.blob.text());
    } else {
      this.state = createSeed();
      await this.save();
    }
    return this.state;
  }

  async refresh() {
    return this.load();
  }

  async save() {
    const { put } = await this.sdk();
    await put(this.pathname, JSON.stringify(this.state), {
      access: 'private',
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: 'application/json',
      token: this.token,
    });
  }
}

// Kept for callers that only know the original name.
export const Store = FileStore;

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
