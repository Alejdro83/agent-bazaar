'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTelegram } from '@/hooks/useTelegram';

const TABS = [
  { href: '/', icon: '🏠', label: 'Home' },
  { href: '/', icon: '🔍', label: 'Search' },
  { href: '/dashboard', icon: '🤖', label: 'My Agents' },
  { href: '/dashboard', icon: '👤', label: 'Profile' },
] as const;

export function MiniAppShell({ children }: { children: ReactNode }) {
  const { colorScheme, viewportHeight, webApp } = useTelegram();
  const pathname = usePathname();
  const isInTelegram = webApp !== null;

  return (
    <div
      className={`min-h-screen ${
        colorScheme === 'dark' ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'
      }`}
      style={{ minHeight: viewportHeight || '100vh' }}
    >
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <h1 className="text-lg font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              Agent Bazaar
            </h1>
          </Link>
          <nav className="flex items-center gap-3">
            <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
              Browse
            </Link>
            <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
              My Agents
            </Link>
            {/* Outside Telegram, wallet connection is the only identity — inside
                Telegram, initData already identifies the user. */}
            {!isInTelegram && <ConnectButton showBalance={false} accountStatus="address" />}
          </nav>
        </div>
      </header>

      <main className="px-4 py-4">
        {children}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="flex items-center justify-around py-2 px-4">
          {TABS.map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex flex-col items-center gap-1 transition-colors ${
                pathname === tab.href ? 'text-amber-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="text-xs">{tab.label}</span>
            </Link>
          ))}
        </div>
      </footer>
    </div>
  );
}