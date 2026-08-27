/**
 * x402/B402 merchant — server-only. Explored + built 2026-08-27 to close a
 * gap this project's own README already named ("no full x402/ERC-8183
 * escrow... real friction against minimal friction, which the hackathon's
 * own judging criteria call out as the most important thing").
 *
 * Two officially-documented facilitator paths were tried first and ruled
 * out, not by guesswork but by direct verification:
 *   - The open Vistara-Labs facilitator (`facilitator.b402.ai`) — its
 *     subdomain returns NXDOMAIN (confirmed against Google's public DoH
 *     resolver, not just locally), so nothing built against it can work.
 *   - Binance's own gated b402 merchant API (RSA/"Tesla"-signed,
 *     `/papi/v2/b402/*`) — requires real merchant onboarding (client id,
 *     access token, RSA key) this project doesn't have.
 * `@altananetwork/x402-server` (published by Altana Network, the SAME
 * partner this project already integrates for the session-key track) is
 * a SELF-HOSTED merchant — no third-party facilitator uptime dependency at
 * all. The facilitator role below is just OUR OWN funded wallet
 * broadcasting settlements and paying gas; it never touches buyer funds
 * (the recipient is bound into the buyer's own EIP-3009 signature, so a
 * compromised facilitator key can't redirect earnings — see the package's
 * README "How settlement works").
 *
 * Token: the 18-decimal ERC-8183/x402 "$U" (United Stables) on bsc-testnet,
 * `0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565` — cross-verified against
 * @bnbagent/sdk's own address manifest AND a live get_erc20_token_info
 * read (name/symbol/decimals match). Explicitly NOT the different
 * 6-decimal token some SDK example comments mention — @bnbagent/studio-cli's
 * own README calls that out as "a different rail."
 */
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';
import { createX402Merchant, U_TOKEN } from '@altananetwork/x402-server';

let _merchant: ReturnType<typeof createX402Merchant> | null = null;

/** Facilitator = seller = the existing, already-funded Altana demo wallet
 * (0x8d147CFFBb304d57C744b4f8DB7Eb266c8e0Aa25, 0.297 tBNB as of 2026-08-27
 * — plenty for settlement gas). Reused rather than a third wallet: it's
 * already funded and this role needs the same thing the Altana track's
 * wallet already has (native testnet gas), not a new funding step. */
function getMerchant() {
  if (_merchant) return _merchant;

  const key = process.env.ALTANA_DEMO_WALLET_PRIVATE_KEY;
  if (!key) {
    throw new Error('ALTANA_DEMO_WALLET_PRIVATE_KEY not configured — x402 merchant cannot start');
  }
  const facilitator = privateKeyToAccount(key as `0x${string}`);

  _merchant = createX402Merchant({
    chainId: bscTestnet.id, // 97
    payTo: facilitator.address,
    // BigInt(...) calls rather than `123n` literals — this repo's
    // tsconfig targets ES2017, which doesn't support BigInt literal syntax.
    price: BigInt('100000000000000000'), // 0.1 $U (18 decimals) — a token flat fee, not tied to pricing_value/USD
    minPrice: BigInt('10000000000000000'), // floor 0.01 $U
    maxPrice: BigInt('1000000000000000000'), // ceiling 1 $U
    rails: [
      { rail: 'eip3009', token: U_TOKEN[97] },
    ],
    resource: {
      url: 'https://agent-bazaar-wheat.vercel.app/api/x402/demo',
      description: 'Run a real Agent Bazaar market-signal analysis, paid gaslessly in testnet $U',
      mimeType: 'application/json',
    },
    description: 'Agent Bazaar x402 demo — pay in $U (EIP-3009, gasless), get a real live agent signal back',
    facilitator,
    rpcUrl: process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545',
    chain: bscTestnet,
  });
  return _merchant;
}

export { getMerchant };
