/**
 * Standalone proof that the x402/B402 payment demo works end-to-end: sign a
 * real EIP-3009 authorization for testnet $U, POST it to our own deployed
 * `/api/x402/demo` route, and verify the resulting on-chain settlement
 * directly via `eth_getTransactionReceipt` — not just trusting the API's
 * own report, same rigor as scripts/altana-demo-swap.ts.
 *
 * Two officially-documented facilitator paths were tried first and ruled
 * out by direct verification (not guesswork) before landing on this
 * self-hosted approach — see src/lib/x402/merchant.ts's docstring for the
 * full story (Vistara-Labs' facilitator.b402.ai is NXDOMAIN; Binance's own
 * gated b402 API needs real merchant onboarding this project doesn't have).
 *
 * Needs a funded buyer wallet — reuses ALTANA_DEMO_WALLET_PRIVATE_KEY
 * (0x8d147CFFBb304d57C744b4f8DB7Eb266c8e0Aa25) as BOTH buyer and
 * facilitator/payTo on purpose: a real, verifiable self-transfer, chosen
 * over a fresh wallet because this one already has real testnet history
 * a faucet's anti-sybil check is likelier to accept (the exact friction
 * already hit once with Altana's own faucet — see
 * altana-report/NEXT_STEPS.md). Needs testnet $U specifically (NOT
 * tBNB — this rail is gasless by design for the buyer). Get testnet $U by
 * messaging https://t.me/bnbchain_official_bot with "I would like to get
 * U to my wallet 0x8d147CFFBb304d57C744b4f8DB7Eb266c8e0Aa25" (see
 * @bnbagent/studio-cli's README) — more options at
 * https://united-coin-u.github.io/u-faucet/. Set
 * X402_BUYER_WALLET_PRIVATE_KEY instead to use a separate wallet (e.g. to
 * demo a genuine two-party transfer later). Without funding this fails
 * with a clear, specific error rather than a generic crash.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/x402-buyer-demo.ts
 */

import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';
import { signX402Payment, type ChallengeAccept } from '../src/lib/x402/buyer';

const DEMO_URL = process.env.X402_DEMO_URL || 'https://agent-bazaar-wheat.vercel.app/api/x402/demo';
const U_TOKEN_TESTNET = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565' as const;

const ERC20_BALANCE_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

async function main() {
  // Same wallet as buyer AND facilitator/payTo (ALTANA_DEMO_WALLET_PRIVATE_KEY,
  // see src/lib/x402/merchant.ts) — a real, verifiable self-transfer, not a
  // fake one. Chosen on purpose over a fresh wallet: this wallet already has
  // real testnet history and a real tBNB balance, which the ERC-8183 $U
  // faucet's undocumented anti-sybil check is more likely to accept than a
  // brand-new, empty address — the exact same friction already hit once
  // with Altana's own testnet faucet (see altana-report/NEXT_STEPS.md).
  // X402_BUYER_WALLET_PRIVATE_KEY still overrides this if ever set, e.g. to
  // demo a genuine two-party transfer later.
  const privateKey = process.env.X402_BUYER_WALLET_PRIVATE_KEY || process.env.ALTANA_DEMO_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Neither X402_BUYER_WALLET_PRIVATE_KEY nor ALTANA_DEMO_WALLET_PRIVATE_KEY is set — see this script\'s header comment.');
  }
  const buyer = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: bscTestnet, transport: http() });

  console.log('x402 buyer demo — BSC testnet, real HTTP round-trip against', DEMO_URL);
  console.log(`  buyer wallet: ${buyer.address}`);

  const balance = await publicClient.readContract({
    address: U_TOKEN_TESTNET,
    abi: ERC20_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [buyer.address],
  });
  console.log(`  $U balance:   ${balance} (18 decimals)`);
  if (balance === BigInt(0)) {
    throw new Error(
      `Buyer wallet ${buyer.address} holds 0 testnet $U — fund it first (see this script's header comment). ` +
      'This is a real balance check against BSC testnet, not a guess.'
    );
  }

  // Step 1: unpaid request -> expect a real 402 challenge.
  const challengeRes = await fetch(DEMO_URL, { method: 'POST' });
  if (challengeRes.status !== 402) {
    throw new Error(`Expected 402, got ${challengeRes.status}: ${await challengeRes.text()}`);
  }
  const challenge = (await challengeRes.json()) as { accepts: ChallengeAccept[] };
  const accept = challenge.accepts?.[0];
  if (!accept) throw new Error('402 body had no accepts[0]: ' + JSON.stringify(challenge));
  console.log(`  step 1: POST -> 402 challenge (pay ${accept.amount} of ${accept.asset} to ${accept.payTo})`);

  // Step 2: sign the EIP-712 TransferWithAuthorization for real — shared
  // with the live hire route (src/lib/x402/buyer.ts), not a second copy.
  const paymentHeader = await signX402Payment(accept);
  console.log(`  step 2: signed TransferWithAuthorization (envelope ${paymentHeader.slice(0, 10)}...)`);

  // Step 3: retry with X-PAYMENT — this is where OUR OWN facilitator wallet
  // verifies the signature and broadcasts the real settlement transaction.
  const settleRes = await fetch(DEMO_URL, {
    method: 'POST',
    headers: { 'X-PAYMENT': paymentHeader },
  });
  const settleBody = await settleRes.json();
  if (settleRes.status !== 200) {
    throw new Error(`Settlement failed (${settleRes.status}): ${JSON.stringify(settleBody)}`);
  }
  console.log('  step 3: X-PAYMENT accepted, settled on-chain for real:');
  console.log(`    tx:      ${settleBody.settlement.transaction}`);
  console.log(`    payer:   ${settleBody.settlement.payer}`);
  console.log(`    amount:  ${settleBody.settlement.amount} (${settleBody.settlement.token})`);
  console.log(`    signal:  ${settleBody.signal ? settleBody.signal.task : '(none returned)'}`);

  // Step 4: don't trust the API's own report — verify the receipt directly.
  const receipt = await publicClient.getTransactionReceipt({ hash: settleBody.settlement.transaction });
  console.log(`  step 4: verified via eth_getTransactionReceipt — status=${receipt.status}`);
  console.log(`  BscScan: https://testnet.bscscan.com/tx/${settleBody.settlement.transaction}`);

  if (receipt.status !== 'success') {
    throw new Error(`Settlement transaction reverted on-chain (status=${receipt.status})`);
  }
  console.log('\nx402 buyer demo: ALL STEPS OK — real, verified, on-chain, gasless for the buyer.');
}

main().catch((err) => {
  console.error('x402 buyer demo failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
