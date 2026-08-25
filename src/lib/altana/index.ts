/**
 * Altana session-key delegated execution — standalone proof, NOT wired into
 * the live hire flow (see README "Scope decisions").
 *
 * What this proves: a real Altana session key (EIP-7702, granted via
 * `@bnbagent/sdk`'s `AltanaWalletProvider`) can execute a genuine, capped
 * PancakeSwap-testnet swap end-to-end — grant a scoped, expiring session,
 * then execute strictly within it (not with the admin key), and get back a
 * real, BscScan-verifiable transaction hash.
 *
 * Why a dedicated wallet we control, not a real buyer's connected wallet:
 * `viem`'s `signAuthorization` (the EIP-7702 authorization Altana's
 * `grantSession` needs) explicitly throws `AccountTypeNotSupportedError` for
 * JSON-RPC/injected accounts — see
 * `node_modules/viem/_esm/actions/wallet/signAuthorization.js`. A MetaMask-
 * connected account cannot sign this today; only a raw private key can. So
 * `ALTANA_DEMO_WALLET_PRIVATE_KEY` is a dedicated demo "buyer" wallet, kept
 * separate from `BNBAGENT_OPERATOR_PRIVATE_KEY` (the ERC-8004 operator
 * identity plays a different role and should not be reused here).
 *
 * Gas note: unlike the ERC-8004 registration path elsewhere in this repo,
 * Altana's relay is NOT MegaFuel-sponsored — it recovers gas from the
 * session owner's own on-chain funds. This demo wallet must hold real
 * testnet BNB (one-time faucet funding), which is why `runDemoSwap` checks
 * the real onchain balance up front and fails with a specific, actionable
 * error instead of letting an underfunded wallet crash deep inside the SDK.
 */

import { createPublicClient, http } from 'viem';
import { bscTestnet } from 'viem/chains';
import { AltanaWalletProvider, defaultAgentPermissions } from '@bnbagent/sdk/wallets';

const BSC_TESTNET_CHAIN_ID = 97;
const BSC_TESTNET_RPC = 'https://bsc-testnet-rpc.publicnode.com'; // same RPC as the SDK's own `bnb-testnet` preset (BNB_TESTNET.publicRpcUrl)

/** Real PancakeSwap v2 router on BSC testnet (per bnb-chain/example-hub's pancake-swap-example). */
const PANCAKE_V2_ROUTER_TESTNET = '0x9ac64cc6e4415144c455bd8e4837fea55603e5c3' as const;
/** Wrapped BNB on BSC testnet — the pool base every PancakeSwap testnet pair is quoted against. */
const WBNB_TESTNET = '0xae13d989dac2f0debff460ac112a837c89baa7cd' as const;
/** Testnet BUSD — the swap's output token (a real, liquid PancakeSwap-testnet pair target). */
const BUSD_TESTNET = '0xed24fc36d5ee211ea25a80239fb8c4cfd80f12ee' as const;

/**
 * Native BNB sent into the swap — trivial on testnet, but a real signed
 * value transfer. Same "trivial but real" framing as `MIN_PAYMENT_WEI` in
 * `src/lib/contracts/verify-payment.ts`.
 */
const SWAP_VALUE_WEI = BigInt('100000000000000'); // 0.0001 BNB

/**
 * The session's native (BNB) spend cap — must cover the swap value above
 * plus relay-recovered gas for both `grantSession` and `execute`. Kept
 * small and explicit rather than relying on the SDK's own default
 * (0.02 BNB/day) so the cap in this demo is a deliberate, visible number.
 */
const NATIVE_SPEND_CAP_WEI = BigInt('2000000000000000'); // 0.002 BNB/day

/** Minimum real onchain balance required before attempting anything (grant + execute both cost gas here — no paymaster). */
const REQUIRED_MIN_NATIVE_WEI = BigInt('3000000000000000'); // 0.003 BNB — swap value + gas headroom for two relay txs

/** Ephemeral demo session lifetime. */
const SESSION_TTL_SECONDS = 15 * 60;

