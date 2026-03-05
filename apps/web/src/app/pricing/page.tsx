export default function PricingPage() {
  const plans = [
    {
      name: 'Free',
      price: '0',
      features: [
        'Line art generation (with limits)',
        '1024px export with watermark',
        'Brush editing tools',
        'Undo/Redo',
      ],
      cta: 'Get Started',
      highlight: false,
    },
    {
      name: 'Starter',
      price: '500',
      credits: '10 credits',
      features: [
        'Everything in Free',
        '2048px export (1 credit)',
        '4096px export (3 credits)',
        'No watermark',
        'Priority processing',
      ],
      cta: 'Coming Soon',
      highlight: true,
    },
    {
      name: 'Pro',
      price: '2,000',
      credits: '50 credits',
      features: [
        'Everything in Starter',
        'Bulk processing',
        'API access',
        'Commercial license',
      ],
      cta: 'Coming Soon',
      highlight: false,
    },
  ];

  return (
    <main className="min-h-[calc(100vh-57px)] px-4 py-16">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-3xl font-bold mb-2">Pricing</h1>
        <p className="text-zinc-500 mb-12">
          Pay only for what you use. Credits never expire.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`
                rounded-xl border p-6 text-left flex flex-col
                ${plan.highlight ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border bg-surface'}
              `}
            >
              <h2 className="text-xl font-bold">{plan.name}</h2>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold">&yen;{plan.price}</span>
                {plan.credits && (
                  <span className="text-sm text-zinc-500 ml-2">{plan.credits}</span>
                )}
              </div>
              <ul className="flex-1 space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className="text-accent mt-0.5">&#10003;</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                disabled={plan.cta === 'Coming Soon'}
                className={`
                  w-full py-2 px-4 rounded-lg font-medium text-sm transition-colors
                  ${
                    plan.cta === 'Coming Soon'
                      ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                      : 'bg-accent text-white hover:bg-accent-hover'
                  }
                `}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-12 text-sm text-zinc-400">
          Credit costs: Line art generation = 1 credit | 2048px export = 1 credit | 4096px export =
          3 credits
        </p>
      </div>
    </main>
  );
}
