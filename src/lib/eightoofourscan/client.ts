/**
 * Client for the 8004scan API (https://8004scan.io) — indexes ERC-8004 agent
 * identities live on BSC. Used to populate the marketplace catalog with real,
 * verifiable agents instead of invented seed data.
 */

const BASE_URL = 'https://8004scan.io/api/v1';

export const BSC_MAINNET_CHAIN_ID = 56;
export const BSC_TESTNET_CHAIN_ID = 97;

export interface EightOOFourScanAgent {
  id: string;
  agent_id: string; // composite "chainId:contractAddress:tokenId"
  token_id: string;
  chain_id: number;
  chain_type: string;
  contract_address: string;
  is_testnet: boolean;
  owner_id: string;
  owner_address: string;
  owner_ens: string | null;
  name: string;
  description: string;
  image_url: string | null;
  is_verified: boolean;
  star_count: number;
  supported_protocols: string[];
  x402_supported: boolean;
  total_score: number;
  average_score: number;
  total_feedbacks: number;
  created_at: string;
  updated_at: string;
}

export interface ListAgentsParams {
  chainId?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListAgentsResult {
  items: EightOOFourScanAgent[];
  total: number;
  limit: number;
  offset: number;
}

function getApiKey(): string {
  const key = process.env.EIGHTOOFOURSCAN_API_KEY;
  if (!key) {
    throw new Error('EIGHTOOFOURSCAN_API_KEY is not set');
  }
  return key;
}

export async function listAgents(params: ListAgentsParams = {}): Promise<ListAgentsResult> {
  const searchParams = new URLSearchParams();
  if (params.chainId !== undefined) searchParams.set('chain_id', String(params.chainId));
  if (params.search) searchParams.set('search', params.search);
  searchParams.set('limit', String(params.limit ?? 20));
  searchParams.set('offset', String(params.offset ?? 0));

  const res = await fetch(`${BASE_URL}/agents?${searchParams.toString()}`, {
    headers: { 'X-API-Key': getApiKey() },
  });

  if (!res.ok) {
    throw new Error(`8004scan API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/** Paginate through all matching agents, up to a safety cap. */
export async function listAllAgents(
  params: ListAgentsParams = {},
  maxItems = 500
): Promise<EightOOFourScanAgent[]> {
  const pageSize = 100;
  const items: EightOOFourScanAgent[] = [];
  let offset = 0;

  while (items.length < maxItems) {
    const page = await listAgents({ ...params, limit: pageSize, offset });
    items.push(...page.items);
    offset += pageSize;
    if (page.items.length < pageSize || offset >= page.total) break;
  }

  return items.slice(0, maxItems);
}
