// Vercel entry point. vercel.json rewrites every /api/* request here with the
// original path in the __path query parameter; static files are served from
// public/ by the platform itself.
//
// Everything is wrapped so that a failure anywhere (even while loading the
// server module) turns into a JSON error the browser can display, instead of
// an opaque FUNCTION_INVOCATION_FAILED page.

let handlerPromise = null;
const bootErrors = [];

process.on('unhandledRejection', (err) => bootErrors.push(describe(err, 'unhandledRejection')));
process.on('uncaughtException', (err) => bootErrors.push(describe(err, 'uncaughtException')));

function describe(err, where) {
  const e = err instanceof Error ? err : new Error(String(err));
  return { where, message: e.message, stack: (e.stack || '').split('\n').slice(0, 4).join('\n') };
}

async function loadHandler() {
  const { createHandler } = await import('../server.js');
  return createHandler({ password: process.env.PORTAL_PASSWORD });
}

function fail(res, status, body) {
  try {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  } catch (err) {
    console.error('could not write error response', err);
  }
}

export default async function (req, res) {
  try {
    if (!handlerPromise) handlerPromise = loadHandler();
    const handler = await handlerPromise;
    await handler(req, res);
  } catch (err) {
    handlerPromise = null; // let the next request retry a fresh load
    const d = describe(err, 'request');
    console.error(d.where, d.stack);
    fail(res, 500, { error: `Server error: ${d.message}`, detail: d, boot: bootErrors.slice(-3) });
  }
}
