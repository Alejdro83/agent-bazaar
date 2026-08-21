/**
 * ERC-8004 Agent Identity — Mock implementation for hackathon demo
 *
 * ERC-8004 defines a standard for onchain agent identity:
 * - Unique agent ID (onchain)
 * - Capabilities declaration
 * - Reputation score
 * - Owner verification
 *
 * In production, this would interact with an ERC-8004 registry contract on BSC.
 * For demo, we generate deterministic mock IDs and store metadata in Supabase.
 */

import crypto from 'crypto';

export interface ERC8004Identity {
  agent_id: string;        // Onchain agent ID (mock: deterministic hash)
  owner_address: string;   // Wallet address of the agent owner
  capabilities: string[];  // What the agent can do
  reputation_score: number; // 0-100
  registered_at: string;   // ISO timestamp
  chain_id: number;        // BSC = 56, BSC Testnet = 97
  contract_address: string; // Registry contract address (mock)
}

/**
 * Generate a deterministic ERC-8004 agent ID from seller address + agent name
 * Mock: keccak256(seller_address + agent_name) truncated to bytes32
 */
export function generateAgentId(sellerAddress: string, agentName: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${sellerAddress}:${agentName}`)
    .digest('hex');
  return `0x${hash.slice(0, 64)}`;
}

/**
 * Mock ERC-8004 registration
 * In production: calls registry contract on BSC
 * For demo: returns mock identity data
 */
export function mockRegisterAgent(
  sellerAddress: string,
  agentName: string,
  capabilities: string[]
): ERC8004Identity {
  return {
    agent_id: generateAgentId(sellerAddress, agentName),
    owner_address: sellerAddress,
    capabilities,
    reputation_score: 50, // Starting score
    registered_at: new Date().toISOString(),
    chain_id: 97, // Testnet for demo
    contract_address: '0x' + '0'.repeat(40), // Mock registry address
  };
}

/**
 * Mock ERC-8004 lookup
 * In production: reads from registry contract
 * For demo: returns mock data
 */
export function mockLookupAgent(agentId: string): ERC8004Identity | null {
  // In demo, we just validate the format
  if (!agentId.startsWith('0x') || agentId.length !== 66) {
    return null;
  }

  return {
    agent_id: agentId,
    owner_address: '0x' + '1'.repeat(40),
    capabilities: ['trading', 'yield-farming'],
    reputation_score: 75,
    registered_at: new Date().toISOString(),
    chain_id: 97,
    contract_address: '0x' + '0'.repeat(40),
  };
}

/**
 * Generate ERC-8004 metadata for Supabase storage
 */
export function generateERC8004Metadata(
  sellerAddress: string,
  agentName: string,
  capabilities: string[]
): { erc8004_id: string; erc8004_data: Record<string, unknown> } {
  const identity = mockRegisterAgent(sellerAddress, agentName, capabilities);
  return {
    erc8004_id: identity.agent_id,
    erc8004_data: identity as unknown as Record<string, unknown>,
  };
}
