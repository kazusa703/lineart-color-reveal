import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { Redis } from '@upstash/redis';
import { getClientFingerprint, checkRateLimit, checkOrigin } from '@/utils/apiGuards';

export const runtime = 'nodejs';

const RATE_LIMIT_EXPORT = Number(process.env.EXPORT_RATE_LIMIT_PER_MINUTE) || 20;

// Beta watermark: ON by default, disabled when a valid redeem code is provided.
// Can also be globally disabled via env var for testing.
const BETA_WATERMARK_GLOBAL = process.env.BETA_WATERMARK_ENABLED !== 'false';

const EXPORT_CREDIT_COST: Record<number, number> = {
  2048: 1,
  4096: 3,
};

// --- Constants ---
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per layer
const ALLOWED_WIDTHS = new Set([2048, 4096]);

// Lua script for atomic credit consumption (same as /api/credits/consume).
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

// 3x3 box blur on single-channel Uint8Array
function boxBlurU8(src: Uint8Array, w: number, h: number): Uint8Array {
  const dst = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += src[(y + dy) * w + (x + dx)];
        }
      }
      dst[y * w + x] = (sum / 9) | 0;
    }
  }
  for (let x = 0; x < w; x++) {
    dst[x] = src[x];
    dst[(h - 1) * w + x] = src[(h - 1) * w + x];
  }
  for (let y = 0; y < h; y++) {
    dst[y * w] = src[y * w];
    dst[y * w + (w - 1)] = src[y * w + (w - 1)];
  }
  return dst;
}

