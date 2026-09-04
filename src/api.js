import { newId } from './store.js';

const AVATAR_OPTIONS = {
  skin: ['porcelain', 'light', 'tan', 'olive', 'brown', 'deep'],
  hair: ['short', 'long', 'bob', 'curly', 'bun', 'buzz', 'bald'],
  hairColor: ['black', 'brown', 'auburn', 'blonde', 'silver', 'blue'],
  eyes: ['round', 'happy', 'wink', 'sleepy'],
  mouth: ['smile', 'grin', 'neutral', 'oh'],
  accessory: ['none', 'glasses', 'earrings', 'flower', 'cap'],
  shirt: ['blue', 'rose', 'green', 'yellow', 'violet', 'charcoal'],
  background: ['sky', 'peach', 'mint', 'lavender', 'sand', 'night'],
  personality: ['warm', 'playful', 'calm', 'direct'],
};

const MESSAGE_KINDS = ['feeling', 'plan', 'work', 'money', 'thanks', 'request', 'reply'];
const PROJECT_STATUSES = ['active', 'paused', 'done'];
const REACTIONS = [null, 'heart', 'thumbs', 'hug', 'talk'];

export { AVATAR_OPTIONS, MESSAGE_KINDS };

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const str = (v, { max = 2000, required = false, name = 'value' } = {}) => {
  if (v === undefined || v === null) {
    if (required) throw new ApiError(400, `${name} is required`);
    return undefined;
  }
  if (typeof v !== 'string') throw new ApiError(400, `${name} must be text`);
  const t = v.trim();
  if (required && !t) throw new ApiError(400, `${name} is required`);
  if (t.length > max) throw new ApiError(400, `${name} is too long`);
  return t;
};

const num = (v, { min = -Infinity, max = Infinity, required = false, name = 'value' } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new ApiError(400, `${name} is required`);
    return undefined;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ApiError(400, `${name} must be a number`);
  if (n < min || n > max) throw new ApiError(400, `${name} is out of range`);
  return n;
};

const oneOf = (v, list, { required = false, name = 'value' } = {}) => {
  if (v === undefined) {
    if (required) throw new ApiError(400, `${name} is required`);
    return undefined;
  }
  if (!list.includes(v)) throw new ApiError(400, `${name} must be one of: ${list.join(', ')}`);
  return v;
};

const findOr404 = (list, id, what) => {
  const item = list.find((x) => x.id === id);
  if (!item) throw new ApiError(404, `${what} not found`);
  return item;
};

const isoDate = (v) => {
  if (v === undefined || v === null || v === '') return new Date().toISOString();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'date is invalid');
  return d.toISOString();
};

