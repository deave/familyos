import fs from 'node:fs';
import path from 'node:path';
import { createSeed } from './seed.js';

// Tiny JSON-file store. One family, one file, atomic writes.
export class Store {
  constructor(file) {
    this.file = file;
    this.state = null;
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      this.state = JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.state = createSeed();
      this.save();
    }
    return this.state;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // Run a mutation against the state and persist the result.
  // A handler that throws part-way must not leave half-applied edits in memory,
  // so the in-memory state is rolled back to the last persisted copy.
  update(fn) {
    let result;
    try {
      result = fn(this.state);
    } catch (err) {
      this.load();
      throw err;
    }
    this.save();
    return result;
  }
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