const PANCAKE_ROUTER_ABI = [
  {
    type: 'function',
    name: 'swapExactETHForTokens',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

export interface AltanaDemoSwapResult {
  transactionHash: `0x${string}`;
  status: number;
  walletAddress: `0x${string}`;
  sessionPublicKey: `0x${string}`;
  sessionExpiry: number;
  swapValueWei: string;
  network: 'bnb-testnet';
  explorerUrl: string;
}

function requirePrivateKey(): string {
  const privateKey = process.env.ALTANA_DEMO_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      'ALTANA_DEMO_WALLET_PRIVATE_KEY is not set. This demo needs a dedicated wallet ' +
        '(private key) — a real buyer wallet cannot grant an Altana session (see ' +
        "src/lib/altana/index.ts's module docstring for why). Generate one with " +
        `\`node -e "console.log(require('viem/accounts').generatePrivateKey())"\` and set it.`
    );
  }
  return privateKey;
}

/**
 * Grant a real, ephemeral Altana session (scoped to the PancakeSwap testnet
 * router only, with a small native spend cap) and execute one capped swap
 * strictly within that session — not with the admin key — proving delegated
 * execution genuinely works.
 *
 * Fails with a clear, specific error (not a generic crash) when the demo
 * wallet has insufficient testnet BNB, since Altana's relay is not
 * MegaFuel-sponsored and both `grantSession` and `execute` spend real gas
 * from the wallet's own balance.
 */
export async function runDemoSwap(): Promise<AltanaDemoSwapResult> {
  const privateKey = requirePrivateKey();
  const adminProvider = new AltanaWalletProvider({ network: 'bnb-testnet', privateKey });

  // Real onchain read — fail clearly before spending anything if the demo
  // wallet was never funded (the faucet's captcha means this is a manual,
  // one-time setup step we may not have been able to complete).
  const { native } = await adminProvider.balances();
  if (native < REQUIRED_MIN_NATIVE_WEI) {
    throw new Error(
      `Altana demo wallet ${adminProvider.address} has insufficient BNB testnet balance ` +
        `(${native.toString()} wei; needs at least ${REQUIRED_MIN_NATIVE_WEI.toString()} wei to cover ` +
        `the swap value plus grantSession + execute gas — Altana's relay is not MegaFuel-sponsored). ` +
        `Fund it from the BNB Chain testnet faucet (https://testnet.bnbchain.org/faucet-smart) ` +
        `and rerun scripts/altana-demo-swap.ts.`
    );
  }

  const permissions = defaultAgentPermissions({
    chainId: BSC_TESTNET_CHAIN_ID,
    // This demo never touches the bnbagent ERC-8183 payment token — no budget needed.
    tokenSpend: { limit: BigInt(0) },
    nativeSpend: { limit: NATIVE_SPEND_CAP_WEI },
    extraCalls: [{ to: PANCAKE_V2_ROUTER_TESTNET }],
  });

  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

  let session;
  try {
    session = await adminProvider.grantSession({ permissions, expiry, register: false });
  } catch (err) {
    throw new Error(
      `Altana grantSession failed for wallet ${adminProvider.address}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // Construct a SEPARATE provider in session mode — execution runs strictly
  // within the granted session key, not the admin key, which is the actual
  // thing this demo is proving.
  const sessionProvider = new AltanaWalletProvider({ network: 'bnb-testnet', session });
  const client = createPublicClient({ chain: bscTestnet, transport: http(BSC_TESTNET_RPC) });
  const executor = sessionProvider.makeExecutor({ client });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  let result;
  try {
    result = await executor.execute({
      description: 'Altana session-key demo: capped PancakeSwap testnet swap',
      call: {
        address: PANCAKE_V2_ROUTER_TESTNET,
        abi: PANCAKE_ROUTER_ABI,
        functionName: 'swapExactETHForTokens',
        // amountOutMin: 0 — fine for a trivial, capped demo trade; NEVER do
        // this for a real-value swap (unbounded slippage).
        args: [BigInt(0), [WBNB_TESTNET, BUSD_TESTNET], sessionProvider.address, deadline],
      },
      value: SWAP_VALUE_WEI,
    });
  } catch (err) {
    throw new Error(
      `Altana session-key swap execution failed (session granted OK for wallet ` +
        `${sessionProvider.address}, expires ${new Date(expiry * 1000).toISOString()}): ${
          err instanceof Error ? err.message : String(err)
        }`
    );
  }

  return {
    transactionHash: result.transactionHash,
    status: result.status,
    walletAddress: sessionProvider.address,
    sessionPublicKey: session.publicKey,
    sessionExpiry: session.expiry,
    swapValueWei: SWAP_VALUE_WEI.toString(),
    network: 'bnb-testnet',
    explorerUrl: `https://testnet.bscscan.com/tx/${result.transactionHash}`,
  };
}
