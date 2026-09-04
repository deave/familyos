// Vercel entry point when the platform builds api/* as functions:
// vercel.json rewrites every /api/* request here with the original path in
// the __path query parameter, and public/ is served as static files.
//
// The server module is loaded lazily so that even a failure while importing
// it turns into a JSON error the browser can display, instead of an opaque
// FUNCTION_INVOCATION_FAILED page.
let entryPromise = null;

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
    if (!entryPromise) entryPromise = import('../server.js').then((m) => m.default);
    const entry = await entryPromise;
    await entry(req, res);
  } catch (err) {
    entryPromise = null;
    console.error(err);
    fail(res, 500, { error: `Server error: ${err.message}`, stack: String(err.stack || '').split('\n').slice(0, 4) });
  }
}
