import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// --- Rate limiting (in-memory, per-instance) ---

interface RateBucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;

// Separate rate maps per endpoint to avoid cross-contamination
const rateMaps = new Map<string, Map<string, RateBucket>>();

function getRateMap(namespace: string): Map<string, RateBucket> {
  let map = rateMaps.get(namespace);
  if (!map) {
    map = new Map();
    rateMaps.set(namespace, map);
  }
  return map;
}

export function getClientFingerprint(req: NextRequest): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ua = req.headers.get('user-agent') ?? '';
  return crypto.createHash('sha256').update(`${ip}:${ua}`).digest('hex').slice(0, 16);
}

export function checkRateLimit(
  fingerprint: string,
  namespace: string,
  limit: number,
): boolean {
  const map = getRateMap(namespace);
  const now = Date.now();
  const entry = map.get(fingerprint);
  if (!entry || now > entry.resetAt) {
    map.set(fingerprint, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// Clean stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const map of rateMaps.values()) {
    for (const [key, entry] of map) {
      if (now > entry.resetAt) map.delete(key);
    }
  }
}, WINDOW_MS);

// --- Origin check ---

const ALLOWED_LOCAL_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export function checkOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  // Allow requests with no Origin header (e.g. server-to-server, curl)
  if (!origin) return null;

  const appUrl = process.env.PUBLIC_APP_URL;
  if (appUrl && origin === new URL(appUrl).origin) return null;
  if (ALLOWED_LOCAL_ORIGINS.has(origin)) return null;

  return NextResponse.json(
    { error: 'Forbidden.' },
    { status: 403 },
  );
}
