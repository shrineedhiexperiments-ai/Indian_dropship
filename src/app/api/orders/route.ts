import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAuth } from '@/lib/middleware';

export async function GET(req: NextRequest) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orders = await db.order.findMany({
      where: { userId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
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
    const { email, name, phone, street, zip, city, canton, items } = body;

    if (!email || !name || !street || !zip || !city || !items?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Calculate totals
    let subtotalRappen = 0;
    const itemsData = [];

    for (const item of items) {
      const product = await db.product.findUnique({
        where: { id: item.productId },
      });

      if (!product || !product.active) {
        return NextResponse.json(
          { error: `Product ${item.productId} not found or inactive` },
          { status: 400 }
        );
      }

      const itemTotal = product.priceRappen * item.qty;
      subtotalRappen += itemTotal;

      itemsData.push({
        productId: product.id,
        name: product.name,
        qty: item.qty,
        unitRappen: product.priceRappen,
      });
    }

    // Calculate shipping
    const shippingRappen = parseInt(
      process.env.SHIPPING_FLAT_CHF || '9.90'.replace('.', '')
    ) * 100;
    const freeShippingOver = parseInt(
      (process.env.FREE_SHIPPING_OVER_CHF || '120').replace('.', '')
    ) * 100;

    const finalShipping =
      subtotalRappen >= freeShippingOver ? 0 : shippingRappen;
    const totalRappen = subtotalRappen + finalShipping;

    // Create order
    const order = await db.order.create({
      data: {
        userId,
        email,
        name,
        phone: phone || null,
        street,
        zip,
        city,
        canton: canton || null,
        subtotalRappen,
        shippingRappen: finalShipping,
        totalRappen,
        items: {
          create: itemsData,
        },
      },
      include: { items: { include: { product: true } } },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
