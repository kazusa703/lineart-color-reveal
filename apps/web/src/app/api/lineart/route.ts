import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { getClientFingerprint, checkRateLimit } from '@/utils/apiGuards';

export const runtime = 'nodejs';

// --- Upstash Redis (optional, for persistent cache across deploys) ---
let redis: Redis | null = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

const RATE_LIMIT_LINEART = Number(process.env.RATE_LIMIT_PER_MINUTE) || 10;

// --- Result cache (two-tier: in-memory + Upstash Redis) ---
// Key: `lineart:${model}:${maxDim}:${sha256 of input bytes}`
// Lookup order: memory → KV → Replicate
// TODO: If base64 payloads become too large, store in Blob storage and
// keep only the URL in the cache entry.
interface CacheEntry {
  createdAt: number;
  lineArtPngBase64: string;
}

const memCache = new Map<string, CacheEntry>();
const CACHE_TTL_SEC = Number(process.env.LINEART_CACHE_TTL_SEC) || 86400; // default 24h
const CACHE_TTL_MS = CACHE_TTL_SEC * 1000;

// Returns { entry, source } where source indicates where the hit came from.
async function getCachedResult(key: string): Promise<{ entry: CacheEntry; source: string } | null> {
  // 1. Memory cache
  const mem = memCache.get(key);
  if (mem) {
    if (Date.now() - mem.createdAt > CACHE_TTL_MS) {
      memCache.delete(key);
    } else {
      return { entry: mem, source: 'cache-mem' };
    }
  }

  // 2. KV cache (Upstash Redis)
  if (redis) {
    try {
      const kv = await redis.get<CacheEntry>(key);
      if (kv) {
        // Populate memory cache for subsequent hits on this instance
        memCache.set(key, kv);
        return { entry: kv, source: 'cache-kv' };
      }
    } catch (err) {
      console.warn('[lineart] KV read failed, continuing without cache:', err);
    }
  }

  return null;
}

async function setCachedResult(key: string, value: CacheEntry): Promise<void> {
  // Always write to memory
  memCache.set(key, value);

  // Write to KV if available
  if (redis) {
    try {
      await redis.set(key, value, { ex: CACHE_TTL_SEC });
    } catch (err) {
      console.warn('[lineart] KV write failed:', err);
    }
  }
}

// Clean stale memory cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memCache) {
    if (now - entry.createdAt > CACHE_TTL_MS) memCache.delete(key);
  }
}, 600_000); // every ~10 min

// --- In-flight dedup ---
// Concurrent requests for the same cacheKey share a single Replicate call.
// The promise resolves with a success result or rejects with an ApiError.
interface ApiResult {
  lineArtPngBase64: string;
  provider: string;
  model: string;
  elapsedMs: number;
}

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const inFlight = new Map<string, Promise<ApiResult>>();

// --- Constants ---
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_DIM = Number(process.env.LINEART_MAX_DIM) || 1536;
const POLL_INTERVAL = Number(process.env.REPLICATE_POLL_INTERVAL_MS) || 500;
const TIMEOUT_MS = Number(process.env.REPLICATE_TIMEOUT_MS) || 60_000;
const REPLICATE_API = 'https://api.replicate.com/v1/predictions';

// Extract image URL from Replicate prediction output.
// Output shape varies by model: string, string[], or object.
function extractOutputUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const url = output.find((v) => typeof v === 'string');
    return url ?? null;
  }
  if (output && typeof output === 'object') {
    for (const val of Object.values(output)) {
      if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:'))) {
        return val;
      }
    }
  }
  return null;
}

