import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import type Stripe from 'stripe';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { stripe } from '@/lib/stripe';

export async function POST(req: Request) {
  const payload = await req.text();
  const sig = (await headers()).get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (!userId) return new Response('Missing userId in metadata', { status: 400 });

    await db.update(users)
      .set({
        plan: 'paid',
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
      })
      .where(eq(users.id, userId));
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;

    await db.update(users)
      .set({
        plan: 'free',
        stripe_subscription_id: null,
      })
      .where(eq(users.stripe_subscription_id, subscription.id));
  }

  return new Response('OK', { status: 200 });
}
