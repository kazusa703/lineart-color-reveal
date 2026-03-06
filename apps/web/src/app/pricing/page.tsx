'use client';

import { useState, useEffect, useCallback } from 'react';

interface Plan {
  name: string;
  pack: string;
  price: string;
  credits: number;
  perCredit: string;
}

const PLANS: Plan[] = [
  { name: 'Starter', pack: '10', price: '500', credits: 10, perCredit: '50' },
  { name: 'Standard', pack: '30', price: '1,200', credits: 30, perCredit: '40' },
  { name: 'Pro', pack: '100', price: '3,000', credits: 100, perCredit: '30' },
];

export default function PricingPage() {
  const [redeemCode, setRedeemCode] = useState('');
  const [storedCode, setStoredCode] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load stored code on mount + check for session_id from Stripe redirect
  useEffect(() => {
    const saved = localStorage.getItem('redeemCode') ?? '';
    if (saved) {
      setStoredCode(saved);
      fetchBalance(saved);
    }

    // Check for Stripe success redirect
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (sessionId) {
      setSuccess('Payment successful! Retrieving your redeem code...');
      // Clean up URL
      window.history.replaceState({}, '', '/pricing');

      // Poll for the redeem code from KV
      let attempts = 0;
      const maxAttempts = 20;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(`/api/stripe/session?session_id=${sessionId}`);
          const data = await res.json();
          if (data.ready && data.code) {
            clearInterval(poll);
            localStorage.setItem('redeemCode', data.code);
            setStoredCode(data.code);
            setBalance(data.credits);
            setSuccess(`Code activated! ${data.credits} credits available.`);
          } else if (attempts >= maxAttempts) {
            clearInterval(poll);
            setSuccess('Payment successful! Your redeem code is being processed. Please refresh the page in a moment.');
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(poll);
            setSuccess('Payment successful! Your redeem code is being processed. Please refresh the page in a moment.');
          }
        }
      }, 1000);

      return () => clearInterval(poll);
    }
  }, []);

  const fetchBalance = async (code: string) => {
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.credits);
      } else {
        setBalance(null);
        if (res.status === 404) {
          localStorage.removeItem('redeemCode');
          setStoredCode('');
        }
      }
    } catch {
      setBalance(null);
    }
  };

  const handlePurchase = useCallback(async (pack: string) => {
    setLoading(pack);
    setError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purchase failed');
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setLoading(null);
    }
  }, []);

  const handleRedeem = useCallback(async () => {
    const code = redeemCode.trim().toUpperCase();
    if (!code) return;
    setLoading('redeem');
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code');
      localStorage.setItem('redeemCode', code);
      setStoredCode(code);
      setBalance(data.credits);
      setRedeemCode('');
      setSuccess(`Code activated! ${data.credits} credits available.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redeem failed');
    } finally {
      setLoading(null);
    }
  }, [redeemCode]);

  const handleClearCode = useCallback(() => {
    localStorage.removeItem('redeemCode');
    setStoredCode('');
    setBalance(null);
    setSuccess(null);
  }, []);

  return (
    <main className="min-h-[calc(100vh-57px)] px-4 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-2">Credits</h1>
          <p className="text-zinc-500">
            Purchase credits for high-resolution exports without watermark.
          </p>
        </div>

        {/* Current balance */}
        {storedCode && (
          <div className="max-w-md mx-auto mb-8 p-4 rounded-xl border border-accent/30 bg-accent/5 text-center">
            <p className="text-sm text-zinc-500 mb-1">Your balance</p>
            <p className="text-3xl font-bold text-accent">
              {balance !== null ? balance : '...'} <span className="text-base font-normal">credits</span>
            </p>
            <p className="text-xs text-zinc-400 mt-1 font-mono">{storedCode}</p>
            <p className="text-xs text-amber-600 mt-2">
              This code is stored in your browser only. Please save it somewhere safe for use on other devices.
            </p>
            <button
              onClick={handleClearCode}
              className="text-xs text-zinc-400 hover:text-red-500 mt-2 transition-colors"
            >
              Clear code
            </button>
          </div>
        )}

        {/* Error / Success */}
        {error && (
          <div className="max-w-md mx-auto mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="max-w-md mx-auto mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm text-center">
            {success}
          </div>
        )}

        {/* Credit packs */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {PLANS.map((plan) => (
            <div
              key={plan.pack}
              className={`rounded-xl border p-6 text-left flex flex-col ${
                plan.pack === '30'
                  ? 'border-accent bg-accent/5 ring-1 ring-accent'
                  : 'border-border bg-surface'
              }`}
            >
              <h2 className="text-xl font-bold">{plan.name}</h2>
              <div className="mt-2 mb-1">
                <span className="text-3xl font-bold">&yen;{plan.price}</span>
              </div>
              <p className="text-sm text-zinc-500 mb-4">
                {plan.credits} credits (&yen;{plan.perCredit}/credit)
              </p>
              <ul className="flex-1 space-y-2 mb-6 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  2048px export (1 credit)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  4096px export (3 credits)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  No watermark
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  Credits never expire
                </li>
              </ul>
              <button
                onClick={() => handlePurchase(plan.pack)}
                disabled={loading !== null}
                className={`w-full py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
                  plan.pack === '30'
                    ? 'bg-accent text-white hover:bg-accent-hover disabled:opacity-50'
                    : 'bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-50'
                }`}
              >
                {loading === plan.pack ? 'Redirecting...' : `Buy ${plan.credits} credits`}
              </button>
            </div>
          ))}
        </div>

        {/* Free tier info */}
        <div className="max-w-md mx-auto mb-12 p-4 rounded-xl border border-border bg-surface text-center">
          <h3 className="font-bold mb-2">Free tier</h3>
          <p className="text-sm text-zinc-500">
            1024px export is always free (with watermark). Line art generation has rate limits.
          </p>
        </div>

        {/* Redeem code input */}
        <div className="max-w-md mx-auto">
          <h3 className="font-bold text-sm text-zinc-400 uppercase tracking-wider mb-3 text-center">
            Redeem Code
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-white text-sm font-mono placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-accent/30"
              onKeyDown={(e) => e.key === 'Enter' && handleRedeem()}
            />
            <button
              onClick={handleRedeem}
              disabled={loading !== null || !redeemCode.trim()}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-white text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {loading === 'redeem' ? '...' : 'Apply'}
            </button>
          </div>
          <p className="text-xs text-zinc-400 mt-2 text-center">
            Enter the redeem code you received after purchase.
          </p>
        </div>

        <p className="mt-12 text-sm text-zinc-400 text-center">
          Credit costs: 2048px export = 1 credit | 4096px export = 3 credits
        </p>
      </div>
    </main>
  );
}
