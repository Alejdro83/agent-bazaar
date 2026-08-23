'use client';

import Link from 'next/link';
import { useDisconnect } from 'wagmi';
import { LogOut, Wallet2, Send } from 'lucide-react';
import { useIdentity } from '@/hooks/useIdentity';
import { MiniAppShell } from '@/components/miniapp/MiniAppShell';

export default function ProfilePage() {
  const { identity, isAuthenticated } = useIdentity();
  const { disconnect } = useDisconnect();

  if (!isAuthenticated || !identity) {
    return (
      <MiniAppShell>
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">
            Open this app in Telegram, or connect your wallet, to see your profile
          </p>
        </div>
      </MiniAppShell>
    );
  }

  return (
    <MiniAppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Profile</h1>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20">
            {identity.type === 'wallet' ? (
              <Wallet2 className="h-6 w-6 text-amber-400" strokeWidth={2} />
            ) : (
              <Send className="h-6 w-6 text-amber-400" strokeWidth={2} />
            )}
          </div>
          <div>
            <p className="font-semibold text-white">{identity.displayName}</p>
            <p className="text-xs text-gray-500">
              {identity.type === 'wallet' ? 'Connected via wallet' : 'Connected via Telegram'}
            </p>
          </div>
        </div>

        {identity.type === 'wallet' && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3 mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Wallet address</p>
            <p className="text-sm text-gray-300 font-mono break-all">{identity.address}</p>
          </div>
        )}

        <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Network</p>
          <p className="text-sm text-gray-300">BNB Smart Chain (Testnet)</p>
        </div>
      </div>

      <Link
        href="/dashboard"
        className="block w-full rounded-xl border border-gray-800 py-3 text-center text-white font-medium hover:bg-gray-900/50 transition-colors mb-3"
      >
        Go to My Agents
      </Link>

      {identity.type === 'wallet' && (
        <button
          onClick={() => disconnect()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-900/40 py-3 text-red-400 font-medium hover:bg-red-900/10 transition-colors"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          Disconnect wallet
        </button>
      )}
    </MiniAppShell>
  );
}
