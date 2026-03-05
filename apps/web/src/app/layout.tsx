import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'LineArt Color Reveal',
  description: 'Transform photos into line art and selectively reveal colors',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="border-b border-border bg-surface px-6 py-3 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold text-foreground">
            LineArt Color Reveal
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="hover:text-accent transition-colors">
              Upload
            </Link>
            <Link href="/pricing" className="hover:text-accent transition-colors">
              Pricing
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
