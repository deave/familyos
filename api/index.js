// Vercel entry point. vercel.json rewrites every /api/* request here with the
// original path in the __path query parameter; static files are served from
// public/ by the platform itself.
import { createHandler } from '../server.js';

const handler = createHandler({ password: process.env.PORTAL_PASSWORD });

export default function (req, res) {
  return handler(req, res);
}
