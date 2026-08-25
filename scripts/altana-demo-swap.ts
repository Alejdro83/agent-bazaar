/**
 * Standalone proof that Altana session-key delegated execution works: grant
 * a real, ephemeral, capped Altana session (PancakeSwap testnet router only,
 * small native spend cap) and execute one capped swap strictly within that
 * session — not wired into the live hire flow, see README "Scope decisions"
 * and src/lib/altana/index.ts's module docstring for the full rationale.
 *
 * Needs a funded testnet wallet: set ALTANA_DEMO_WALLET_PRIVATE_KEY to a
 * private key whose address holds real BNB testnet balance (faucet:
 * https://testnet.bnbchain.org/faucet-smart). Without funding this fails
 * with a clear, specific error rather than a generic crash — expected in
 * this environment (no browser/captcha access to complete the faucet).
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/altana-demo-swap.ts
 */

import { runDemoSwap } from '../src/lib/altana';

async function main() {
  console.log('Running Altana session-key demo swap (BSC testnet)...');
  const result = await runDemoSwap();
  console.log('Success:');
  console.log(`  wallet:      ${result.walletAddress}`);
  console.log(`  tx hash:     ${result.transactionHash}`);
  console.log(`  status:      ${result.status}`);
  console.log(`  swap value:  ${result.swapValueWei} wei`);
  console.log(`  session key: ${result.sessionPublicKey} (expires ${new Date(result.sessionExpiry * 1000).toISOString()})`);
  console.log(`  BscScan:     ${result.explorerUrl}`);
}

main().catch((err) => {
  console.error('Altana demo swap failed:');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
