import { renderAvatar, PALETTE, LABELS, PERSONALITY_BLURBS } from './avatar.js';
import * as voice from './voice.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let state = null;
let me = localStorage.getItem('familyos.me') || 'partner';
let route = (location.hash.slice(1) || 'home').split('?')[0];
const ui = { draftAvatar: null, draftName: null, editing: null, toast: null };

const app = document.getElementById('app');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function reload() {
  state = await api('GET', '/api/state');
  if (!state.members[me]) me = Object.keys(state.members)[0];
  render();
}

async function act(fn, okMessage) {
  try {
    await fn();
    await reload();
    if (okMessage) toast(okMessage);
  } catch (err) {
    toast(err.message, true);
  }
}

function toast(text, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.className = `toast show ${isError ? 'error' : ''}`;
  clearTimeout(ui.toast);
  ui.toast = setTimeout(() => (el.className = 'toast'), 2800);
}

function fmtMoney(n, { compact = false } = {}) {
  const cur = state.finances.currency || 'USD';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: compact ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString()} ${cur}`;
  }
}

const fmtNum = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

function fmtDate(iso, withTime = false) {
  const d = new Date(iso);
  const opts = { day: 'numeric', month: 'short' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString(undefined, opts);
}

function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return fmtDate(iso);
}

const other = () => state.members[me === 'david' ? 'partner' : 'david'] || Object.values(state.members).find((m) => m.id !== me);
const self = () => state.members[me];
const av = (member, size, cls = '') => renderAvatar(member.avatar, { size, className: cls });

const unreadFor = (id) => state.messages.filter((m) => m.to === id && !m.readAt);

// ---------------------------------------------------------------------------
// Finance maths
// ---------------------------------------------------------------------------
function financeSummary() {
  const f = state.finances;
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const day = now.getDate();
  const inMonth = f.transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === y && d.getMonth() === mo;
  });
  const expenses = inMonth.filter((t) => t.type !== 'income');
  const spent = expenses.reduce((s, t) => s + t.amount, 0);
  const income = inMonth.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const byCat = {};
  for (const t of expenses) byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  const byCategory = Object.entries(byCat)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const daily = [];
  let cum = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dayTotal = expenses.filter((t) => new Date(t.date).getDate() === d).reduce((s, t) => s + t.amount, 0);
    cum += dayTotal;
    daily.push({ day: d, amount: dayTotal, cumulative: d <= day ? cum : null });
  }
  return {
    budget: f.monthlyBudget,
    balance: f.balance,
    spent,
    income,
    left: f.monthlyBudget - spent,
    daysInMonth,
    day,
    daysLeft: daysInMonth - day,
    spentPct: f.monthlyBudget > 0 ? (spent / f.monthlyBudget) * 100 : 0,
    pacePct: (day / daysInMonth) * 100,
    byCategory,
    daily,
    monthName: now.toLocaleString(undefined, { month: 'long' }),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const NAV = [
  { id: 'home', label: 'Home', icon: '🏡' },
  { id: 'talk', label: 'Talk', icon: '💬' },
  { id: 'money', label: 'Money', icon: '💰' },
  { id: 'work', label: 'Work', icon: '🛠️' },
  { id: 'goals', label: 'Goals', icon: '🌱' },
  { id: 'studio', label: 'My avatar', icon: '🎨' },
];

function render() {
  if (!state) return;
  const unread = unreadFor(me).length;
  const views = { home, talk, money, work, goals, studio };
  const view = views[route] || home;
  app.innerHTML = `
    <header class="top">
      <a class="brand" href="#home"><span class="brand-mark">◐</span> FamilyOS</a>
      <nav class="nav">
        ${NAV.map(
          (n) => `<a href="#${n.id}" class="${route === n.id ? 'active' : ''}">
            <span class="nav-icon">${n.icon}</span><span>${n.label}</span>
            ${n.id === 'talk' && unread ? `<span class="badge">${unread}</span>` : ''}
          </a>`
        ).join('')}
      </nav>
      <button class="who" data-action="switch-user" title="Switch who is using the portal">
        ${av(self(), 32)}<span class="who-name">${esc(self().name)}</span><span class="who-caret">⇄</span>
      </button>
    </header>
    ${deploymentNotice()}
    <main class="view view-${route}">${view()}</main>
  `;
  document.title = unread ? `(${unread}) FamilyOS` : 'FamilyOS';
  afterRender();
}

// Shown only on a hosted deployment that still needs its one-time setup.
function deploymentNotice() {
  const d = state.deployment || {};
  const items = [];
  if (d.unprotected) items.push('<strong>Anyone with the link can open this.</strong> Set a <code>PORTAL_PASSWORD</code> environment variable on the host and redeploy before entering real numbers.');
  if (d.ephemeral) items.push('<strong>Nothing is saved yet.</strong> Connect a Vercel Blob store to the project (Storage → Create → Blob, then redeploy) and everything will persist.');
  if (!items.length) return '';
  return `<aside class="setup-notice" role="note">${items.map((i) => `<p>${i}</p>`).join('')}</aside>`;
}

function afterRender() {
  document.querySelectorAll('[data-chart="daily"]').forEach(wireDailyChart);
  const focusEl = document.querySelector('[data-autofocus]');
  if (focusEl) focusEl.focus();
}

// --- Home -------------------------------------------------------------------
function home() {
  const meM = self(), you = other();
  const fin = financeSummary();
  const unread = unreadFor(me);
  const lines = voice.greeting(meM, you, { unread: unread.length, ...fin });
  const active = state.work.projects.filter((p) => p.status === 'active');
  const top = [...active].sort((a, b) => b.progress - a.progress)[0] || state.work.projects[0];
  const latestUpdate = state.work.projects
    .flatMap((p) => p.updates.map((u) => ({ ...u, project: p.title })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const goalsDone = state.goals.filter((g) => g.current >= g.target).length;

  return `
    <section class="hero card">
      <div class="hero-avatar">${av(meM, 148, 'talking')}</div>
      <div class="bubble bubble-hero">
        ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
      </div>
    </section>

    <section class="stack">
      <h2 class="section-title">${unread.length ? `Notes ${esc(you.name)} left for you` : `Nothing waiting from ${esc(you.name)}`}</h2>
      ${unread.length ? unread.map((m) => noteCard(m, { showReactions: true })).join('') : `
        <p class="muted">When ${esc(you.name)} writes something, your avatar will deliver it here — in its own words.
        <a href="#talk">Say something first?</a></p>`}
    </section>

    <section class="tiles">
      <a href="#money" class="tile card">
        <span class="tile-label">Left in ${esc(fin.monthName)}'s budget</span>
        <span class="tile-value ${fin.left < 0 ? 'neg' : ''}">${fmtMoney(fin.left, { compact: true })}</span>
        <span class="tile-sub">${fmtMoney(fin.spent, { compact: true })} spent · ${fin.daysLeft} days to go</span>
        ${meter(fin.spentPct, fin.pacePct, { small: true })}
      </a>
      <a href="#money" class="tile card">
        <span class="tile-label">Money we have</span>
        <span class="tile-value ${fin.balance < 0 ? 'neg' : ''}">${fmtMoney(fin.balance, { compact: true })}</span>
        <span class="tile-sub">after everything logged so far</span>
      </a>
      <a href="#work" class="tile card">
        <span class="tile-label">${esc(state.members.david.name)}'s work</span>
        ${top ? `<span class="tile-value">${top.progress}%</span><span class="tile-sub">${esc(top.title)}</span>${bar(top.progress)}` : `<span class="tile-sub">No projects yet</span>`}
      </a>
      <a href="#goals" class="tile card">
        <span class="tile-label">Family goals</span>
        <span class="tile-value">${goalsDone}<span class="tile-of">/${state.goals.length}</span></span>
        <span class="tile-sub">reached</span>
      </a>
    </section>

    ${latestUpdate ? `
    <section class="card quiet">
      <h3 class="card-title">Latest from ${esc(state.members.david.name)}'s work</h3>
      <p class="quote">“${esc(latestUpdate.text)}”</p>
      <p class="muted small">${esc(latestUpdate.project)} · ${relTime(latestUpdate.createdAt)} · <a href="#work">see where it's heading</a></p>
    </section>` : ''}
  `;
}

function noteCard(m, { showReactions = false } = {}) {
  const sender = state.members[m.from], reader = state.members[m.to];
  const lines = voice.deliver(m, sender, reader);
  return `
    <article class="note card" data-id="${m.id}">
      <div class="note-avatar">${av(reader, 56)}</div>
      <div class="note-body">
        <div class="note-meta"><span class="pill">${voice.kindIcon(m.kind)} ${esc(voice.kindLabel(m.kind))}</span><span class="muted small">${relTime(m.createdAt)}</span></div>
        <div class="bubble">
          ${lines.map((l) => `<p class="intro">${esc(l)}</p>`).join('')}
          <p class="said">“${esc(m.text)}”</p>
        </div>
        ${showReactions ? reactionRow(m) : ''}
      </div>
    </article>`;
}

function reactionRow(m) {
  const opts = [
    ['heart', '❤️', 'Love it'],
    ['thumbs', '👍', 'On board'],
    ['hug', '🤗', 'Hug'],
    ['talk', '🗣️', "Let's talk"],
  ];
  return `<div class="reactions">
    ${opts.map(([r, icon, label]) => `<button class="chip ${m.reaction === r ? 'on' : ''}" data-action="react" data-id="${m.id}" data-reaction="${r}">${icon} ${label}</button>`).join('')}
    <button class="chip ghost" data-action="reply" data-id="${m.id}">↩️ Reply through my avatar</button>
    ${!m.readAt ? `<button class="chip ghost" data-action="read" data-id="${m.id}">✓ Got it</button>` : ''}
  </div>`;
}

// --- Talk -------------------------------------------------------------------
function talk() {
  const meM = self(), you = other();
  const msgs = [...state.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const replyTo = ui.editing?.type === 'reply' ? state.messages.find((m) => m.id === ui.editing.id) : null;
  return `
    <section class="stage card">
      <div class="stage-side">${av(meM, 120)}<span>${esc(meM.name)}</span></div>
      <div class="stage-mid">
        <p class="muted">Your avatars carry the words between you. Write it once; ${esc(you.name)}'s avatar says it the way ${esc(you.name)} would want to hear it.</p>
      </div>
      <div class="stage-side">${av(you, 120)}<span>${esc(you.name)}</span></div>
    </section>

    <section class="thread">
      ${msgs.length ? msgs.map((m) => threadItem(m)).join('') : `<p class="muted center">No notes yet. The first one is the hardest — the avatars make it easier.</p>`}
    </section>

    <form class="compose card" data-form="send">
      <input type="hidden" name="replyTo" value="${replyTo ? esc(replyTo.id) : ''}">
      ${replyTo ? `<p class="small muted">Replying to: “${esc(replyTo.text.slice(0, 80))}${replyTo.text.length > 80 ? '…' : ''}” <button type="button" class="link" data-action="cancel-reply">cancel</button></p>` : ''}
      <div class="compose-row">
        <label>This is
          <select name="kind">
            ${state.messageKinds.filter((k) => k !== 'reply' || replyTo).map((k) => `<option value="${k}" ${replyTo && k === 'reply' ? 'selected' : ''}>${voice.kindIcon(k)} ${esc(voice.kindLabel(k))}</option>`).join('')}
          </select>
        </label>
        <label class="check"><input type="checkbox" name="soft"> Say it softly <span class="muted small">(for the things that are hard to say)</span></label>
      </div>
      <textarea name="text" rows="3" required maxlength="2000" placeholder="What do you want ${esc(you.name)} to know?" ${replyTo ? 'data-autofocus' : ''}></textarea>
      <div class="compose-row end">
        <span class="muted small">${av(meM, 22)} Your avatar hands it to ${av(you, 22)} ${esc(you.name)}'s avatar</span>
        <button class="btn primary" type="submit">Send it over</button>
      </div>
    </form>
  `;
}

function threadItem(m) {
  const mine = m.from === me;
  const sender = state.members[m.from], reader = state.members[m.to];
  if (!sender || !reader) return '';
  const lines = voice.deliver(m, sender, reader);
  return `
    <article class="msg ${mine ? 'mine' : 'theirs'}" data-id="${m.id}">
      <div class="msg-avatar">${av(reader, 44)}</div>
      <div class="msg-body">
        <div class="note-meta">
          <span class="pill">${voice.kindIcon(m.kind)} ${esc(voice.kindLabel(m.kind))}</span>
          ${m.soft ? '<span class="pill soft">softly</span>' : ''}
          <span class="muted small">${relTime(m.createdAt)}</span>
        </div>
        <div class="bubble">
          ${lines.map((l) => `<p class="intro">${esc(l)}</p>`).join('')}
          <p class="said">“${esc(m.text)}”</p>
        </div>
        ${mine
          ? `<p class="small muted">${m.readAt ? `Seen ${relTime(m.readAt)}` : 'Waiting to be read'}${m.reaction ? ` · ${esc(reader.name)} ${esc(voice.reactionLabel(m.reaction))}` : ''}
             <button class="link" data-action="delete-message" data-id="${m.id}">delete</button></p>`
          : reactionRow(m)}
      </div>
    </article>`;
}

// --- Money ------------------------------------------------------------------
function meter(spentPct, pacePct, { small = false } = {}) {
  const pct = Math.min(100, Math.max(0, spentPct));
  const tone = spentPct >= 100 ? 'critical' : spentPct > pacePct + 10 ? 'warning' : 'good';
  return `<div class="meter ${small ? 'small' : ''} ${tone}" role="img" aria-label="${Math.round(spentPct)}% of budget used, ${Math.round(pacePct)}% of month elapsed">
    <div class="meter-fill" style="width:${pct}%"></div>
    <div class="meter-pace" style="left:${Math.min(100, pacePct)}%" title="Where we'd be at an even pace"></div>
  </div>`;
}

function bar(pct, tone = '') {
  const p = Math.min(100, Math.max(0, pct));
  return `<div class="bar ${tone}"><div class="bar-fill" style="width:${p}%"></div></div>`;
}

function money() {
  const fin = financeSummary();
  const f = state.finances;
  const cats = [...new Set(['Food', 'Home', 'Kids', 'Transport', 'Health', 'Fun', 'Other', ...f.transactions.map((t) => t.category)])];
  const txs = [...f.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const maxCat = fin.byCategory[0]?.amount || 1;
  const paceState = fin.spentPct >= 100 ? 'Over budget' : fin.spentPct > fin.pacePct + 10 ? 'Ahead of pace' : 'On track';
  const paceIcon = fin.spentPct >= 100 ? '⛔' : fin.spentPct > fin.pacePct + 10 ? '⚠️' : '✅';

  return `
    <h1 class="page-title">Money <span class="muted">· ${esc(fin.monthName)}</span></h1>

    <section class="tiles">
      <div class="tile card">
        <span class="tile-label">Spent this month</span>
        <span class="tile-value">${fmtMoney(fin.spent, { compact: true })}</span>
        <span class="tile-sub">of ${fmtMoney(fin.budget, { compact: true })} budget</span>
      </div>
      <div class="tile card">
        <span class="tile-label">Left in budget</span>
        <span class="tile-value ${fin.left < 0 ? 'neg' : ''}">${fmtMoney(fin.left, { compact: true })}</span>
        <span class="tile-sub">${fin.daysLeft} days to go · ${fin.daysLeft > 0 && fin.left > 0 ? `${fmtMoney(fin.left / fin.daysLeft, { compact: true })} a day` : '—'}</span>
      </div>
      <div class="tile card">
        <span class="tile-label">Money we have</span>
        <span class="tile-value ${fin.balance < 0 ? 'neg' : ''}">${fmtMoney(fin.balance, { compact: true })}</span>
        <span class="tile-sub">${fin.income ? `${fmtMoney(fin.income, { compact: true })} came in this month` : 'current balance'}</span>
      </div>
      <div class="tile card status">
        <span class="tile-label">Pace</span>
        <span class="tile-value small-value">${paceIcon} ${paceState}</span>
        <span class="tile-sub">${Math.round(fin.spentPct)}% spent · ${Math.round(fin.pacePct)}% of month gone</span>
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">Budget this month</h3>
      ${meter(fin.spentPct, fin.pacePct)}
      <div class="legend-row small muted"><span><i class="swatch fill"></i> spent</span><span><i class="swatch pace"></i> even pace marker</span></div>
    </section>

    <div class="two-col">
      <section class="card">
        <h3 class="card-title">Where it went</h3>
        ${fin.byCategory.length ? `<div class="hbars">
          ${fin.byCategory.map((c) => `
            <div class="hbar" title="${esc(c.category)}: ${fmtMoney(c.amount)}">
              <span class="hbar-label">${esc(c.category)}</span>
              <div class="hbar-track"><div class="hbar-fill" style="width:${(c.amount / maxCat) * 100}%"></div></div>
              <span class="hbar-value">${fmtMoney(c.amount, { compact: true })}</span>
            </div>`).join('')}
        </div>` : '<p class="muted">Nothing spent yet this month.</p>'}
      </section>

      <section class="card">
        <h3 class="card-title">Spending through the month</h3>
        ${dailyChart(fin)}
      </section>
    </div>

    <div class="two-col">
      <section class="card">
        <h3 class="card-title">Log something</h3>
        <form class="form-grid" data-form="add-tx">
          <label>What <input name="label" required maxlength="80" placeholder="Groceries"></label>
          <label>Amount <input name="amount" type="number" min="0.01" step="0.01" required inputmode="decimal"></label>
          <label>Category <input name="category" list="cats" maxlength="40" placeholder="Food"><datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
          <label>Date <input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
          <label>Type <select name="type"><option value="expense">Money out</option><option value="income">Money in</option></select></label>
          <div class="form-actions"><button class="btn primary" type="submit">Add</button></div>
        </form>
      </section>

      <section class="card">
        <h3 class="card-title">Settings</h3>
        <form class="form-grid" data-form="finance-settings">
          <label>Monthly budget <input name="monthlyBudget" type="number" min="0" step="1" value="${f.monthlyBudget}"></label>
          <label>Money we have now <input name="balance" type="number" step="1" value="${f.balance}"></label>
          <label>Currency <input name="currency" maxlength="8" value="${esc(f.currency)}" placeholder="CZK"></label>
          <div class="form-actions"><button class="btn" type="submit">Save</button></div>
        </form>
        <p class="muted small">"Money we have" moves automatically as you log money in and out. Correct it here whenever you check the real account.</p>
      </section>
    </div>

    <section class="card">
      <h3 class="card-title">Everything logged</h3>
      ${txs.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>What</th><th>Category</th><th class="num">Amount</th><th></th></tr></thead>
        <tbody>
          ${txs.map((t) => `<tr class="${t.type === 'income' ? 'income' : ''}">
            <td>${fmtDate(t.date)}</td>
            <td>${esc(t.label)}</td>
            <td><span class="pill">${esc(t.category)}</span></td>
            <td class="num">${t.type === 'income' ? '+' : '−'}${fmtMoney(t.amount)}</td>
            <td class="num"><button class="link" data-action="delete-tx" data-id="${t.id}" title="Remove">✕</button></td>
          </tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Nothing logged yet.</p>'}
    </section>
  `;
}

function dailyChart(fin) {
  const W = 600, H = 220, padL = 8, padR = 8, padT = 12, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxY = Math.max(fin.budget, fin.spent, 1) * 1.05;
  const x = (day) => padL + ((day - 1) / (fin.daysInMonth - 1)) * iw;
  const y = (v) => padT + ih - (v / maxY) * ih;
  const known = fin.daily.filter((d) => d.cumulative !== null);
  const line = known.map((d, i) => `${i ? 'L' : 'M'}${x(d.day).toFixed(1)} ${y(d.cumulative).toFixed(1)}`).join(' ');
  const area = known.length
    ? `${line} L${x(known[known.length - 1].day).toFixed(1)} ${y(0).toFixed(1)} L${x(1).toFixed(1)} ${y(0).toFixed(1)} Z`
    : '';
  const budgetY = y(fin.budget);
  const ticks = [1, Math.round(fin.daysInMonth / 2), fin.daysInMonth];
  const points = known.map((d) => ({ cx: x(d.day), cy: y(d.cumulative), day: d.day, cumulative: d.cumulative, amount: d.amount }));
  return `
    <div class="chart" data-chart="daily" data-points='${esc(JSON.stringify(points))}'>
      <svg viewBox="0 0 ${W} ${H}" aria-label="Cumulative spending by day against the monthly budget">
        <line x1="${padL}" x2="${W - padR}" y1="${budgetY.toFixed(1)}" y2="${budgetY.toFixed(1)}" class="c-budget"/>
        <line x1="${x(1)}" x2="${x(fin.daysInMonth)}" y1="${y(0)}" y2="${budgetY.toFixed(1)}" class="c-pace"/>
        <line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" class="c-axis"/>
        ${area ? `<path d="${area}" class="c-area"/>` : ''}
        ${line ? `<path d="${line}" class="c-line"/>` : ''}
        ${points.length ? `<circle cx="${points[points.length - 1].cx.toFixed(1)}" cy="${points[points.length - 1].cy.toFixed(1)}" r="4" class="c-dot"/>` : ''}
        ${ticks.map((t) => `<text x="${x(t).toFixed(1)}" y="${H - 8}" class="c-tick" text-anchor="${t === 1 ? 'start' : t === fin.daysInMonth ? 'end' : 'middle'}">${t}</text>`).join('')}
        <text x="${W - padR}" y="${(budgetY - 5).toFixed(1)}" class="c-tick" text-anchor="end">budget ${esc(fmtMoney(fin.budget, { compact: true }))}</text>
        <line class="c-cross" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" visibility="hidden"/>
        <circle class="c-hover" r="5" visibility="hidden"/>
      </svg>
      <div class="tooltip" hidden></div>
      <div class="legend-row small muted"><span><i class="swatch fill"></i> spent so far</span><span><i class="swatch pace"></i> even pace</span><span><i class="swatch budget"></i> budget line</span></div>
    </div>`;
}

function wireDailyChart(el) {
  const points = JSON.parse(el.dataset.points || '[]');
  if (!points.length) return;
  const svg = el.querySelector('svg');
  const cross = svg.querySelector('.c-cross');
  const dot = svg.querySelector('.c-hover');
  const tip = el.querySelector('.tooltip');
  const W = 600;
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(p.cx - px) < Math.abs(best.cx - px)) best = p;
    cross.setAttribute('x1', best.cx); cross.setAttribute('x2', best.cx); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', best.cx); dot.setAttribute('cy', best.cy); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<strong>Day ${best.day}</strong><br>${esc(fmtMoney(best.cumulative))} so far${best.amount ? `<br><span class="muted">${esc(fmtMoney(best.amount))} that day</span>` : ''}`;
    const left = (best.cx / W) * r.width;
    tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, Math.max(4, left - tip.offsetWidth / 2))}px`;
  };
  const leave = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  svg.addEventListener('mousemove', move);
  svg.addEventListener('touchmove', (e) => move(e.touches[0]), { passive: true });
  svg.addEventListener('mouseleave', leave);
}

// --- Work -------------------------------------------------------------------
function work() {
  const owner = state.members.david;
  const canEdit = me === 'david';
  const projects = [...state.work.projects].sort((a, b) => (a.status === 'done') - (b.status === 'done'));
  const editingHeadline = ui.editing?.type === 'headline';
  return `
    <div class="page-head">
      <div>
        <h1 class="page-title">${esc(owner.name)}'s work</h1>
        ${editingHeadline ? `
          <form class="inline-form" data-form="headline"><input name="headline" maxlength="120" value="${esc(state.work.headline)}" data-autofocus><button class="btn small" type="submit">Save</button><button type="button" class="link" data-action="cancel-edit">cancel</button></form>`
          : `<p class="lede">${esc(state.work.headline)} ${canEdit ? `<button class="link" data-action="edit-headline">edit</button>` : ''}</p>`}
      </div>
      <div class="page-head-avatar">${av(owner, 72)}</div>
    </div>

    ${projects.length ? projects.map((p) => projectCard(p, canEdit)).join('') : `<p class="muted">No projects yet.${canEdit ? ' Add the first one below.' : ''}</p>`}

    ${canEdit ? `
    <section class="card">
      <h3 class="card-title">Start a new project</h3>
      <form class="form-grid" data-form="add-project">
        <label>Title <input name="title" required maxlength="80" placeholder="What are you building?"></label>
        <label>Progress <input name="progress" type="number" min="0" max="100" value="0"></label>
        <label class="wide">Where it's heading <input name="heading" maxlength="240" placeholder="The point of it, in one line ${esc(other().name)} would understand"></label>
        <label class="wide">Next step <input name="nextStep" maxlength="240" placeholder="What you'll do next"></label>
        <div class="form-actions"><button class="btn primary" type="submit">Add project</button></div>
      </form>
    </section>` : `<p class="muted small center">Only ${esc(owner.name)} edits this page — switch user (top right) to post an update.</p>`}
  `;
}

function projectCard(p, canEdit) {
  const editing = ui.editing?.type === 'project' && ui.editing.id === p.id;
  const statusLabel = { active: 'In progress', paused: 'Paused', done: 'Done' }[p.status] || p.status;
  return `
    <article class="card project ${p.status}" data-id="${p.id}">
      ${editing ? `
        <form class="form-grid" data-form="edit-project" data-id="${p.id}">
          <label>Title <input name="title" required maxlength="80" value="${esc(p.title)}" data-autofocus></label>
          <label>Status <select name="status">${['active', 'paused', 'done'].map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${{ active: 'In progress', paused: 'Paused', done: 'Done' }[s]}</option>`).join('')}</select></label>
          <label class="wide">Where it's heading <input name="heading" maxlength="240" value="${esc(p.heading)}"></label>
          <label class="wide">Next step <input name="nextStep" maxlength="240" value="${esc(p.nextStep)}"></label>
          <div class="form-actions"><button class="btn primary small" type="submit">Save</button><button type="button" class="link" data-action="cancel-edit">cancel</button><button type="button" class="link danger" data-action="delete-project" data-id="${p.id}">delete project</button></div>
        </form>`
      : `
        <div class="project-head">
          <h3>${esc(p.title)} <span class="pill ${p.status}">${statusLabel}</span></h3>
          <span class="project-pct">${p.progress}%</span>
        </div>
        ${bar(p.progress, p.status === 'done' ? 'good' : '')}
        ${p.heading ? `<p class="heading-line"><span class="muted small">Where it's heading</span><br>${esc(p.heading)}</p>` : ''}
        ${p.nextStep ? `<p class="heading-line"><span class="muted small">Next step</span><br>${esc(p.nextStep)}</p>` : ''}
        ${canEdit ? `<p class="small"><button class="link" data-action="edit-project" data-id="${p.id}">edit details</button></p>` : ''}
      `}

      ${p.updates.length ? `<ul class="timeline">
        ${p.updates.slice(0, 6).map((u) => `<li><span class="muted small">${relTime(u.createdAt)}</span><p>${esc(u.text)}</p></li>`).join('')}
        ${p.updates.length > 6 ? `<li class="muted small">…and ${p.updates.length - 6} earlier</li>` : ''}
      </ul>` : ''}

      ${canEdit && !editing ? `
      <form class="update-form" data-form="add-update" data-id="${p.id}">
        <input name="text" required maxlength="600" placeholder="What happened? ${esc(other().name)} will see this on the home screen.">
        <label class="small">now at <input name="progress" type="number" min="0" max="100" value="${p.progress}" class="tiny">%</label>
        <button class="btn small" type="submit">Post update</button>
      </form>` : ''}
    </article>`;
}

