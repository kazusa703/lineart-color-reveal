This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

> **WARNING:** `.env.local` contains secrets (Stripe keys, Redis tokens). Never commit it to git. The `.gitignore` already excludes `.env.local`.

## Stripe Webhook (Local Development)

To test Stripe webhooks locally, use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
# 1. Install Stripe CLI (macOS)
brew install stripe/stripe-cli/stripe

# 2. Login
stripe login

# 3. Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# The CLI will print a webhook signing secret (whsec_...).
# Set it in .env.local:
#   STRIPE_WEBHOOK_SECRET=whsec_...

# 4. In another terminal, trigger a test event
stripe trigger checkout.session.completed
```

## Deploy on Vercel

The easiest way to deploy is with the [Vercel Platform](https://vercel.com/new).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
