import { NextRequest, NextResponse } from 'next/server';
import { getMerchant } from '@/lib/x402/merchant';
import { computeAgentSignal } from '@/lib/market/signals';
import { createServiceClient } from '@/lib/supabase/service';
import { handleApiError } from '@/lib/errors';

/**
 * POST /api/x402/demo — a real x402/B402-paywalled resource, not a mock.
 *
 * No `X-PAYMENT` header -> 402 with a real challenge (price, token,
 * payTo, EIP-712 domain) a buyer's wallet can sign against directly.
 * A valid `X-PAYMENT` header -> the merchant verifies AND settles the
 * payment on-chain itself (gasless for the buyer, our facilitator wallet
 * pays gas), then this route runs a REAL agent analysis
 * (computeAgentSignal — the same function every paid/free hire in the
 * marketplace runs, see src/lib/contracts/hire.ts) and returns it alongside
 * the real settlement transaction hash.
 *
 * See src/lib/x402/merchant.ts for why this is self-hosted (via
 * @altananetwork/x402-server) rather than routed through a third-party
 * facilitator, and scripts/x402-buyer-demo.ts for the real buyer-side
 * proof (signs the authorization, calls this route twice, verifies the
 * settlement tx directly via eth_getTransactionReceipt).
 */
export async function POST(request: NextRequest) {
  try {
    const merchant = getMerchant();
    const { response, receipt } = await merchant.guard(request);
    if (response) {
      // 402 challenge or a rejected/invalid payment — pass through exactly
      // as the merchant produced it.
      return response;
    }

    // Payment settled for real — run a real, live signal so what the buyer
    // gets back is the same kind of genuine deliverable every hire in the
    // marketplace produces, not a placeholder string.
    const supabase = createServiceClient();
    const { data: demoAgent } = await supabase
      .from('agents')
      .select('category, metadata')
      .eq('status', 'active')
      .eq('source', 'user')
      .limit(1)
      .single();

    let signal = null;
    if (demoAgent) {
      try {
        signal = await computeAgentSignal({ category: demoAgent.category, metadata: demoAgent.metadata });
      } catch {
        // Best-effort, same convention as hireAgent() — a data-source hiccup
        // shouldn't hide a real, already-settled payment's receipt.
        signal = null;
      }
    }

    return NextResponse.json({
      paid: true,
      settlement: {
        transaction: receipt!.txHash,
        payer: receipt!.payer,
        amount: receipt!.amount.toString(),
        token: receipt!.token,
        network: 'eip155:97',
      },
      signal,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
