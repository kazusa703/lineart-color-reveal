import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return NextResponse.json({ error: 'Storage not configured.' }, { status: 503 });
  }

  const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  // Look up the redeem code by Stripe session ID
  const code = await redis.get<string>(`stripe_session:${sessionId}`);

  if (!code || code === 'processed') {
    // Webhook hasn't stored the code yet, or session was already fully processed
    return NextResponse.json({ ready: false });
  }

  // Fetch the redeem data to get credits
  const redeemData = await redis.get<{ credits: number }>(`redeem:${code}`);

  return NextResponse.json({
    ready: true,
    code,
    credits: redeemData?.credits ?? 0,
  });
}
