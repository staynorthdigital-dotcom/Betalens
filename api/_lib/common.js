import { createClient } from '@supabase/supabase-js';

let _admin = null;
/** Supabase client with the service-role key. Server only: never send this key to the browser. */
export function admin() {
  if (!_admin) _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

/** The signed-in user from the request's Bearer token, or null. */
export async function getUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  return error ? null : data.user;
}

export async function getProfile(uid) {
  const { data, error } = await admin().from('profiles').select('*').eq('id', uid).single();
  if (error) throw error;
  return data;
}

export const period = () => new Date().toISOString().slice(0, 7);

export const LIMITS = {
  freeScans: Number(process.env.FREE_SCANS_PER_MONTH || 5),
  freeAsks: Number(process.env.FREE_ASKS_PER_MONTH || 10),
  proScans: Number(process.env.PRO_SCANS_PER_MONTH || 300),
  proAsks: Number(process.env.PRO_ASKS_PER_MONTH || 600)
};

/** Current month's usage for a profile row. */
export function usageOf(p) {
  const same = p.scans_period === period();
  const pro = p.plan === 'pro';
  return {
    plan: pro ? 'pro' : 'free',
    used: same ? p.scans_month || 0 : 0,
    asks: same ? p.asks_month || 0 : 0,
    limit: pro ? LIMITS.proScans : LIMITS.freeScans,
    askLimit: pro ? LIMITS.proAsks : LIMITS.freeAsks
  };
}

/** Add one scan or ask to this month's count. Returns the new count. */
export async function bump(uid, kind) {
  const { data, error } = await admin().rpc('bump_usage', { uid, kind });
  if (error) throw error;
  return data;
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export function origin(req) {
  return process.env.APP_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

/** Wraps a handler: POST only, signed-in user required, errors become JSON. */
export function authed(fn) {
  return async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
    try {
      const user = await getUser(req);
      if (!user) return send(res, 401, { code: 'auth', error: 'Please sign in again.' });
      await fn(req, res, user);
    } catch (e) {
      console.error(e);
      const status = e?.status === 429 ? 429 : 500;
      send(res, status, { code: status === 429 ? 'rate_limited' : 'server', error: status === 429 ? 'The coach is busy. Try again in a minute.' : 'Something went wrong. Try again.' });
    }
  };
}
