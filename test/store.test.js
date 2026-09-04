import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlobStore } from '../src/store.js';

// Stand-in for @vercel/blob: one private object, overwritten on every put.
function fakeBlobSdk() {
  const objects = new Map();
  const calls = [];
  return {
    objects,
    calls,
    get: async (pathname, opts) => {
      calls.push(['get', pathname, opts]);
      if (!objects.has(pathname)) return null;
      return { blob: { text: async () => objects.get(pathname) } };
    },
    put: async (pathname, body, opts) => {
      calls.push(['put', pathname, opts]);
      objects.set(pathname, body);
      return { pathname };
    },
  };
}

test('BlobStore seeds an empty store, then reads and writes the same blob', async () => {
  const sdk = fakeBlobSdk();
  const store = new BlobStore({ token: 'tok' });
  store.blob = sdk;

  const state = await store.load();
  assert.ok(state.members.david);
  assert.equal(sdk.objects.size, 1);
  const [, , putOpts] = sdk.calls.find((c) => c[0] === 'put');
  assert.equal(putOpts.access, 'private');
  assert.equal(putOpts.allowOverwrite, true);
  assert.equal(putOpts.token, 'tok');

  await store.update((s) => { s.work.headline = 'From the cloud'; });
  assert.match(sdk.objects.get('familyos/db.json'), /From the cloud/);

  // A second instance sees the first one's write.
  const other = new BlobStore({ token: 'tok' });
  other.blob = sdk;
  const fresh = await other.refresh();
  assert.equal(fresh.work.headline, 'From the cloud');
});

test('BlobStore re-reads before mutating so instances do not clobber each other', async () => {
  const sdk = fakeBlobSdk();
  const a = new BlobStore({ token: 'tok' });
  const b = new BlobStore({ token: 'tok' });
  a.blob = sdk; b.blob = sdk;
  await a.load();
  await b.load();

  await a.update((s) => { s.goals.push({ id: 'from-a', title: 'A', target: 1, current: 0 }); });
  await b.update((s) => { s.goals.push({ id: 'from-b', title: 'B', target: 1, current: 0 }); });

  const final = JSON.parse(sdk.objects.get('familyos/db.json'));
  assert.ok(final.goals.some((g) => g.id === 'from-a'));
  assert.ok(final.goals.some((g) => g.id === 'from-b'));
});

test('BlobStore rolls back in-memory state when a mutation throws', async () => {
  const sdk = fakeBlobSdk();
  const store = new BlobStore({ token: 'tok' });
  store.blob = sdk;
  await store.load();
  await assert.rejects(store.update((s) => { s.work.headline = 'half done'; throw new Error('nope'); }));
  assert.notEqual(store.state.work.headline, 'half done');
});
