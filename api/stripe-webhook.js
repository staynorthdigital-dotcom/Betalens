// Stripe calls this when someone pays, changes or cancels. It switches their plan.
import { stripe } from './_lib/stripe.js';
import { admin, send } from './_lib/common.js';

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = []; for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  let event;
  try {
    event = stripe.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('Webhook signature check failed', e.message);
    return send(res, 400, { error: 'Bad signature' });
  }
  const db = admin();
  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      if (s.mode === 'subscription' && s.client_reference_id) {
        await db.from('profiles').update({ plan: 'pro', stripe_customer_id: s.customer }).eq('id', s.client_reference_id);
      }
    } else if (event.type.startsWith('customer.subscription.')) {
      const sub = event.data.object;
      const active = event.type !== 'customer.subscription.deleted' && ['active', 'trialing', 'past_due'].includes(sub.status);
      await db.from('profiles').update({ plan: active ? 'pro' : 'free' }).eq('stripe_customer_id', sub.customer);
    }
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Update failed' });
  }
  send(res, 200, { received: true });
}
