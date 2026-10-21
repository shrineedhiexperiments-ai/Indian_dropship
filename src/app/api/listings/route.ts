import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') as 'OFFER' | 'REQUEST' | null;
    const direction = searchParams.get('direction') as 'INDIA_TO_CH' | 'CH_TO_INDIA' | null;
    const status = searchParams.get('status') as 'OPEN' | 'MATCHED' | 'CLOSED' | null;

    const where: Record<string, any> = {};
    if (type) where.type = type;
    if (direction) where.direction = direction;
    if (status) where.status = status;

    const listings = await db.listing.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(listings);
  } catch (error) {
    console.error('Error fetching listings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { type, direction, title, description, date, feeChf, maxWeightG } = body;

    if (!type || !direction || !title || !description || !date) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const feeRappen = Math.round((feeChf || 0) * 100);

    const listing = await db.listing.create({
      data: {
        userId,
        type,
        direction,
        title,
        description,
        date: new Date(date),
        feeRappen,
        maxWeightG: maxWeightG || null,
      },
    });

    return NextResponse.json(listing, { status: 201 });
  } catch (error) {
    console.error('Error creating listing:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