// --- Goals ------------------------------------------------------------------
function goals() {
  const list = [...state.goals].sort((a, b) => a.current / a.target - b.current / b.target);
  return `
    <h1 class="page-title">Family goals</h1>
    <p class="lede">The things we are moving toward, together. Anyone can nudge a goal forward.</p>
    <section class="goal-grid">
      ${list.map(goalCard).join('')}
    </section>
    <section class="card">
      <h3 class="card-title">Add a goal</h3>
      <form class="form-grid" data-form="add-goal">
        <label>Goal <input name="title" required maxlength="80" placeholder="Holiday by the sea"></label>
        <label>Category <input name="category" maxlength="40" placeholder="Together" list="goal-cats"><datalist id="goal-cats"><option value="Together"><option value="Money"><option value="Home"><option value="Kids"><option value="Health"></datalist></label>
        <label>Target <input name="target" type="number" min="0.01" step="any" required placeholder="40000"></label>
        <label>Unit <input name="unit" maxlength="20" placeholder="${esc(state.finances.currency)}, walks, books…"></label>
        <label>Already at <input name="current" type="number" min="0" step="any" value="0"></label>
        <label class="wide">Why it matters <input name="note" maxlength="240"></label>
        <div class="form-actions"><button class="btn primary" type="submit">Add goal</button></div>
      </form>
    </section>
  `;
}

