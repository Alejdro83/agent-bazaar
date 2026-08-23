'use client';

import { useAccount } from 'wagmi';
import { useTelegram } from './useTelegram';

/**
 * Unifies the two ways a visitor can be "someone" in this app: a validated
 * Telegram user (inside the Mini App) or a connected wallet (on the plain
 * web, where there is no Telegram initData at all).
 *
 * Wallet identity trusts the connected address as-is, with no signature
 * challenge — a deliberate scope cut for the hackathon timeline. It's an
 * acceptable bar here because the one action that actually moves value
 * (hiring, via the real onchain payment in Fase 4) requires signing a real
 * transaction, which *is* proof of control. Listing an agent from the web
 * with a spoofed address is a low-stakes risk (a demo listing, easily
 * moderated), not a payments risk.
 */
export type Identity =
  | { type: 'telegram'; id: string; displayName: string; authHeader: { 'x-telegram-init-data': string } }
  | { type: 'wallet'; address: string; displayName: string; authHeader: { 'x-wallet-address': string } };

export function useIdentity() {
  const telegram = useTelegram();
  const { address, isConnected } = useAccount();

  const isInTelegram = telegram.webApp !== null;

  let identity: Identity | null = null;
  if (isInTelegram && telegram.isAuthenticated && telegram.user) {
    identity = {
      type: 'telegram',
      id: String(telegram.user.id),
      displayName: telegram.user.first_name,
      authHeader: { 'x-telegram-init-data': telegram.webApp!.initData },
    };
  } else if (!isInTelegram && isConnected && address) {
    identity = {
      type: 'wallet',
      address,
      displayName: `${address.slice(0, 6)}…${address.slice(-4)}`,
      authHeader: { 'x-wallet-address': address },
    };
  }

  return {
    identity,
    isAuthenticated: identity !== null,
    isInTelegram,
    isLoading: isInTelegram && telegram.isLoading,
  };
}