// Each route: [method, pattern, handler(state, params, body) => result]
// Handlers that mutate must return through store.update, which the server wraps.
export function buildRoutes(store, deployment = {}) {
  const routes = [];
  const on = (method, pattern, handler, { mutates = true } = {}) => {
    const keys = [];
    const re = new RegExp(
      '^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$'
    );
    routes.push({ method, re, keys, handler, mutates });
  };

  on('GET', '/api/state', (s) => ({ ...s, options: AVATAR_OPTIONS, messageKinds: MESSAGE_KINDS, deployment }), {
    mutates: false,
  });

  // --- members / avatars ---------------------------------------------------
  on('PUT', '/api/members/:id', (s, { id }, body) => {
    const m = s.members[id];
    if (!m) throw new ApiError(404, 'member not found');
    const name = str(body.name, { max: 40, name: 'name' });
    if (name) m.name = name;
    if (body.avatar && typeof body.avatar === 'object') {
      for (const [key, list] of Object.entries(AVATAR_OPTIONS)) {
        const v = oneOf(body.avatar[key], list, { name: key });
        if (v !== undefined) m.avatar[key] = v;
      }
    }
    return m;
  });

  // --- messages (what the avatars carry between you) ----------------------
  on('POST', '/api/messages', (s, _p, body) => {
    const from = oneOf(body.from, Object.keys(s.members), { required: true, name: 'from' });
    const to = oneOf(body.to, Object.keys(s.members), { required: true, name: 'to' });
    if (from === to) throw new ApiError(400, 'a message needs two people');
    const msg = {
      id: newId('m'),
      from,
      to,
      kind: oneOf(body.kind, MESSAGE_KINDS, { name: 'kind' }) ?? 'feeling',
      soft: Boolean(body.soft),
      text: str(body.text, { required: true, max: 2000, name: 'text' }),
      createdAt: new Date().toISOString(),
      readAt: null,
      reaction: null,
      replyTo: body.replyTo ? str(body.replyTo, { max: 64 }) : null,
    };
    s.messages.push(msg);
    return msg;
  });

  on('PATCH', '/api/messages/:id', (s, { id }, body) => {
    const msg = findOr404(s.messages, id, 'message');
    if (body.read === true && !msg.readAt) msg.readAt = new Date().toISOString();
    if ('reaction' in body) msg.reaction = oneOf(body.reaction, REACTIONS, { name: 'reaction' });
    return msg;
  });

  on('DELETE', '/api/messages/:id', (s, { id }) => {
    findOr404(s.messages, id, 'message');
    s.messages = s.messages.filter((m) => m.id !== id);
    return { ok: true };
  });

  // --- finances ------------------------------------------------------------
  on('PUT', '/api/finances', (s, _p, body) => {
    const f = s.finances;
    const currency = str(body.currency, { max: 8, name: 'currency' });
    if (currency) f.currency = currency.toUpperCase();
    const budget = num(body.monthlyBudget, { min: 0, name: 'monthlyBudget' });
    if (budget !== undefined) f.monthlyBudget = budget;
    const balance = num(body.balance, { name: 'balance' });
    if (balance !== undefined) f.balance = balance;
    return f;
  });

  on('POST', '/api/finances/transactions', (s, _p, body) => {
    const type = oneOf(body.type, ['expense', 'income'], { name: 'type' }) ?? 'expense';
    const t = {
      id: newId('t'),
      date: isoDate(body.date),
      label: str(body.label, { required: true, max: 80, name: 'label' }),
      category: str(body.category, { max: 40, name: 'category' }) || 'Other',
      amount: num(body.amount, { min: 0.01, required: true, name: 'amount' }),
      type,
      addedBy: oneOf(body.addedBy, Object.keys(s.members), { name: 'addedBy' }) ?? null,
    };
    s.finances.transactions.push(t);
    s.finances.balance += type === 'income' ? t.amount : -t.amount;
    return t;
  });

  on('DELETE', '/api/finances/transactions/:id', (s, { id }) => {
    const t = findOr404(s.finances.transactions, id, 'transaction');
    s.finances.transactions = s.finances.transactions.filter((x) => x.id !== id);
    s.finances.balance += t.type === 'income' ? -t.amount : t.amount;
    return { ok: true, balance: s.finances.balance };
  });

  // --- work progress -------------------------------------------------------
  on('PUT', '/api/work', (s, _p, body) => {
    const headline = str(body.headline, { max: 120, name: 'headline' });
    if (headline) s.work.headline = headline;
    return s.work;
  });

  const applyProject = (p, body) => {
    const title = str(body.title, { max: 80, name: 'title' });
    if (title) p.title = title;
    const status = oneOf(body.status, PROJECT_STATUSES, { name: 'status' });
    if (status) p.status = status;
    const progress = num(body.progress, { min: 0, max: 100, name: 'progress' });
    if (progress !== undefined) p.progress = Math.round(progress);
    const heading = str(body.heading, { max: 240, name: 'heading' });
    if (heading !== undefined) p.heading = heading;
    const nextStep = str(body.nextStep, { max: 240, name: 'nextStep' });
    if (nextStep !== undefined) p.nextStep = nextStep;
  };

  on('POST', '/api/work/projects', (s, _p, body) => {
    const p = {
      id: newId('w'),
      title: '',
      status: 'active',
      progress: 0,
      heading: '',
      nextStep: '',
      updates: [],
      createdAt: new Date().toISOString(),
    };
    applyProject(p, body);
    if (!p.title) throw new ApiError(400, 'title is required');
    s.work.projects.push(p);
    return p;
  });

  on('PATCH', '/api/work/projects/:id', (s, { id }, body) => {
    const p = findOr404(s.work.projects, id, 'project');
    applyProject(p, body);
    return p;
  });

  on('POST', '/api/work/projects/:id/updates', (s, { id }, body) => {
    const p = findOr404(s.work.projects, id, 'project');
    const u = {
      id: newId('wu'),
      text: str(body.text, { required: true, max: 600, name: 'text' }),
      createdAt: new Date().toISOString(),
    };
    p.updates.unshift(u);
    const progress = num(body.progress, { min: 0, max: 100, name: 'progress' });
    if (progress !== undefined) p.progress = Math.round(progress);
    return p;
  });

  on('DELETE', '/api/work/projects/:id', (s, { id }) => {
    findOr404(s.work.projects, id, 'project');
    s.work.projects = s.work.projects.filter((p) => p.id !== id);
    return { ok: true };
  });

  // --- family goals --------------------------------------------------------
  const applyGoal = (g, body) => {
    const title = str(body.title, { max: 80, name: 'title' });
    if (title) g.title = title;
    const category = str(body.category, { max: 40, name: 'category' });
    if (category) g.category = category;
    const unit = str(body.unit, { max: 20, name: 'unit' });
    if (unit !== undefined) g.unit = unit;
    const target = num(body.target, { min: 0.000001, name: 'target' });
    if (target !== undefined) g.target = target;
    const current = num(body.current, { min: 0, name: 'current' });
    if (current !== undefined) g.current = current;
    const note = str(body.note, { max: 240, name: 'note' });
    if (note !== undefined) g.note = note;
  };

  on('POST', '/api/goals', (s, _p, body) => {
    const g = { id: newId('g'), title: '', category: 'Together', unit: '', target: 1, current: 0, note: '' };
    applyGoal(g, body);
    if (!g.title) throw new ApiError(400, 'title is required');
    s.goals.push(g);
    return g;
  });

  on('PATCH', '/api/goals/:id', (s, { id }, body) => {
    const g = findOr404(s.goals, id, 'goal');
    applyGoal(g, body);
    return g;
  });

  on('DELETE', '/api/goals/:id', (s, { id }) => {
    findOr404(s.goals, id, 'goal');
    s.goals = s.goals.filter((g) => g.id !== id);
    return { ok: true };
  });

  return {
    // Resolves to {status, body}, or null when no route matches.
    async dispatch(method, pathname, body) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(pathname);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        try {
          const result = r.mutates
            ? await store.update((s) => r.handler(s, params, body ?? {}))
            : r.handler(await store.refresh(), params, body ?? {});
          return { status: 200, body: result };
        } catch (err) {
          if (err instanceof ApiError) return { status: err.status, body: { error: err.message } };
          throw err;
        }
      }
      return null;
    },
  };
}
