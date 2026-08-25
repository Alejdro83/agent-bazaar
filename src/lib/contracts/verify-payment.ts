import { createPublicClient, http, type Hex } from 'viem';

/**
 * Verifies a buyer-signed native BNB transfer against BSC testnet before a
 * paid hire's contract is created — see hireAgent() in ./hire.ts. Split out
 * of the old inline route body so both the REST route and the MCP
 * `hire_agent` tool share the exact same verification, not two copies.
 */

const BSC_TESTNET_RPC = 'https://data-seed-prebsc-2-s2.binance.org:8545';
export const MIN_PAYMENT_WEI = BigInt('100000000000000'); // 0.0001 BNB — trivial on testnet, but a real signed transfer

export async function verifyPayment(txHash: string, expectedTo: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, error: 'Malformed transaction hash' };
  }
  const client = createPublicClient({ transport: http(BSC_TESTNET_RPC) });
  try {
    const [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: txHash as Hex }),
      client.getTransaction({ hash: txHash as Hex }),
    ]);
    if (receipt.status !== 'success') return { ok: false, error: 'Transaction did not succeed onchain' };
    if (receipt.to?.toLowerCase() !== expectedTo.toLowerCase()) {
      return { ok: false, error: 'Transaction was not sent to this agent\'s wallet' };
    }
    if (tx.value < MIN_PAYMENT_WEI) {
      return { ok: false, error: 'Payment amount too low' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not verify transaction onchain (not found or RPC error)' };
  }
}
