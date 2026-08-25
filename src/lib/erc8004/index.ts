/**
 * ERC-8004 Agent Identity — real onchain registration via @bnbagent/sdk.
 *
 * Registers each user-listed agent on the ERC-8004 Identity Registry (BSC
 * testnet by default), gas-free via the MegaFuel paymaster the SDK's network
 * presets already enable. The operator wallet is a dedicated hot wallet
 * (env-configured, no persisted keystore — see EVMWalletProvider below) that
 * owns every agent it registers; end users never sign an onchain tx to list
 * an agent, matching the "single click" listing flow the rest of the app
 * already has.
 */

import { ERC8004Agent, AgentEndpoint } from '@bnbagent/sdk/erc8004';
import { EVMWalletProvider } from '@bnbagent/sdk/wallets';
import type { Json } from '@/types/database';

const NETWORK = process.env.BNBAGENT_NETWORK || 'bsc-testnet';

export interface OnchainRegistration {
  agentId: number | null;
  agentURI: string;
  transactionHash: string;
  network: string;
  registryContract: string;
  registeredAt: string;
}

let agentPromise: Promise<ERC8004Agent> | null = null;

/**
 * Lazily create (and cache) the ERC8004Agent client for the operator wallet.
 * `persist: false` — no keystore file is written to disk; the private key
 * comes straight from the env on every cold start, which is what a
 * stateless serverless deployment (Vercel) needs.
 */
function getAgentClient(): Promise<ERC8004Agent> {
  if (!agentPromise) {
    const privateKey = process.env.BNBAGENT_OPERATOR_PRIVATE_KEY;
    const password = process.env.BNBAGENT_OPERATOR_WALLET_PASSWORD;
    if (!privateKey || !password) {
      throw new Error(
        'BNBAGENT_OPERATOR_PRIVATE_KEY / BNBAGENT_OPERATOR_WALLET_PASSWORD are required for onchain registration'
      );
    }
    const wallet = new EVMWalletProvider({ privateKey, password, persist: false });
    agentPromise = ERC8004Agent.create({ walletProvider: wallet, network: NETWORK });
  }
  return agentPromise;
}

/**
 * Register a listed agent on the ERC-8004 Identity Registry.
 *
 * The agent's own detail page becomes its ERC-8004 "web" endpoint — anyone
 * resolving the onchain identity lands on the same listing our marketplace
 * shows. `sellerWallet`/`pricingLabel` are folded into onchain metadata so
 * the registration carries real listing data, not just a name.
 */
export async function registerAgentOnchain(opts: {
  agentDbId: string;
  name: string;
  description: string;
  category: string;
  sellerWallet: string;
  pricingLabel: string;
}): Promise<OnchainRegistration> {
  const client = await getAgentClient();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const endpoint = AgentEndpoint.a2a(`${baseUrl}/agent/${opts.agentDbId}`, {
    capabilities: [opts.category],
  });

  // The registry stores this as a base64 data: URI directly in calldata (no
  // IPFS/off-chain hop) — the MegaFuel relay rejects sponsored transactions
  // past a payload size it doesn't document ("tx size is too large"),
  // confirmed by testing that a ~24-char description registers fine while
  // ~150+ chars (this app's real listing copy) does not. Truncating only the
  // on-chain copy — the full description still lives in Postgres and is
  // what the marketplace UI actually renders.
  const ONCHAIN_DESCRIPTION_MAX = 100;
  const onchainDescription =
    opts.description.length > ONCHAIN_DESCRIPTION_MAX
      ? `${opts.description.slice(0, ONCHAIN_DESCRIPTION_MAX - 1)}…`
      : opts.description;

  const agentUri = client.generateAgentUri({
    name: opts.name,
    description: onchainDescription,
    endpoints: [endpoint],
  });

  const result = await client.registerAgent(agentUri, [
    { key: 'category', value: opts.category },
    { key: 'seller_wallet', value: opts.sellerWallet },
    { key: 'pricing', value: opts.pricingLabel },
    { key: 'marketplace', value: 'agent-bazaar' },
  ]);

  return {
    agentId: result.agentId,
    agentURI: result.agentURI,
    transactionHash: result.transactionHash,
    network: client.network.name,
    registryContract: client.contractAddress,
    registeredAt: new Date().toISOString(),
  };
}

export function toJson(registration: OnchainRegistration): Json {
  return JSON.parse(JSON.stringify(registration)) as Json;
}

/**
 * Record a hire as a real onchain write against the agent's own ERC-8004
 * registration — a `setMetadata` call the operator wallet signs and pays for
 * (gas-free, same MegaFuel sponsorship as registration).
 *
 * This deliberately stops short of a full x402/ERC-8183 payment (buyer-signed
 * escrow, dispute window, settlement) — that requires the buyer to hold and
 * approve a payment token, which conflicts with the "hire with minimal
 * friction" flow the rest of the app is built around. What this *does* give
 * the demo: a real, BscScan-verifiable transaction hash tied to the hire,
 * replacing the previous `Math.random()` placeholder, with zero added
 * friction for the buyer.
 */
export async function recordHireOnchain(opts: {
  erc8004AgentId: number;
  contractId: string;
  buyerId: string;
}): Promise<{ transactionHash: string }> {
  const client = await getAgentClient();
  const result = await client.setMetadata(
    opts.erc8004AgentId,
    'last_hire',
    JSON.stringify({ contractId: opts.contractId, buyerId: opts.buyerId, at: new Date().toISOString() })
  );
  return { transactionHash: result.transactionHash };
}
