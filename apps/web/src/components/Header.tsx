'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n, LOCALE_LABELS, type Locale } from '@/utils/i18n';

function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">{t('help.title')}</h2>

        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-bold">{t('help.step1.title')}</h3>
            <p className="text-zinc-600">{t('help.step1.desc')}</p>
          </div>
          <div>
            <h3 className="font-bold">{t('help.step2.title')}</h3>
            <p className="text-zinc-600">{t('help.step2.desc')}</p>
          </div>
          <div>
            <h3 className="font-bold">{t('help.step3.title')}</h3>
            <p className="text-zinc-600">{t('help.step3.desc')}</p>
          </div>
          <div>
            <h3 className="font-bold">{t('help.step4.title')}</h3>
            <p className="text-zinc-600">{t('help.step4.desc')}</p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-bold text-sm mb-2">{t('help.shortcuts')}</h3>
          <div className="grid grid-cols-2 gap-1 text-xs text-zinc-500">
            <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">B</span><span>Brush</span>
            <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">E</span><span>Eraser</span>
            <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">[ / ]</span><span>Brush size</span>
            <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">Cmd+Z</span><span>Undo</span>
            <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">Cmd+Shift+Z</span><span>Redo</span>
            <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">Scroll</span><span>Zoom</span>
            <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">+ / -</span><span>Zoom in/out</span>
            <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">Arrows</span><span>Pan</span>
            <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">Space+Drag</span><span>Pan</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          {t('help.close')}
        </button>
      </div>
    </div>
  );
}

function LanguageDropdown() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="hover:text-accent transition-colors flex items-center gap-1"
      >
        {LOCALE_LABELS[locale]}
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[120px]">
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => { setLocale(l); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 transition-colors ${
                  l === locale ? 'text-accent font-medium' : ''
                }`}
              >
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Header() {
  const { t } = useI18n();
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <header className="border-b border-border bg-surface px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-foreground">
          LineArt Color Reveal
        </Link>
        <nav className="flex gap-4 text-sm items-center">
          <button
            onClick={() => setShowHelp(true)}
            className="hover:text-accent transition-colors"
          >
            {t('nav.help')}
          </button>
          <Link href="/" className="hover:text-accent transition-colors">
            {t('nav.upload')}
          </Link>
          <Link href="/pricing" className="hover:text-accent transition-colors">
            {t('nav.pricing')}
          </Link>
          <LanguageDropdown />
        </nav>
      </header>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}
