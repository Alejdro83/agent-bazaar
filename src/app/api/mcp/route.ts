import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { listAgents } from '@/lib/agents/list';
import { getAgentDetail } from '@/lib/agents/get';
import { getAgentSignal } from '@/lib/market/get-signal';
import { hireAgent } from '@/lib/contracts/hire';
import { getContractDetail } from '@/lib/contracts/get';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { ApiError } from '@/lib/errors';

/**
 * POST /api/mcp — Agent Bazaar as an MCP (Model Context Protocol) server, so
 * an external AI agent — not just a human via the web/Telegram UI — can
 * discover and hire marketplace agents directly. This is the "agent-native
 * front door" the hackathon framing asks for.
 *
 * Every tool here wraps the exact same shared lib functions the REST API
 * routes call (src/lib/agents/*, src/lib/market/*, src/lib/contracts/*) —
 * see those files' docstrings — so the MCP surface can't silently drift
 * from what a human sees in the app.
 *
 * Stateless mode only: a serverless function can't hold session/connection
 * state in memory across invocations, so `sessionIdGenerator` is left
 * undefined (no `Mcp-Session-Id`, no SSE, no resumability) and a fresh
 * McpServer + transport is constructed per request. GET/DELETE (used for SSE
 * streams and session termination in stateful MCP) don't apply here, so they
 * just return 405.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

function toolResult(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}

function buildServer(): McpServer {
  const server = new McpServer({ name: 'agent-bazaar', version: '1.0.0' });

  server.registerTool(
    'list_agents',
    {
      description: 'Browse the Agent Bazaar public catalog of hireable DeFi agents, with optional category/search filters.',
      inputSchema: {
        category: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async ({ category, search, limit, offset }) => {
      try {
        const supabase = createServiceClient();
        const result = await listAgents(supabase, { category, search, limit, offset });
        return toolResult(result);
      } catch (error) {
        if (error instanceof ApiError) return toolError(error.message);
        return toolError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  );

  server.registerTool(
    'get_agent',
    {
      description: 'Get full detail for one agent by id, including its recent ratings.',
      inputSchema: {
        agent_id: z.string(),
      },
    },
    async ({ agent_id }) => {
      try {
        const supabase = createServiceClient();
        const result = await getAgentDetail(supabase, agent_id);
        return toolResult(result);
      } catch (error) {
        if (error instanceof ApiError) return toolError(error.message);
        return toolError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  );

  server.registerTool(
    'get_market_signal',
    {
      description: 'Get an agent\'s live market signal — real onchain/market data combined with its own strategy config.',
      inputSchema: {
        agent_id: z.string(),
      },
    },
    async ({ agent_id }) => {
      try {
        const supabase = createServiceClient();
        const signal = await getAgentSignal(supabase, agent_id);
        return toolResult({ signal });
      } catch (error) {
        if (error instanceof ApiError) return toolError(error.message);
        return toolError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  );

  server.registerTool(
    'hire_agent',
    {
      description: 'Hire an agent by wallet address, optionally with a signed payment tx hash for paid agents. Runs the agent\'s real analysis and returns the output as the deliverable.',
      inputSchema: {
        agent_id: z.string(),
        wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        payment_tx_hash: z.string().optional(),
      },
    },
    async ({ agent_id, wallet_address, payment_tx_hash }) => {
      try {
        const walletAddress = wallet_address.toLowerCase();
        const rateLimit = checkRateLimit(`mcp-hire:${walletAddress}`, RATE_LIMITS.hire);
        if (!rateLimit.success) {
          return toolError('Too many hire attempts, try again later');
        }

        const supabase = createServiceClient();
        const requester = { id: walletAddress, source: 'wallet' as const };
        const result = await hireAgent(supabase, requester, {
          agentId: agent_id,
          paymentTxHash: payment_tx_hash,
        });
        return toolResult(result);
      } catch (error) {
        if (error instanceof ApiError) return toolError(error.message);
        return toolError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  );

  server.registerTool(
    'get_hire_result',
    {
      description: 'Read back one contract by id (the hire result/deliverable), for the buyer or seller wallet only.',
      inputSchema: {
        contract_id: z.string(),
        wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      },
    },
    async ({ contract_id, wallet_address }) => {
      try {
        const supabase = createServiceClient();
        const result = await getContractDetail(supabase, contract_id, wallet_address.toLowerCase());
        return toolResult(result);
      } catch (error) {
        if (error instanceof ApiError) return toolError(error.message);
        return toolError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  );

  return server;
}

export async function POST(req: Request): Promise<Response> {
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    return response;
  } finally {
    await transport.close();
  }
}

export async function GET(): Promise<Response> {
  return new Response('Method not allowed — this MCP server is stateless, use POST', { status: 405 });
}

export async function DELETE(): Promise<Response> {
  return new Response('Method not allowed — this MCP server is stateless, use POST', { status: 405 });
}