function goalCard(g) {
  const pct = g.target > 0 ? (g.current / g.target) * 100 : 0;
  const done = g.current >= g.target;
  const editing = ui.editing?.type === 'goal' && ui.editing.id === g.id;
  const unit = g.unit ? ` ${esc(g.unit)}` : '';
  return `
    <article class="card goal ${done ? 'done' : ''}" data-id="${g.id}">
      ${editing ? `
        <form class="form-grid" data-form="edit-goal" data-id="${g.id}">
          <label class="wide">Goal <input name="title" required maxlength="80" value="${esc(g.title)}" data-autofocus></label>
          <label>Category <input name="category" maxlength="40" value="${esc(g.category)}"></label>
          <label>Unit <input name="unit" maxlength="20" value="${esc(g.unit)}"></label>
          <label>Target <input name="target" type="number" min="0.01" step="any" value="${g.target}"></label>
          <label>Now at <input name="current" type="number" min="0" step="any" value="${g.current}"></label>
          <label class="wide">Why it matters <input name="note" maxlength="240" value="${esc(g.note)}"></label>
          <div class="form-actions"><button class="btn primary small" type="submit">Save</button><button type="button" class="link" data-action="cancel-edit">cancel</button><button type="button" class="link danger" data-action="delete-goal" data-id="${g.id}">delete</button></div>
        </form>`
      : `
        <div class="goal-head"><span class="pill">${esc(g.category)}</span>${done ? '<span class="pill good">✓ reached</span>' : ''}</div>
        <h3>${esc(g.title)}</h3>
        ${g.note ? `<p class="muted">${esc(g.note)}</p>` : ''}
        ${bar(pct, done ? 'good' : '')}
        <p class="goal-numbers"><strong>${fmtNum(g.current)}</strong>${unit} of ${fmtNum(g.target)}${unit} <span class="muted">· ${Math.min(100, Math.round(pct))}%</span></p>
        <form class="update-form" data-form="bump-goal" data-id="${g.id}">
          <input name="amount" type="number" step="any" placeholder="+ add" class="tiny wide-tiny" required>
          <button class="btn small" type="submit">Add progress</button>
          <button type="button" class="link" data-action="edit-goal" data-id="${g.id}">edit</button>
        </form>`}
    </article>`;
}