// Run a Replicate prediction and return the result base64.
// Throws ApiError on failure so callers (including in-flight waiters) get the error.
async function runReplicatePrediction(
  token: string,
  model: string,
  dataUrl: string,
  cacheKey: string,
): Promise<ApiResult> {
  const startTime = Date.now();

  // Create prediction
  // TODO: If data URL is too large for the model, upload to Vercel Blob
  // or similar temp storage and pass a URL instead.
  const createRes = await fetch(REPLICATE_API, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: { image: dataUrl },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    console.error(`[lineart] Replicate create failed: ${createRes.status} ${err}`);
    throw new ApiError('Failed to start line art generation.', 502);
  }

  const prediction = await createRes.json();
  const predictionUrl: string = prediction.urls?.get ?? prediction.url;
  if (!predictionUrl) {
    console.error('[lineart] No prediction URL in response:', prediction);
    throw new ApiError('Invalid response from AI service.', 502);
  }

  // Poll for completion
  let result = prediction;
  while (result.status !== 'succeeded' && result.status !== 'failed' && result.status !== 'canceled') {
    const elapsed = Date.now() - startTime;
    if (elapsed > TIMEOUT_MS) {
      console.error(`[lineart] Timeout after ${elapsed}ms`);
      throw new ApiError('Line art generation timed out. Please try again.', 504);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const pollRes = await fetch(predictionUrl, {
      headers: { 'Authorization': `Token ${token}` },
    });
    if (!pollRes.ok) {
      console.error(`[lineart] Poll failed: ${pollRes.status}`);
      throw new ApiError('Failed to check generation status.', 502);
    }
    result = await pollRes.json();
  }

  if (result.status !== 'succeeded') {
    console.error(`[lineart] Prediction ${result.status}:`, result.error);
    throw new ApiError(result.error || 'Line art generation failed.', 500);
  }

  // Extract output image URL
  const outputUrl = extractOutputUrl(result.output);
  if (!outputUrl) {
    console.error('[lineart] Could not extract output URL:', result.output);
    throw new ApiError('Unexpected output format from AI service.', 502);
  }

  // Fetch the output image
  const imageRes = await fetch(outputUrl);
  if (!imageRes.ok) {
    console.error(`[lineart] Failed to fetch output image: ${imageRes.status}`);
    throw new ApiError('Failed to download generated line art.', 502);
  }

  const imageBuffer = await imageRes.arrayBuffer();
  const lineArtBase64 = Buffer.from(imageBuffer).toString('base64');

  // Cache successful result
  await setCachedResult(cacheKey, {
    createdAt: Date.now(),
    lineArtPngBase64: lineArtBase64,
  });

  const elapsedMs = Date.now() - startTime;
  console.log(`[lineart] Done in ${elapsedMs}ms | output ${imageBuffer.byteLength} bytes | cached`);

  return { lineArtPngBase64: lineArtBase64, provider: 'replicate', model, elapsedMs };
}

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Line art API is not configured.' },
      { status: 503 },
    );
  }

  // Rate limit
  const fingerprint = getClientFingerprint(req);
  if (!checkRateLimit(fingerprint, 'lineart', RATE_LIMIT_LINEART)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 },
    );
  }

  // Validate content-type
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    return NextResponse.json(
      { error: 'Content-Type must be image/*.' },
      { status: 400 },
    );
  }

  // Read body
  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Max 10 MB.' },
      { status: 413 },
    );
  }

  const body = await req.arrayBuffer();
  if (body.byteLength > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Max 10 MB.' },
      { status: 413 },
    );
  }
  if (body.byteLength === 0) {
    return NextResponse.json(
      { error: 'No image data provided.' },
      { status: 400 },
    );
  }

  // Validate image type via magic bytes
  const header = new Uint8Array(body.slice(0, 4));
  const isPNG = header[0] === 0x89 && header[1] === 0x50;
  const isJPEG = header[0] === 0xff && header[1] === 0xd8;
  const isWebP = header[0] === 0x52 && header[1] === 0x49; // "RI" (RIFF)
  if (!isPNG && !isJPEG && !isWebP) {
    return NextResponse.json(
      { error: 'Unsupported image format. Use PNG, JPEG, or WebP.' },
      { status: 400 },
    );
  }

  // Convert to data URL for Replicate input
  const mimeType = isPNG ? 'image/png' : isJPEG ? 'image/jpeg' : 'image/webp';
  const base64Input = Buffer.from(body).toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Input}`;

  // Select model
  const model = process.env.REPLICATE_LINEART_MODEL || 'jagvar/dexined';

  // Cache lookup: hash the actual input bytes (post-resize happens client-side)
  const inputHash = crypto.createHash('sha256').update(Buffer.from(body)).digest('hex');
  const cacheKey = `lineart:${model}:${MAX_DIM}:${inputHash}`;

  // 1. Cache hit → return immediately
  const cached = await getCachedResult(cacheKey);
  if (cached) {
    console.log(`[lineart] ${cached.source.toUpperCase()} HIT ${fingerprint} | key=${cacheKey.slice(-16)}`);
    return NextResponse.json({
      lineArtPngBase64: cached.entry.lineArtPngBase64,
      provider: cached.source,
      model,
      elapsedMs: 0,
    });
  }

  // 2. In-flight dedup → if another request is already running for this key, wait for it
  const existing = inFlight.get(cacheKey);
  if (existing) {
    console.log(`[lineart] IN-FLIGHT JOIN ${fingerprint} | key=${cacheKey.slice(-16)}`);
    try {
      const result = await existing;
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      return NextResponse.json(
        { error: 'An unexpected error occurred during line art generation.' },
        { status: 500 },
      );
    }
  }

  // 3. New request → run prediction and register in inFlight
  console.log(
    `[lineart] ${fingerprint} | ${body.byteLength} bytes | model=${model} | maxDim=${MAX_DIM}`,
  );

  const promise = runReplicatePrediction(token, model, dataUrl, cacheKey);
  inFlight.set(cacheKey, promise);

  try {
    const result = await promise;
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[lineart] Unexpected error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred during line art generation.' },
      { status: 500 },
    );
  } finally {
    inFlight.delete(cacheKey);
  }
}
