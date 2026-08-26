/**
 * `contracts.altana_session_key` storage envelope.
 *
 * The SDK's `serializeSession()` output (see `src/lib/altana/index.ts`) is
 * key material — it embeds the session's private key so it can be
 * reconstructed later. We store it wrapped in a small envelope that also
 * tracks OUR OWN revocation bookkeeping (the SDK's session object has no
 * concept of "revoked" — that's purely on-chain state we'd otherwise have
 * to re-derive by re-simulating a call), so the UI can render "revoked"
 * unambiguously without another onchain round trip.
 *
 * SECURITY: `envelope.serialized` carries the same secret as the SDK's raw
 * output — never include it in an API response. Routes here compute a
 * summary (`summarizeSessionEnvelope`) which strips it before responding.
 */

import { formatEther } from 'viem';
import { deserializeSession } from '@bnbagent/sdk/wallets';
// Side-effect only — see that file's docstring: fixes a real Next.js/
// webpack-specific runtime break in the SDK's lazy `@altananetwork/sdk`
// loader. This file can be the first Altana code a fresh server instance
// runs (e.g. GET /api/altana/session/[contractId] never imports
// src/lib/altana/index.ts), so it needs this import too, not just that file.
import './sdk-importer';

export interface AltanaSessionEnvelope {
  v: 1;
  /** Raw `serializeSession()` output — SECRET, never send to a client. */
  serialized: string;
  revoked: boolean;
  revokedAt: string | null;
  revokeTxHash: string | null;
}

/** Wrap a freshly granted session's serialized form for storage. */
export function wrapSessionEnvelope(serializedSession: string): AltanaSessionEnvelope {
  return { v: 1, serialized: serializedSession, revoked: false, revokedAt: null, revokeTxHash: null };
}

/** Parse `contracts.altana_session_key` back into an envelope. Throws on a malformed/foreign value. */
export function parseSessionEnvelope(raw: string): AltanaSessionEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('altana_session_key is not valid JSON');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).serialized !== 'string'
  ) {
    throw new Error('altana_session_key is not a recognized Altana session envelope');
  }
  const p = parsed as Record<string, unknown>;
  return {
    v: 1,
    serialized: p.serialized as string,
    revoked: p.revoked === true,
    revokedAt: typeof p.revokedAt === 'string' ? p.revokedAt : null,
    revokeTxHash: typeof p.revokeTxHash === 'string' ? p.revokeTxHash : null,
  };
}

export function serializeEnvelope(envelope: AltanaSessionEnvelope): string {
  return JSON.stringify(envelope);
}

export interface AltanaSessionSummary {
  status: 'active' | 'expired' | 'revoked';
  callAllowlist: `0x${string}`[];
  nativeSpendCapWei: string;
  nativeSpendCapBnb: string;
  /** Unix epoch seconds. */
  expiry: number;
  expiryIso: string;
  sessionPublicKey: `0x${string}`;
  sessionWalletAddress: `0x${string}`;
  revokedAt: string | null;
  revokeTxHash: string | null;
}

/**
 * Safe, client-facing summary of a stored session — real permissions read
 * back from the (server-side only) serialized session, never the secret
 * itself. Used by `GET /api/altana/session/[contractId]`.
 */
export async function summarizeSessionEnvelope(raw: string): Promise<AltanaSessionSummary> {
  const envelope = parseSessionEnvelope(raw);
  const session = await deserializeSession(envelope.serialized);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const status: AltanaSessionSummary['status'] = envelope.revoked
    ? 'revoked'
    : nowSeconds >= session.expiry
      ? 'expired'
      : 'active';

  const nativeSpend = (session.permissions.spend ?? []).find((s) => !s.token);
  const callAllowlist = (session.permissions.calls ?? [])
    .map((c) => ('to' in c ? c.to : undefined))
    .filter((to): to is `0x${string}` => !!to);

  const nativeSpendCapWeiBigInt = nativeSpend?.limit ?? BigInt(0);
  const nativeSpendCapWei = nativeSpendCapWeiBigInt.toString();

  return {
    status,
    callAllowlist,
    nativeSpendCapWei,
    nativeSpendCapBnb: formatEther(nativeSpendCapWeiBigInt),
    expiry: session.expiry,
    expiryIso: new Date(session.expiry * 1000).toISOString(),
    sessionPublicKey: session.publicKey,
    sessionWalletAddress: session.walletAddress,
    revokedAt: envelope.revokedAt,
    revokeTxHash: envelope.revokeTxHash,
  };
}
