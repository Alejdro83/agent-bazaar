'use client';

import { type ReactNode } from 'react';
import { useTelegram } from '@/hooks/useTelegram';

export function MiniAppShell({ children }: { children: ReactNode }) {
  const { colorScheme, viewportHeight } = useTelegram();

  return (
    <div
      className={`min-h-screen ${
        colorScheme === 'dark' ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'
      }`}
      style={{ minHeight: viewportHeight || '100vh' }}
    >
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <h1 className="text-lg font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              Agent Bazaar
            </h1>
          </div>
          <nav className="flex items-center gap-3">
            <button className="text-sm text-gray-400 hover:text-white transition-colors">
              Browse
            </button>
            <button className="text-sm text-gray-400 hover:text-white transition-colors">
              My Agents
            </button>
          </nav>
        </div>
      </header>

      <main className="px-4 py-4">
        {children}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="flex items-center justify-around py-2 px-4">
          <button className="flex flex-col items-center gap-1 text-amber-400">
            <span className="text-lg">🏠</span>
            <span className="text-xs">Home</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors">
            <span className="text-lg">🔍</span>
            <span className="text-xs">Search</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors">
            <span className="text-lg">🤖</span>
            <span className="text-xs">My Agents</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-gray-400 hover:text-white transition-colors">
            <span className="text-lg">👤</span>
            <span className="text-xs">Profile</span>
          </button>
        </div>
      </footer>
    </div>
  );
}