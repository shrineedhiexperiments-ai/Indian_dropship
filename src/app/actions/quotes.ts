'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, requireAdmin, getUser } from '@/lib/auth';
import { mail } from '@/lib/email';
import { chf, toRappen } from '@/lib/format';
import type { FormState } from './auth';

const quoteSchema = z.object({
  url: z.string().trim().url('Enter a valid product URL'),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(1000),
  qty: z.coerce.number().int().min(1).max(1000).default(1),
});

const respondQuoteSchema = z.object({
  id: z.string(),
  quotedPrice: z.coerce.number().positive('Price must be above 0').max(50000),
  adminNote: z.string().trim().max(500).optional(),
});

export async function createQuote(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser('/login?next=/quote');
  const parsed = quoteSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const quote = await db.quote.create({
    data: {
      userId: user.id,
      url: parsed.data.url,
      description: parsed.data.description,
      qty: parsed.data.qty,
    },
  });

  // Notify admin
  await mail.quoteRequested(parsed.data.url, user.name);

  revalidatePath('/quotes');
  return { error: undefined };
}

export async function respondToQuote(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = respondQuoteSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const quote = await db.quote.findUnique({
    where: { id: parsed.data.id },
    include: { user: true },
  });

  if (!quote) return { error: 'Quote not found' };

  const quotedRappen = toRappen(parsed.data.quotedPrice);
  await db.quote.update({
    where: { id: quote.id },
    data: {
      status: 'QUOTED',
      quotedRappen,
      adminNote: parsed.data.adminNote || null,
    },
  });

  // Notify user
  await mail.quoteReady(quote.user.email, chf(quotedRappen));

  revalidatePath('/admin/quotes');
  return { error: undefined };
}

export async function acceptQuote(quoteId: string): Promise<FormState> {
  const user = await requireUser();
  const quote = await db.quote.findUnique({ where: { id: quoteId } });

  if (!quote || quote.userId !== user.id) return { error: 'Quote not found' };
  if (quote.status !== 'QUOTED') return { error: 'Quote cannot be accepted' };

  await db.quote.update({
    where: { id: quoteId },
    data: { status: 'ACCEPTED' },
  });

  // Notify admin
  await mail.quoteResponded(true, user.name);

  revalidatePath('/quotes');
  return { error: undefined };
}

export async function declineQuote(quoteId: string): Promise<FormState> {
  const user = await requireUser();
  const quote = await db.quote.findUnique({ where: { id: quoteId } });

  if (!quote || quote.userId !== user.id) return { error: 'Quote not found' };
  if (quote.status !== 'QUOTED') return { error: 'Quote cannot be declined' };

  await db.quote.update({
    where: { id: quoteId },
    data: { status: 'DECLINED' },
  });

  revalidatePath('/quotes');
  return { error: undefined };
}
