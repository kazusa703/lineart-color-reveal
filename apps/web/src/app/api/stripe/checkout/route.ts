import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

const PRICE_MAP: Record<string, { priceEnv: string; credits: number }> = {
  '10': { priceEnv: 'STRIPE_PRICE_CREDITS_10', credits: 10 },
  '30': { priceEnv: 'STRIPE_PRICE_CREDITS_30', credits: 30 },
  '100': { priceEnv: 'STRIPE_PRICE_CREDITS_100', credits: 100 },
};

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  }

  let body: { pack?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const packKey = String(body.pack ?? '');
  const pack = PRICE_MAP[packKey];
  if (!pack) {
    return NextResponse.json(
      { error: 'Invalid pack. Choose 10, 30, or 100.' },
      { status: 400 },
    );
  }

  const priceId = process.env[pack.priceEnv];
  if (!priceId) {
    return NextResponse.json(
      { error: `Price not configured for ${packKey} credits.` },
      { status: 503 },
    );
  }

  const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';

  const stripe = new Stripe(secretKey);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { credits: String(pack.credits) },
      success_url: `${appUrl}/pricing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout] Error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session.' }, { status: 500 });
  }
}
