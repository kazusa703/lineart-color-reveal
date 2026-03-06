import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getClientFingerprint, checkRateLimit, checkOrigin } from '@/utils/apiGuards';

export const runtime = 'nodejs';

const RATE_LIMIT_REDEEM = 20; // per minute — strict to prevent code brute-force

interface RedeemData {
  credits: number;
  createdAt: number;
  updatedAt: number;
  stripeSessionId?: string;
}

export async function POST(req: NextRequest) {
  // Origin check
  const originError = checkOrigin(req);
  if (originError) return originError;

  // Rate limit
  const fingerprint = getClientFingerprint(req);
  if (!checkRateLimit(fingerprint, 'redeem', RATE_LIMIT_REDEEM)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 },
    );
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return NextResponse.json({ error: 'Storage not configured.' }, { status: 503 });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const code = String(body.code ?? '').trim().toUpperCase();
  if (!code || code.length < 10) {
    return NextResponse.json({ error: 'Invalid redeem code.' }, { status: 400 });
  }

  const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const data = await redis.get<RedeemData>(`redeem:${code}`);
  if (!data) {
    return NextResponse.json({ error: 'Redeem code not found or expired.' }, { status: 404 });
  }

  return NextResponse.json({
    code,
    credits: data.credits,
    createdAt: data.createdAt,
  });
}
