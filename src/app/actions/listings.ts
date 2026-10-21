'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, getUser } from '@/lib/auth';
import { mail } from '@/lib/email';
import type { FormState } from './auth';

const listingSchema = z.object({
  type: z.enum(['OFFER', 'REQUEST'] as const),
  direction: z.enum(['INDIA_TO_CH', 'CH_TO_INDIA'] as const),
  title: z.string().trim().min(5).max(100),
  description: z.string().trim().min(20).max(2000),
  date: z.string().refine((d) => new Date(d) > new Date(), 'Date must be in the future'),
  feeChf: z.coerce.number().min(0).max(5000),
  maxWeightG: z.coerce.number().int().min(0).optional(),
});

export async function createListing(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser('/login?next=/travellers');
  const parsed = listingSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const feeRappen = Math.round(parsed.data.feeChf * 100);

  const listing = await db.listing.create({
    data: {
      userId: user.id,
      type: parsed.data.type,
      direction: parsed.data.direction,
      title: parsed.data.title,
      description: parsed.data.description,
      date: new Date(parsed.data.date),
      feeRappen,
      maxWeightG: parsed.data.maxWeightG || null,
    },
  });

  revalidatePath('/travellers');
  return { error: undefined };
}

export async function updateListing(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const listing = await db.listing.findUnique({ where: { id } });

  if (!listing || listing.userId !== user.id) return { error: 'Listing not found' };
  if (listing.status !== 'OPEN') return { error: 'Cannot edit closed listing' };

  const parsed = listingSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const feeRappen = Math.round(parsed.data.feeChf * 100);

  await db.listing.update({
    where: { id },
    data: {
      type: parsed.data.type,
      direction: parsed.data.direction,
      title: parsed.data.title,
      description: parsed.data.description,
      date: new Date(parsed.data.date),
      feeRappen,
      maxWeightG: parsed.data.maxWeightG || null,
    },
  });

  revalidatePath('/travellers');
  return { error: undefined };
}

export async function closeListing(id: string): Promise<FormState> {
  const user = await requireUser();
  const listing = await db.listing.findUnique({ where: { id } });

  if (!listing || listing.userId !== user.id) return { error: 'Listing not found' };

  await db.listing.update({
    where: { id },
    data: { status: 'CLOSED' },
  });

  revalidatePath('/travellers');
  return { error: undefined };
}

const messageSchema = z.object({
  listingId: z.string(),
  body: z.string().trim().min(1).max(2000),
  toUserId: z.string(),
});

export async function sendMessage(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = messageSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const listing = await db.listing.findUnique({
    where: { id: parsed.data.listingId },
  });

  if (!listing) return { error: 'Listing not found' };

  const toUser = await db.user.findUnique({
    where: { id: parsed.data.toUserId },
  });

  if (!toUser) return { error: 'User not found' };

  const message = await db.message.create({
    data: {
      listingId: listing.id,
      fromUserId: user.id,
      toUserId: toUser.id,
      body: parsed.data.body,
    },
  });

  // Notify recipient (don't send full message text for privacy)
  await mail.send({
    to: toUser.email,
    subject: `New message about "${listing.title}"`,
    html: `
      <p>Hi ${toUser.name},</p>
      <p>${user.name} sent you a message about the listing "${listing.title}".</p>
      <p><a href="${process.env.APP_URL}/messages?listing=${listing.id}">View message</a></p>
    `,
  });

  revalidatePath(`/messages?listing=${listing.id}`);
  return { error: undefined };
}
