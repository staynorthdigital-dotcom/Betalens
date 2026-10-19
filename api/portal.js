// POST /api/portal -> { url } (Stripe page where people change or cancel their plan)
import { authed, send, getProfile, origin } from './_lib/common.js';
import { stripe, customerFor } from './_lib/stripe.js';

export default authed(async (req, res, user) => {
  const p = await getProfile(user.id);
  const customer = await customerFor(user, p);
  const s = await stripe.billingPortal.sessions.create({ customer, return_url: origin(req) + '/' });
  send(res, 200, { url: s.url });
});
