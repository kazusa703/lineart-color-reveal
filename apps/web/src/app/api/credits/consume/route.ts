import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getClientFingerprint, checkRateLimit, checkOrigin } from '@/utils/apiGuards';

export const runtime = 'nodejs';

const RATE_LIMIT_CONSUME = 30; // per minute

// Lua script for atomic credit consumption.
// Returns:
//   -1 if key does not exist
//   -2 if insufficient credits
//   remaining credits on success
const CONSUME_LUA = `
local key = KEYS[1]
local amount = tonumber(ARGV[1])
local now = ARGV[2]
local raw = redis.call('GET', key)
if not raw then return -1 end
local data = cjson.decode(raw)
if data.credits < amount then return -2 end
data.credits = data.credits - amount
data.updatedAt = tonumber(now)
redis.call('SET', key, cjson.encode(data))
return data.credits
`;

export async function POST(req: NextRequest) {
  // Origin check
  const originError = checkOrigin(req);
  if (originError) return originError;

  // Rate limit
  const fingerprint = getClientFingerprint(req);
  if (!checkRateLimit(fingerprint, 'consume', RATE_LIMIT_CONSUME)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 },
    );
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return NextResponse.json({ error: 'Storage not configured.' }, { status: 503 });
  }

  let body: { code?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const code = String(body.code ?? '').trim().toUpperCase();
  const amount = Number(body.amount);

  if (!code || code.length < 10) {
    return NextResponse.json({ error: 'Invalid redeem code.' }, { status: 400 });
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
  }

  const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const key = `redeem:${code}`;

  // Atomic consume via Lua script
  const result = await redis.eval(
    CONSUME_LUA,
    [key],
    [String(amount), String(Date.now())],
  ) as number;

  if (result === -1) {
    return NextResponse.json({ error: 'Redeem code not found.' }, { status: 404 });
  }
  if (result === -2) {
    return NextResponse.json(
      { error: 'Insufficient credits.', required: amount },
      { status: 402 },
    );
  }

  return NextResponse.json({
    credits: result,
    consumed: amount,
  });
}
