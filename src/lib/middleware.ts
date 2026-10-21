import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE = 'session';

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ chars)');
  return new TextEncoder().encode(s);
}

export async function verifyAuth(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, key());
    return payload.sub || null;
  } catch {
    return null;
  }
}

export async function requireAuthMiddleware(req: NextRequest) {
  const userId = await verifyAuth(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return userId;
}

export async function withCors(req: NextRequest, handler: () => Promise<NextResponse>) {
  // Allow same-origin requests
  const origin = req.headers.get('origin');
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  if (origin && (origin === appUrl || origin === 'http://localhost:3000')) {
    const response = await handler();
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    return response;
  }

  return await handler();
}

export function handleCorsPreFlight(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  }
  return null;
}
