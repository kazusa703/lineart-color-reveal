import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';

// Redeem code: 24 hex chars with hyphens for readability
function generateRedeemCode(): string {
  const bytes = crypto.randomBytes(12);
  const hex = bytes.toString('hex').toUpperCase();
  // Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
  return hex.match(/.{4}/g)!.join('-');
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error('[stripe/webhook] KV (Redis) not configured. Cannot store redeem codes.');
    return NextResponse.json({ error: 'Storage not configured.' }, { status: 503 });
  }

  const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const stripe = new Stripe(secretKey);

  // Raw body for signature verification — must use req.text(), NOT req.json()
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  // Event-level idempotency: prevent duplicate processing even if Stripe retries
  const eventIdempotencyKey = `stripe_event:${event.id}`;
  const alreadyProcessed = await redis.get<string>(eventIdempotencyKey);
  if (alreadyProcessed) {
    console.log(`[stripe/webhook] Duplicate event ${event.id}, skipping`);
    return NextResponse.json({ received: true });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const credits = Number(session.metadata?.credits) || 0;

    if (credits <= 0) {
      console.warn(`[stripe/webhook] event=${event.id} session=${session.id} has no credits metadata`);
      return NextResponse.json({ received: true });
    }

    // Session-level idempotency: same session can appear in multiple events
    const sessionIdempotencyKey = `stripe_session:${session.id}`;
    const existingCode = await redis.get<string>(sessionIdempotencyKey);
    if (existingCode) {
      console.log(`[stripe/webhook] event=${event.id} session=${session.id} already processed → code=${existingCode}`);
      // Mark event as processed too
      await redis.set(eventIdempotencyKey, 'processed', { ex: 86400 * 7 });
      return NextResponse.json({ received: true });
    }

    // Generate redeem code and store
    const code = generateRedeemCode();
    const redeemData = {
      credits,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stripeSessionId: session.id,
    };

    // Store all keys atomically (pipeline)
    const pipeline = redis.pipeline();
    pipeline.set(`redeem:${code}`, redeemData);
    pipeline.set(sessionIdempotencyKey, code, { ex: 86400 * 30 }); // 30 day TTL
    pipeline.set(eventIdempotencyKey, 'processed', { ex: 86400 * 7 }); // 7 day TTL
    await pipeline.exec();

    console.log(
      `[stripe/webhook] event=${event.id} session=${session.id} → code=${code} credits=${credits}`,
    );
  } else {
    // Mark non-checkout events as processed to prevent retries
    await redis.set(eventIdempotencyKey, 'ignored', { ex: 86400 * 7 });
    console.log(`[stripe/webhook] event=${event.id} type=${event.type} ignored`);
  }

  return NextResponse.json({ received: true });
}
