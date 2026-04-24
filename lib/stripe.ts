import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY || 'sk_test_';

export const stripe = new Stripe(key, {
  apiVersion: '2026-04-22.dahlia',
});
