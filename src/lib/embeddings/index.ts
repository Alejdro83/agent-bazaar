/**
 * Text embeddings for semantic search (the Concierge feature).
 *
 * Uses Cloudflare Workers AI's bge-base-en-v1.5 (768 dimensions) instead of
 * OpenAI — no OpenAI key needed, generous free tier, called as a plain REST
 * API (no Worker deployment required; Workers AI is callable from any
 * backend via the standard Cloudflare API).
 */

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
export const EMBEDDING_DIMENSIONS = 768;

interface CloudflareAIResponse {
  success: boolean;
  result?: { data: number[][] };
  errors?: Array<{ code: number; message: string }>;
}

function apiUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBEDDING_MODEL}`;
}

async function runEmbedding(input: string | string[]): Promise<number[][]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not configured');
  }

  const response = await fetch(apiUrl(accountId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ text: input }),
  });

  const data: CloudflareAIResponse = await response.json();
  if (!response.ok || !data.success || !data.result) {
    const message = data.errors?.map((e) => e.message).join('; ') || `HTTP ${response.status}`;
    throw new Error(`Cloudflare Workers AI error: ${message}`);
  }

  return data.result.data;
}

/** Generate an embedding for a single text. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await runEmbedding(text);
  return embedding;
}

/**
 * Generate embeddings for multiple texts. Cloudflare's `text` input accepts
 * an array directly — no manual batching/rate-limit handling needed at our
 * scale (dozens of agents, not thousands).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return runEmbedding(texts);
}

/** Build searchable text from agent data — same fields search_vector uses. */
export function buildAgentSearchText(agent: {
  name: string;
  description: string;
  category: string;
  subcategory?: string | null;
}): string {
  return [agent.name, agent.description, agent.category, agent.subcategory]
    .filter(Boolean)
    .join(' ');
}

/** Format a pgvector literal from a plain number array, e.g. for raw SQL/RPC params. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
