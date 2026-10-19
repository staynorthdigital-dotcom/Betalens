import Stripe from 'stripe';
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_missing');

import { admin } from './common.js';
/** Make sure this user has a Stripe customer, and return its id. */
export async function customerFor(user, profile) {
  if (profile.stripe_customer_id) return profile.stripe_customer_id;
  const c = await stripe.customers.create({ email: user.email, metadata: { uid: user.id } });
  await admin().from('profiles').update({ stripe_customer_id: c.id }).eq('id', user.id);
  return c.id;
}
