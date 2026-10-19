// Public settings the app needs in the browser. Never put secret keys here.
import { LIMITS, send } from './_lib/common.js';

export default function handler(req, res) {
  send(res, 200, {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    freeScans: LIMITS.freeScans,
    prices: {
      monthly: process.env.PRICE_LABEL_MONTHLY || '£3.99 a month',
      yearly: process.env.PRICE_LABEL_YEARLY || '£29.99 a year'
    }
  });
}