// --- Studio -----------------------------------------------------------------
function studio() {
  const m = self();
  if (!ui.draftAvatar) ui.draftAvatar = { ...m.avatar };
  if (ui.draftName === null) ui.draftName = m.name;
  const d = ui.draftAvatar;
  const preview = { ...m, name: ui.draftName, avatar: d };
  const attrs = ['skin', 'hair', 'hairColor', 'eyes', 'mouth', 'accessory', 'shirt', 'background'];
  return `
    <h1 class="page-title">Your avatar</h1>
    <p class="lede">This is who speaks for you here. ${esc(other().name)} will see it deliver your notes, and it greets you every time you open the portal.</p>
    <div class="studio">
      <section class="card studio-preview">
        ${renderAvatar(d, { size: 220, className: 'talking' })}
        <div class="bubble"><p class="intro">${esc(voice.sample(d.personality, ui.draftName, other().name))}</p></div>
        <form class="form-grid" data-form="save-avatar">
          <label class="wide">My name <input name="name" maxlength="40" value="${esc(ui.draftName)}" required></label>
          <div class="form-actions">
            <button class="btn primary" type="submit">Save my avatar</button>
            <button class="btn" type="button" data-action="random-avatar">Surprise me</button>
          </div>
        </form>
      </section>
      <section class="card studio-options">
        <h3 class="card-title">${esc(LABELS.personality)}</h3>
        <div class="personalities">
          ${state.options.personality.map((p) => `
            <button type="button" class="persona ${d.personality === p ? 'on' : ''}" data-action="set-avatar" data-key="personality" data-value="${p}">
              <strong>${p[0].toUpperCase() + p.slice(1)}</strong><span class="small muted">${esc(PERSONALITY_BLURBS[p])}</span>
            </button>`).join('')}
        </div>
        ${attrs.map((key) => `
          <h3 class="card-title">${esc(LABELS[key])}</h3>
          <div class="chips">
            ${state.options[key].map((v) => {
              const swatch = PALETTE[key]?.[v];
              return `<button type="button" class="chip ${d[key] === v ? 'on' : ''}" data-action="set-avatar" data-key="${key}" data-value="${v}">${swatch ? `<i class="swatch" style="background:${swatch}"></i>` : ''}${esc(v)}</button>`;
            }).join('')}
          </div>`).join('')}
      </section>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  switch (action) {
    case 'switch-user': {
      const ids = Object.keys(state.members);
      me = ids[(ids.indexOf(me) + 1) % ids.length];
      localStorage.setItem('familyos.me', me);
      ui.draftAvatar = null; ui.draftName = null; ui.editing = null;
      toast(`Now looking as ${state.members[me].name}`);
      render();
      break;
    }
    case 'react': {
      const m = state.messages.find((x) => x.id === id);
      const reaction = m?.reaction === btn.dataset.reaction ? null : btn.dataset.reaction;
      await act(() => api('PATCH', `/api/messages/${id}`, { read: true, reaction }));
      break;
    }
    case 'read':
      await act(() => api('PATCH', `/api/messages/${id}`, { read: true }));
      break;
    case 'reply':
      ui.editing = { type: 'reply', id };
      await api('PATCH', `/api/messages/${id}`, { read: true }).catch(() => {});
      location.hash = '#talk';
      await reload();
      break;
    case 'cancel-reply':
    case 'cancel-edit':
      ui.editing = null;
      render();
      break;
    case 'delete-message':
      if (confirm('Delete this note for both of you?')) await act(() => api('DELETE', `/api/messages/${id}`), 'Deleted');
      break;
    case 'delete-tx':
      await act(() => api('DELETE', `/api/finances/transactions/${id}`), 'Removed');
      break;
    case 'edit-headline':
      ui.editing = { type: 'headline' }; render(); break;
    case 'edit-project':
      ui.editing = { type: 'project', id }; render(); break;
    case 'delete-project':
      if (confirm('Delete this project and its updates?')) { ui.editing = null; await act(() => api('DELETE', `/api/work/projects/${id}`), 'Project deleted'); }
      break;
    case 'edit-goal':
      ui.editing = { type: 'goal', id }; render(); break;
    case 'delete-goal':
      if (confirm('Delete this goal?')) { ui.editing = null; await act(() => api('DELETE', `/api/goals/${id}`), 'Goal deleted'); }
      break;
    case 'set-avatar':
      ui.draftAvatar[btn.dataset.key] = btn.dataset.value;
      render();
      break;
    case 'random-avatar': {
      const r = (list) => list[Math.floor(Math.random() * list.length)];
      for (const key of Object.keys(state.options)) if (key !== 'personality') ui.draftAvatar[key] = r(state.options[key]);
      render();
      break;
    }
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.name === 'name' && ev.target.closest('[data-form="save-avatar"]')) {
    ui.draftName = ev.target.value;
  }
});

document.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const { form: kind, id } = form.dataset;

  switch (kind) {
    case 'send': {
      const you = other();
      await act(async () => {
        await api('POST', '/api/messages', {
          from: me, to: you.id, kind: data.kind, soft: Boolean(data.soft), text: data.text, replyTo: data.replyTo || undefined,
        });
        ui.editing = null;
      }, `Your avatar is on its way to ${you.name}`);
      break;
    }
    case 'add-tx':
      await act(() => api('POST', '/api/finances/transactions', { ...data, addedBy: me }), 'Logged');
      break;
    case 'finance-settings':
      await act(() => api('PUT', '/api/finances', data), 'Saved');
      break;
    case 'headline':
      await act(async () => { await api('PUT', '/api/work', data); ui.editing = null; }, 'Saved');
      break;
    case 'add-project':
      await act(() => api('POST', '/api/work/projects', data), 'Project added');
      break;
    case 'edit-project':
      await act(async () => { await api('PATCH', `/api/work/projects/${id}`, data); ui.editing = null; }, 'Saved');
      break;
    case 'add-update':
      await act(() => api('POST', `/api/work/projects/${id}/updates`, data), `Posted — ${other().name} will see it`);
      break;
    case 'add-goal':
      await act(() => api('POST', '/api/goals', data), 'Goal added');
      break;
    case 'edit-goal':
      await act(async () => { await api('PATCH', `/api/goals/${id}`, data); ui.editing = null; }, 'Saved');
      break;
    case 'bump-goal': {
      const g = state.goals.find((x) => x.id === id);
      const next = Math.max(0, g.current + Number(data.amount || 0));
      await act(() => api('PATCH', `/api/goals/${id}`, { current: next }), next >= g.target ? '🎉 Goal reached!' : 'Nudged forward');
      break;
    }
    case 'save-avatar':
      await act(async () => {
        await api('PUT', `/api/members/${me}`, { name: data.name, avatar: ui.draftAvatar });
        ui.draftAvatar = null; ui.draftName = null;
      }, 'That is you now');
      break;
  }
});

window.addEventListener('hashchange', () => {
  route = (location.hash.slice(1) || 'home').split('?')[0];
  if (route !== 'talk' && ui.editing?.type === 'reply') ui.editing = null;
  if (route !== 'studio') { ui.draftAvatar = null; ui.draftName = null; }
  render();
  window.scrollTo({ top: 0 });
});

// Keep two open tabs (one per phone) loosely in sync.
setInterval(() => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (document.visibilityState === 'visible' && !ui.editing && !typing && route !== 'studio') reload().catch(() => {});
}, 20000);

reload().catch((err) => {
  app.innerHTML = `<p class="center error">Could not load the portal: ${esc(err.message)}</p>
    <p class="center muted small">Open <a href="/api/health">/api/health</a> to see what the server can and cannot reach.</p>`;
});
