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
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await mail.send({
      to: adminEmail,
      subject: `New quote request from ${user.name}`,
      html: `
        <p>New quote request from ${user.name} (${user.email})</p>
        <p><strong>Product:</strong> ${parsed.data.description}</p>
        <p><strong>Quantity:</strong> ${parsed.data.qty}</p>
        <p><strong>URL:</strong> <a href="${parsed.data.url}">${parsed.data.url}</a></p>
        <p><a href="${process.env.APP_URL}/admin/quotes/${quote.id}">View in admin</a></p>
      `,
    });
  }

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
  await mail.send({
    to: quote.user.email,
    subject: 'Your product quote is ready',
    html: `
      <p>Hi ${quote.user.name},</p>
      <p>We have a quote for your product request:</p>
      <p><strong>Total Price:</strong> CHF ${chf(quotedRappen)}</p>
      ${parsed.data.adminNote ? `<p><strong>Note:</strong> ${parsed.data.adminNote}</p>` : ''}
      <p><a href="${process.env.APP_URL}/quotes/${quote.id}">View and accept/decline</a></p>
    `,
  });

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
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await mail.send({
      to: adminEmail,
      subject: `Quote ${quoteId} accepted by ${user.name}`,
      html: `<p>${user.name} (${user.email}) has accepted the quote for CHF ${quote.quotedRappen ? chf(quote.quotedRappen) : 'N/A'}.</p>`,
    });
  }

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
