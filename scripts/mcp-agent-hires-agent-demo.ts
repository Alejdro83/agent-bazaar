/**
 * A real "agent hires agent" proof: a genuine MCP client (the official
 * @modelcontextprotocol/sdk, not a hand-rolled HTTP hack) connects to
 * Agent Bazaar's own MCP server and discovers, inspects, and hires a
 * marketplace agent — the same tools an external AI agent (Claude Desktop,
 * another agent framework, or an agent-to-agent economy participant) would
 * call, not a human clicking through the web UI.
 *
 * This is the literal "agent-native front door" the hackathon's theme asks
 * for, exercised for real against production — not asserted in the README,
 * demonstrated. Every step below is a real MCP tool call over real
 * streamable-HTTP against https://agent-bazaar-wheat.vercel.app/api/mcp,
 * and the hire at the end creates a REAL row in `contracts` (free agent,
 * so no payment step — see scripts/x402-buyer-demo.ts for a paid,
 * gasless MCP-adjacent flow through the same marketplace).
 *
 * Usage: npx tsx scripts/mcp-agent-hires-agent-demo.ts
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL || 'https://agent-bazaar-wheat.vercel.app/api/mcp';
const HIRING_AGENT_WALLET = '0x000000000000000000000000000000000000000e'; // a synthetic "AI agent" identity for this demo — free agent, no payment needed

function textOf(result: { content: Array<{ type: string; text?: string }>; isError?: boolean }) {
  const block = result.content.find((c) => c.type === 'text');
  if (result.isError) throw new Error(`Tool call failed: ${block?.text}`);
  return block?.text ? JSON.parse(block.text) : null;
}

async function main() {
  console.log('=== Agent Bazaar MCP demo: one agent discovering & hiring another ===');
  console.log(`Connecting a real MCP client to ${MCP_URL} ...\n`);

  const client = new Client({ name: 'demo-hiring-agent', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`Connected. Server exposes ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}\n`);

  console.log('--- Step 1: list_agents (category=rebalancing) ---');
  const listResult = await client.callTool({
    name: 'list_agents',
    arguments: { category: 'rebalancing', limit: 10 },
  });
  const listed = textOf(listResult as never);
  const candidates = (listed?.agents ?? []).filter((a: { source: string }) => a.source === 'user');
  console.log(`Found ${candidates.length} hireable rebalancing agents:`, candidates.map((a: { name: string }) => a.name));

  const target = candidates.find((a: { name: string }) => a.name === 'AaveRangeBot') ?? candidates[0];
  if (!target) throw new Error('No hireable rebalancing agent found');
  console.log(`\nSelected: ${target.name} (id ${target.id})\n`);

  console.log('--- Step 2: get_agent (inspect before hiring) ---');
  const detail = textOf((await client.callTool({ name: 'get_agent', arguments: { agent_id: target.id } })) as never);
  console.log(`Description: ${detail.agent.description.slice(0, 140)}...`);
  console.log(`Pricing: ${detail.agent.pricing_type === 'free' ? 'free' : `${detail.agent.pricing_value} ${detail.agent.pricing_currency}`}\n`);

  console.log('--- Step 3: get_market_signal (real live data, before committing) ---');
  const signalResult = textOf((await client.callTool({ name: 'get_market_signal', arguments: { agent_id: target.id } })) as never);
  console.log(JSON.stringify(signalResult.signal, null, 2), '\n');

  console.log('--- Step 4: hire_agent (real contract created) ---');
  const hireResult = textOf(
    (await client.callTool({
      name: 'hire_agent',
      arguments: { agent_id: target.id, wallet_address: HIRING_AGENT_WALLET },
    })) as never
  );
  console.log(`Contract created: ${hireResult.contract.id}`);
  console.log(`Payment: ${JSON.stringify(hireResult.payment)}\n`);

  console.log('--- Step 5: get_hire_result (read back the deliverable) ---');
  const readback = textOf(
    (await client.callTool({
      name: 'get_hire_result',
      arguments: { contract_id: hireResult.contract.id, wallet_address: HIRING_AGENT_WALLET },
    })) as never
  );
  console.log(JSON.stringify(readback, null, 2));

  console.log('\n=== Done — zero human clicks in the web UI. A real MCP client discovered');
  console.log('    a real agent, inspected its live data, hired it, and read back the');
  console.log(`    real deliverable. Verify: https://agent-bazaar-wheat.vercel.app/hire/${hireResult.contract.id}`);
  console.log('    (view requires the same identity — see README for how to check contracts by wallet).');

  await client.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('MCP demo failed:', err);
    process.exit(1);
  });
