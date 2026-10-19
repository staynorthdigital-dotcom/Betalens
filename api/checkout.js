// POST /api/checkout { interval: "month" | "year" } -> { url } (Stripe Checkout page)
import { authed, readJson, send, getProfile, origin } from './_lib/common.js';
import { stripe, customerFor } from './_lib/stripe.js';

export default authed(async (req, res, user) => {
  const { interval } = await readJson(req);
  const price = interval === 'year' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
  if (!price) return send(res, 500, { code: 'server', error: 'Payments are not set up yet.' });
  const p = await getProfile(user.id);
  if (p.plan === 'pro') return send(res, 400, { code: 'already_pro', error: "You're already on Pro." });
  const customer = await customerFor(user, p);
  const base = origin(req);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    subscription_data: { metadata: { uid: user.id } },
    allow_promotion_codes: true,
    success_url: `${base}/?upgraded=1`,
    cancel_url: `${base}/`
  });
  send(res, 200, { url: session.url });
});
