'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { requireUser, hashPassword, verifyPassword, createSession } from '@/lib/auth';
import { mail } from '@/lib/email';
import type { FormState } from './auth';

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(30).optional(),
});

export async function updateProfile(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data: Record<string, any> = {};
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.phone) data.phone = parsed.data.phone;

  if (Object.keys(data).length === 0) return { error: 'No changes provided' };

  await db.user.update({
    where: { id: user.id },
    data,
  });

  revalidatePath('/profile');
  return { error: undefined };
}

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(100),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const dbUser = await db.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: 'User not found' };

  const isValid = await verifyPassword(parsed.data.currentPassword, dbUser.passwordHash);
  if (!isValid) return { error: 'Current password is incorrect' };

  const newHash = await hashPassword(parsed.data.newPassword);
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
    },
  });

  // Sign out all other sessions by updating passwordChangedAt
  // Next login will require re-authentication
  await mail.send({
    to: user.email,
    subject: 'Your password has been changed',
    html: `
      <p>Hi ${user.name},</p>
      <p>Your password was successfully changed. If you did not make this change, please contact support immediately.</p>
      <p>For security reasons, you may need to log in again.</p>
    `,
  });

  return { error: undefined };
}

const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

// Rate limit: 60 seconds per account
const resetAttempts = new Map<string, number>();

export async function requestPasswordReset(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = requestPasswordResetSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const email = parsed.data.email.toLowerCase();

  // Rate limiting (in production, use Redis/Upstash)
  const lastAttempt = resetAttempts.get(email) || 0;
  if (Date.now() - lastAttempt < 60000) {
    return { error: 'Please wait before requesting another reset' };
  }
  resetAttempts.set(email, Date.now());

  const user = await db.user.findUnique({ where: { email } });

  // Always return success for privacy (don't leak which emails exist)
  if (!user) return { error: undefined };

  // Generate reset token
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
  await mail.send({
    to: user.email,
    subject: 'Reset your password',
    html: `
      <p>Hi ${user.name},</p>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });

  return { error: undefined };
}

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(100),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export async function resetPassword(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');

  const reset = await db.passwordReset.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!reset) return { error: 'Invalid or expired reset token' };
  if (reset.expiresAt < new Date()) return { error: 'Reset token has expired' };
  if (reset.usedAt) return { error: 'Reset token has already been used' };

  const newHash = await hashPassword(parsed.data.newPassword);

  await db.user.update({
    where: { id: reset.userId },
    data: {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
    },
  });

  await db.passwordReset.update({
    where: { id: reset.id },
    data: { usedAt: new Date() },
  });

  // Clear old reset tokens
  await db.passwordReset.deleteMany({
    where: {
      userId: reset.userId,
      id: { not: reset.id },
    },
  });

  // Create new session
  await createSession(reset.userId);

  return { error: undefined };
}
