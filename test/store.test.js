import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlobStore } from '../src/store.js';

// Stand-in for @vercel/blob: a store that is either private-capable or
// public-only. head() is the uncached metadata call, get() the private read.
function fakeBlobSdk({ publicOnly = false } = {}) {
  const objects = new Map(); // pathname -> { body, access, uploadedAt }
  const calls = [];
  const notFound = () => Object.assign(new Error('Vercel Blob: The requested blob does not exist'), { name: 'BlobNotFoundError' });
  return {
    objects,
    calls,
    head: async (pathname) => {
      calls.push(['head', pathname]);
      const o = objects.get(pathname);
      if (!o) throw notFound();
      return { pathname, access: o.access, uploadedAt: o.uploadedAt, url: `https://store.${o.access}.blob.vercel-storage.com/${pathname}` };
    },
    get: async (pathname, opts) => {
      calls.push(['get', pathname, opts]);
      const o = objects.get(pathname);
      if (!o || o.access !== opts.access) throw notFound();
      return { blob: { text: async () => o.body } };
    },
    put: async (pathname, body, opts) => {
      calls.push(['put', pathname, opts]);
      if (publicOnly && opts.access === 'private') throw new Error('Vercel Blob: This store does not support private access');
      objects.set(pathname, { body, access: opts.access, uploadedAt: new Date(Date.now() + objects.size) });
      return { pathname };
    },
  };
}

const publicFetch = (sdk) => async (url) => {
  const pathname = new URL(url).pathname.slice(1);
  const o = sdk.objects.get(pathname);
  return { ok: Boolean(o), status: o ? 200 : 404, text: async () => o.body };
};

function store(sdk) {
  const s = new BlobStore({ token: 'vercel_blob_rw_STORE_tok' });
  s.blob = sdk;
  s.fetch = publicFetch(sdk);
  return s;
}

test('BlobStore uses an unguessable pathname derived from the token', () => {
  const a = new BlobStore({ token: 'one' }), b = new BlobStore({ token: 'two' });
  assert.match(a.pathname, /^familyos\/[0-9a-f]{24}\/db\.json$/);
  assert.notEqual(a.pathname, b.pathname);
});

test('BlobStore seeds a private blob on an empty store, then reads and writes it', async () => {
  const sdk = fakeBlobSdk();
  const s = store(sdk);

  const state = await s.load();
  assert.ok(state.members.david);
  assert.equal(s.access, 'private');
  const [, , putOpts] = sdk.calls.find((c) => c[0] === 'put');
  assert.equal(putOpts.access, 'private');
  assert.equal(putOpts.allowOverwrite, true);
  assert.equal(putOpts.token, 'vercel_blob_rw_STORE_tok');

  await s.update((st) => { st.work.headline = 'From the cloud'; });
  assert.match(sdk.objects.get(s.pathname).body, /From the cloud/);

  // A second instance sees the first one's write, via the private read path.
  const other = store(sdk);
  const fresh = await other.refresh();
  assert.equal(fresh.work.headline, 'From the cloud');
  assert.ok(sdk.calls.some((c) => c[0] === 'get' && c[2].access === 'private' && c[2].useCache === false));
});

test('BlobStore falls back to a public blob when the store rejects private access', async () => {
  const sdk = fakeBlobSdk({ publicOnly: true });
  const s = store(sdk);
  await s.load();
  assert.equal(s.access, 'public');
  await s.update((st) => { st.work.headline = 'Public but secret path'; });

  const other = store(sdk);
  const fresh = await other.refresh();
  assert.equal(fresh.work.headline, 'Public but secret path');
  assert.equal(other.access, 'public');
  // Public reads never go through the SDK's cached get().
  assert.ok(!sdk.calls.some((c) => c[0] === 'get'));
});

test('BlobStore re-reads before mutating so instances do not clobber each other', async () => {
  const sdk = fakeBlobSdk();
  const a = store(sdk), b = store(sdk);
  await a.load();
  await b.load();

  await a.update((st) => { st.goals.push({ id: 'from-a', title: 'A', target: 1, current: 0 }); });
  await b.update((st) => { st.goals.push({ id: 'from-b', title: 'B', target: 1, current: 0 }); });

  const final = JSON.parse(sdk.objects.get(a.pathname).body);
  assert.ok(final.goals.some((g) => g.id === 'from-a'));
  assert.ok(final.goals.some((g) => g.id === 'from-b'));
});

test('BlobStore rolls back in-memory state when a mutation throws', async () => {
  const sdk = fakeBlobSdk();
  const s = store(sdk);
  await s.load();
  await assert.rejects(s.update((st) => { st.work.headline = 'half done'; throw new Error('nope'); }));
  assert.notEqual(s.state.work.headline, 'half done');
});

test('BlobStore surfaces other storage errors instead of hiding them', async () => {
  const sdk = fakeBlobSdk();
  sdk.head = async () => { throw new Error('Vercel Blob: Failed to fetch blob: 500 Internal Server Error'); };
  const s = store(sdk);
  await assert.rejects(s.load(), /500 Internal Server Error/);
});
