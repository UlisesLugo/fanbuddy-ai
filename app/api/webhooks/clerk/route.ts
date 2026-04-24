import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { Webhook } from 'svix';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export async function POST(req: Request) {
  const payload = await req.text();
  const headersList = await headers();

  const svixHeaders = {
    'svix-id': headersList.get('svix-id') ?? '',
    'svix-timestamp': headersList.get('svix-timestamp') ?? '',
    'svix-signature': headersList.get('svix-signature') ?? '',
  };

  let event: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
    event = wh.verify(payload, svixHeaders) as typeof event;
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'user.created') {
    const { id, email_addresses, phone_numbers } = event.data as {
      id: string;
      email_addresses: Array<{ email_address: string }>;
      phone_numbers: Array<{ phone_number: string; verification: { status: string } }>;
    };

    const email = email_addresses[0]?.email_address ?? '';
    const phoneEntry = phone_numbers?.[0];
    const phone = phoneEntry?.phone_number ?? null;
    const phone_verified = phoneEntry?.verification?.status === 'verified';

    await db.insert(users).values({
      id: id as string,
      email,
      phone,
      phone_verified,
    }).onConflictDoNothing();
  }

  if (event.type === 'user.updated') {
    const { id, email_addresses, phone_numbers } = event.data as {
      id: string;
      email_addresses: Array<{ email_address: string }>;
      phone_numbers: Array<{ phone_number: string; verification: { status: string } }>;
    };

    const email = email_addresses[0]?.email_address ?? '';
    const phoneEntry = phone_numbers?.[0];
    const phone = phoneEntry?.phone_number ?? null;
    const phone_verified = phoneEntry?.verification?.status === 'verified';

    await db.update(users)
      .set({ email, phone, phone_verified })
      .where(eq(users.id, id as string));
  }

  return new Response('OK', { status: 200 });
}