// Generate a watermark overlay as a transparent PNG via SVG.
function createWatermarkOverlay(w: number, h: number, text: string): Buffer {
  const fontSize = Math.max(16, Math.round(w / 28));
  const padding = Math.round(fontSize * 0.8);
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${w - padding}" y="${h - padding}"
        font-family="sans-serif" font-size="${fontSize}"
        fill="black" fill-opacity="0.18"
        text-anchor="end" dominant-baseline="auto"
      >${text}</text>
    </svg>`,
  );
  return svg;
}

// --- Authorization: check redeem code and consume credits atomically ---
// Returns { watermark: boolean } if authorized, or an error NextResponse.
async function authorizeExport(
  req: NextRequest,
  formData: FormData,
  targetWidth: number,
): Promise<{ watermark: boolean } | NextResponse> {
  const cost = EXPORT_CREDIT_COST[targetWidth];
  if (!cost) {
    return { watermark: BETA_WATERMARK_GLOBAL };
  }

  // Get redeem code from header or form field
  const code = (
    req.headers.get('x-redeem-code') ??
    (formData.get('redeemCode') as string | null) ??
    ''
  ).trim().toUpperCase();

  if (!code) {
    // No code provided — allow export with watermark
    return { watermark: BETA_WATERMARK_GLOBAL };
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return { watermark: BETA_WATERMARK_GLOBAL };
  }

  const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  // Atomic consume via Lua script
  const result = await redis.eval(
    CONSUME_LUA,
    [`redeem:${code}`],
    [String(cost), String(Date.now())],
  ) as number;

  if (result === -1) {
    return NextResponse.json(
      { error: 'Invalid redeem code.' },
      { status: 403 },
    );
  }

  if (result === -2) {
    return NextResponse.json(
      { error: 'Insufficient credits.', required: cost },
      { status: 402 },
    );
  }

  console.log(`[export] Consumed ${cost} credit(s) from code → ${result} remaining`);

  // Paid export: no watermark
  return { watermark: false };
}

// --- Core export logic ---
async function buildExportImage(
  origBuf: ArrayBuffer,
  laBuf: ArrayBuffer,
  maskBuf: ArrayBuffer,
  targetWidth: number,
  feather: number,
  watermark: boolean,
): Promise<Buffer> {
  const origMeta = await sharp(Buffer.from(origBuf)).metadata();
  const srcW = origMeta.width!;
  const srcH = origMeta.height!;
  const scale = targetWidth / srcW;
  const targetHeight = Math.round(srcH * scale);

  const [origRaw, laRaw, maskRaw] = await Promise.all([
    sharp(Buffer.from(origBuf))
      .resize(targetWidth, targetHeight, { kernel: 'lanczos3' })
      .removeAlpha()
      .raw()
      .toBuffer(),
    sharp(Buffer.from(laBuf))
      .resize(targetWidth, targetHeight, { kernel: 'lanczos3' })
      .removeAlpha()
      .raw()
      .toBuffer(),
    sharp(Buffer.from(maskBuf))
      .resize(targetWidth, targetHeight, { kernel: 'lanczos3' })
      .grayscale()
      .raw()
      .toBuffer(),
  ]);

  const maskChannel = new Uint8Array(maskRaw);
  if (feather > 0) {
    const passes = feather < 6 ? 1 : 2;
    const strength = Math.min(1, feather / 10);
    const origMask = new Uint8Array(maskChannel);
    let blurred: Uint8Array = new Uint8Array(maskChannel);
    for (let p = 0; p < passes; p++) {
      blurred = boxBlurU8(blurred, targetWidth, targetHeight);
    }
    for (let i = 0; i < maskChannel.length; i++) {
      maskChannel[i] = Math.round(origMask[i] * (1 - strength) + blurred[i] * strength);
    }
  }

  const pixelCount = targetWidth * targetHeight;
  const outputBuf = Buffer.alloc(pixelCount * 3);

  for (let i = 0; i < pixelCount; i++) {
    const alpha = maskChannel[i] / 255;
    const idx3 = i * 3;
    outputBuf[idx3] = Math.round(laRaw[idx3] * (1 - alpha) + origRaw[idx3] * alpha);
    outputBuf[idx3 + 1] = Math.round(laRaw[idx3 + 1] * (1 - alpha) + origRaw[idx3 + 1] * alpha);
    outputBuf[idx3 + 2] = Math.round(laRaw[idx3 + 2] * (1 - alpha) + origRaw[idx3 + 2] * alpha);
  }

  let pipeline = sharp(outputBuf, {
    raw: { width: targetWidth, height: targetHeight, channels: 3 },
  });

  if (watermark) {
    const watermarkSvg = createWatermarkOverlay(
      targetWidth,
      targetHeight,
      'BETA \u2022 High-res export',
    );
    pipeline = pipeline.composite([{ input: watermarkSvg, top: 0, left: 0 }]);
  }

  return pipeline.png().toBuffer();
}

export async function POST(req: NextRequest) {
  // Origin check
  const originError = checkOrigin(req);
  if (originError) return originError;

  // Rate limit
  const fingerprint = getClientFingerprint(req);
  if (!checkRateLimit(fingerprint, 'export', RATE_LIMIT_EXPORT)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 },
    );
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Expected multipart/form-data.' },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
  }

  const originalFile = formData.get('originalPng') as File | null;
  const lineArtFile = formData.get('lineArtPng') as File | null;
  const maskFile = formData.get('revealMaskPng') as File | null;
  const targetWidthStr = formData.get('targetWidth') as string | null;
  const featherStr = formData.get('feather') as string | null;

  if (!originalFile || !lineArtFile || !maskFile || !targetWidthStr) {
    return NextResponse.json(
      { error: 'Missing required fields: originalPng, lineArtPng, revealMaskPng, targetWidth.' },
      { status: 400 },
    );
  }

  const targetWidth = Number(targetWidthStr);
  if (!ALLOWED_WIDTHS.has(targetWidth)) {
    return NextResponse.json(
      { error: 'targetWidth must be 2048 or 4096.' },
      { status: 400 },
    );
  }

  const feather = Math.max(0, Math.min(10, Number(featherStr) || 0));

  // Authorization: check redeem code and consume credits atomically
  const authResult = await authorizeExport(req, formData, targetWidth);
  if (authResult instanceof NextResponse) return authResult;
  const { watermark } = authResult;

  // Size check
  for (const f of [originalFile, lineArtFile, maskFile]) {
    if (f.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Layer too large (${f.name}). Max 10 MB per layer.` },
        { status: 413 },
      );
    }
  }

  const startTime = Date.now();

  try {
    const [origBuf, laBuf, maskBuf] = await Promise.all([
      originalFile.arrayBuffer(),
      lineArtFile.arrayBuffer(),
      maskFile.arrayBuffer(),
    ]);

    const pngBuffer = await buildExportImage(origBuf, laBuf, maskBuf, targetWidth, feather, watermark);

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[export] ${fingerprint} | ${targetWidth}px | feather=${feather} | watermark=${watermark} | ${elapsedMs}ms | ${pngBuffer.length} bytes`,
    );

    return new NextResponse(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="lineart-color-reveal-${targetWidth}px.png"`,
        'Content-Length': String(pngBuffer.length),
      },
    });
  } catch (err) {
    console.error('[export] Error:', err);
    return NextResponse.json(
      { error: 'Export failed. Please try again.' },
      { status: 500 },
    );
  }
}
