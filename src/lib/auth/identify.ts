import { NextRequest } from 'next/server';
import { validateInitData } from '@/lib/telegram/validate';

export interface Requester {
  id: string;
  source: 'telegram' | 'wallet';
}

const WALLET_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Identifies the caller from either Telegram initData (validated via HMAC)
 * or a connected wallet address (trusted as-is — see useIdentity.ts for why
 * that's an acceptable bar here). Returns null if neither is present/valid.
 */
export function identifyRequester(request: NextRequest): Requester | null {
  const initData = request.headers.get('x-telegram-init-data');
  if (initData) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      const result = validateInitData(initData, botToken);
      if (result.valid && result.user) {
        return { id: String(result.user.id), source: 'telegram' };
      }
    }
    return null;
  }

  const walletAddress = request.headers.get('x-wallet-address');
  if (walletAddress && WALLET_ADDRESS_RE.test(walletAddress)) {
    return { id: walletAddress.toLowerCase(), source: 'wallet' };
  }

  return null;
}
