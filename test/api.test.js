import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

let server, base, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'familyos-'));
  server = createApp({ dataFile: path.join(dir, 'db.json') });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

const call = async (method, p, body) => {
  const res = await fetch(base + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('serves the app shell and static files', async () => {
  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /FamilyOS/);
  const js = await fetch(base + '/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  const deep = await fetch(base + '/some/client/route');
  assert.equal(deep.status, 200);
});

test('state is seeded with two members, finances, work and goals', async () => {
  const { status, body } = await call('GET', '/api/state');
  assert.equal(status, 200);
  assert.ok(body.members.david && body.members.partner);
  assert.ok(Array.isArray(body.finances.transactions));
  assert.ok(Array.isArray(body.work.projects));
  assert.ok(Array.isArray(body.goals));
  assert.ok(body.options.personality.includes('warm'));
});

test('avatars can be customised, invalid options rejected', async () => {
  const ok = await call('PUT', '/api/members/partner', { name: 'Anna', avatar: { hair: 'curly', personality: 'playful' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.name, 'Anna');
  assert.equal(ok.body.avatar.hair, 'curly');
  assert.equal(ok.body.avatar.personality, 'playful');

  const bad = await call('PUT', '/api/members/partner', { avatar: { hair: 'mohawk' } });
  assert.equal(bad.status, 400);

  const missing = await call('PUT', '/api/members/nobody', { name: 'x' });
  assert.equal(missing.status, 404);
});

test('messages travel between members, get read and reacted to', async () => {
  const sent = await call('POST', '/api/messages', { from: 'david', to: 'partner', kind: 'feeling', soft: true, text: 'I missed you today.' });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.readAt, null);
  assert.equal(sent.body.soft, true);

  const read = await call('PATCH', `/api/messages/${sent.body.id}`, { read: true, reaction: 'heart' });
  assert.equal(read.status, 200);
  assert.ok(read.body.readAt);
  assert.equal(read.body.reaction, 'heart');

  const self = await call('POST', '/api/messages', { from: 'david', to: 'david', text: 'hi' });
  assert.equal(self.status, 400);
  const empty = await call('POST', '/api/messages', { from: 'david', to: 'partner', text: '   ' });
  assert.equal(empty.status, 400);

  const del = await call('DELETE', `/api/messages/${sent.body.id}`);
  assert.equal(del.status, 200);
  const gone = await call('PATCH', `/api/messages/${sent.body.id}`, { read: true });
  assert.equal(gone.status, 404);
});

test('logging money moves the balance and can be undone', async () => {
  const before = (await call('GET', '/api/state')).body.finances.balance;
  const tx = await call('POST', '/api/finances/transactions', { label: 'Coffee', amount: 120, category: 'Fun' });
  assert.equal(tx.status, 200);
  assert.equal(tx.body.type, 'expense');
  let f = (await call('GET', '/api/state')).body.finances;
  assert.equal(f.balance, before - 120);

  const income = await call('POST', '/api/finances/transactions', { label: 'Salary', amount: 1000, type: 'income' });
  f = (await call('GET', '/api/state')).body.finances;
  assert.equal(f.balance, before - 120 + 1000);

  await call('DELETE', `/api/finances/transactions/${tx.body.id}`);
  await call('DELETE', `/api/finances/transactions/${income.body.id}`);
  f = (await call('GET', '/api/state')).body.finances;
  assert.equal(f.balance, before);

  const bad = await call('POST', '/api/finances/transactions', { label: 'Nope', amount: -5 });
  assert.equal(bad.status, 400);
});

test('finance settings validate', async () => {
  const ok = await call('PUT', '/api/finances', { currency: 'eur', monthlyBudget: 2500, balance: 9000 });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.currency, 'EUR');
  assert.equal(ok.body.monthlyBudget, 2500);
  const bad = await call('PUT', '/api/finances', { monthlyBudget: 'lots' });
  assert.equal(bad.status, 400);
});

test('work projects carry progress and updates', async () => {
  const p = await call('POST', '/api/work/projects', { title: 'Garden', heading: 'A place to sit outside', progress: 10 });
  assert.equal(p.status, 200);
  const u = await call('POST', `/api/work/projects/${p.body.id}/updates`, { text: 'Bought the seeds', progress: 25 });
  assert.equal(u.status, 200);
  assert.equal(u.body.progress, 25);
  assert.equal(u.body.updates[0].text, 'Bought the seeds');

  const edit = await call('PATCH', `/api/work/projects/${p.body.id}`, { status: 'done', progress: 100 });
  assert.equal(edit.body.status, 'done');
  const bad = await call('PATCH', `/api/work/projects/${p.body.id}`, { progress: 140 });
  assert.equal(bad.status, 400);

  const del = await call('DELETE', `/api/work/projects/${p.body.id}`);
  assert.equal(del.status, 200);
});

test('a failed mutation leaves no half-applied edits', async () => {
  const p = await call('POST', '/api/work/projects', { title: 'Keep me' });
  const bad = await call('PATCH', `/api/work/projects/${p.body.id}`, { title: 'Renamed', status: 'exploded' });
  assert.equal(bad.status, 400);
  const after = (await call('GET', '/api/state')).body.work.projects.find((x) => x.id === p.body.id);
  assert.equal(after.title, 'Keep me');
});

test('goals track progress', async () => {
  const g = await call('POST', '/api/goals', { title: 'Read together', unit: 'books', target: 5, current: 1 });
  assert.equal(g.status, 200);
  const bump = await call('PATCH', `/api/goals/${g.body.id}`, { current: 3 });
  assert.equal(bump.body.current, 3);
  const bad = await call('POST', '/api/goals', { target: 3 });
  assert.equal(bad.status, 400);
  await call('DELETE', `/api/goals/${g.body.id}`);
});

test('state survives a restart', async () => {
  await call('PUT', '/api/work', { headline: 'Persisted headline' });
  const again = createApp({ dataFile: path.join(dir, 'db.json') });
  await new Promise((r) => again.listen(0, '127.0.0.1', r));
  const res = await fetch(`http://127.0.0.1:${again.address().port}/api/state`);
  const body = await res.json();
  await new Promise((r) => again.close(r));
  assert.equal(body.work.headline, 'Persisted headline');
});

test('rewritten requests use the original path from __path', async () => {
  const res = await fetch(base + '/api/index?__path=/api/state');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.members.david);
  assert.equal(body.deployment.ephemeral, false);
});

test('optional shared password protects everything', async () => {
  const locked = createApp({ dataFile: path.join(dir, 'locked.json'), password: 'secret' });
  await new Promise((r) => locked.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${locked.address().port}`;
  const denied = await fetch(url + '/api/state');
  assert.equal(denied.status, 401);
  const allowed = await fetch(url + '/api/state', {
    headers: { Authorization: 'Basic ' + Buffer.from('family:secret').toString('base64') },
  });
  assert.equal(allowed.status, 200);
  await new Promise((r) => locked.close(r));
});

test('server.js default export serves the app as a single function entry', async () => {
  process.env.DATA_FILE = path.join(dir, 'entry.json');
  const { default: entry } = await import('../server.js');
  const srv = http.createServer((req, res) => { entry(req, res); });
  await new Promise((r) => srv.listen(0, r));
  const url = `http://localhost:${srv.address().port}`;
  const home = await fetch(url + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /FamilyOS/);
  const state = await fetch(url + '/api/state');
  assert.equal(state.status, 200);
  assert.ok((await state.json()).members.david);
  srv.close();
});
