/**
 * Altana session-key delegated execution — real, self-custodial, capped
 * onchain execution via `@bnbagent/sdk`'s `AltanaWalletProvider`
 * (EIP-7702). Now wired into the live marketplace (see
 * `POST /api/altana/grant`, `POST /api/altana/revoke`,
 * `GET /api/altana/session/[contractId]`, and the "AltanaGridBot" agent —
 * `scripts/create-altana-gridbot-agent.ts`) as well as the original
 * standalone CLI proof (`scripts/altana-demo-swap.ts`).
 *
 * What this proves: a real Altana session key can execute a genuine, capped
 * PancakeSwap-testnet swap end-to-end — grant a scoped, expiring,
 * KeyStore-registered session, then execute strictly within it (not with
 * the admin key), and get back a real, BscScan-verifiable transaction hash.
 * A user (the admin key holder) can revoke that session at any time — one
 * transaction, effective immediately at the on-chain validator.
 *
 * Three composable pieces, not one monolithic call:
 * - `grantSwapSession()` — admin mode: grant + KeyStore-register a session
 *   scoped to the PancakeSwap testnet router, with a native spend cap and
 *   expiry. Returns the session plus its serialized (persistable) form.
 * - `executeSwapInSession(serializedSession)` — session mode: deserialize
 *   and execute one capped swap strictly within that session's grant.
 * - `revokeGrantedSession(serializedSession)` — admin mode: revoke the
 *   session by its public key. Immediate; gas-only (no registration fee).
 * `runDemoSwap()` composes grant+execute for backward compat with the
 * original CLI script.
 *
 * Why a dedicated wallet we control, not a real buyer's connected wallet:
 * `viem`'s `signAuthorization` (the EIP-7702 authorization Altana's
 * `grantSession` needs) explicitly throws `AccountTypeNotSupportedError` for
 * JSON-RPC/injected accounts — see
 * `node_modules/viem/_esm/actions/wallet/signAuthorization.js`. A MetaMask-
 * connected account cannot sign this today; only a raw private key can. So
 * `ALTANA_DEMO_WALLET_PRIVATE_KEY` is a dedicated demo "buyer" wallet, kept
 * separate from `BNBAGENT_OPERATOR_PRIVATE_KEY` (the ERC-8004 operator
 * identity plays a different role and should not be reused here). Every
 * hire of AltanaGridBot grants a session from this SAME wallet — a
 * limitation of the current demo (see `altana-report/NEXT_STEPS.md`), not
 * of the mechanism: in production each buyer would bring/register their
 * own Altana admin wallet.
 *
 * Gas note: unlike the ERC-8004 registration path elsewhere in this repo,
 * Altana's relay is NOT MegaFuel-sponsored — it recovers gas from the
 * session owner's own on-chain funds, and KeyStore registration additionally
 * costs a real ~$0.50-equivalent fee (in native BNB — trivial on testnet,
 * still a real onchain cost). This demo wallet must hold real testnet BNB
 * (one-time faucet funding), which is why every entry point here checks the
 * real onchain balance up front and fails with a specific, actionable error
 * instead of letting an underfunded wallet crash deep inside the SDK.
 */

import { createPublicClient, formatEther, http } from 'viem';
import { bscTestnet } from 'viem/chains';
import {
  AltanaWalletProvider,
  defaultAgentPermissions,
  serializeSession,
  deserializeSession,
} from '@bnbagent/sdk/wallets';
// Side-effect only — fixes a real Next.js/webpack-specific runtime break in
// the SDK's lazy loader for its ESM-only `@altananetwork/sdk` peer. See
// that file's docstring.
import './sdk-importer';

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
 * plus relay-recovered gas for `execute` (registration's ~$0.50 fee is an
 * ADMIN-authority cost paid by `grantSession` itself, not drawn against this
 * session-enforced cap). Kept small and explicit rather than relying on the
 * SDK's own default (0.02 BNB/day) so the cap in this demo is a deliberate,
 * visible number.
 */
const NATIVE_SPEND_CAP_WEI = BigInt('3000000000000000'); // 0.003 BNB/day

/**
 * Minimum real onchain balance required before attempting anything.
 *
 * Three separate gas-costing operations now draw on this wallet's own
 * balance (no paymaster): `grantSession({ register: true })` — the grant
 * itself PLUS the KeyStore registration fee (~$0.50-equivalent, bundled
 * into the same admin call but priced as its own cost bucket, not "free
 * because it's the same function call") — then `execute` (the swap value
 * plus its own relay gas), and headroom for a later `revokeSession` (gas
 * only, but still a real onchain write this wallet must be able to afford
 * if a user revokes). Budgeting for three operations, not two, is why this
 * is meaningfully higher than the pre-registration `register: false` demo.
 */
const REQUIRED_MIN_NATIVE_WEI = BigInt('10000000000000000'); // 0.01 BNB

/** Default ephemeral demo session lifetime (used by `runDemoSwap`/the CLI script). */
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

/** Mirror of the SDK's own (unexported-by-name) session type — see index.ts's docstring on why we don't import it directly. */
type AltanaSession = Awaited<ReturnType<AltanaWalletProvider['grantSession']>>;

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

export interface GrantedAltanaSession {
  /**
   * Persist this as `contracts.altana_session_key` (wrap it — see
   * `src/lib/altana/session-envelope.ts` — rather than storing it bare, so
   * revocation status has somewhere to live). Contains the session's
   * private key material — treat it like any other secret; never log it,
   * never send it to a client.
   */
  serializedSession: string;
  adminAddress: `0x${string}`;
  sessionAddress: `0x${string}`;
  sessionPublicKey: `0x${string}`;
  /** Unix epoch seconds. */
  expiry: number;
  callAllowlist: `0x${string}`[];
  nativeSpendCapWei: string;
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

async function getAdminProvider(): Promise<AltanaWalletProvider> {
  const privateKey = requirePrivateKey();
  return new AltanaWalletProvider({ network: 'bnb-testnet', privateKey });
}

/**
 * Grant a real, on-chain-registered Altana session (scoped to the
 * PancakeSwap testnet router only, with a small native spend cap) — admin
 * mode. Fails with a clear, specific error (not a generic crash) when the
 * demo wallet has insufficient testnet BNB, since Altana's relay is not
 * MegaFuel-sponsored and both `grantSession` and (later) `execute` spend
 * real gas from the wallet's own balance, on top of the real KeyStore
 * registration fee `register: true` now incurs.
 */
export async function grantSwapSession(opts?: { ttlSeconds?: number }): Promise<GrantedAltanaSession> {
  const adminProvider = await getAdminProvider();

  // Real onchain read — fail clearly before spending anything if the demo
  // wallet was never funded (the faucet's captcha means this is a manual,
  // one-time setup step we may not have been able to complete).
  const { native } = await adminProvider.balances();
  if (native < REQUIRED_MIN_NATIVE_WEI) {
    throw new Error(
      `Altana demo wallet ${adminProvider.address} has insufficient BNB testnet balance ` +
        `(${native.toString()} wei; needs at least ${REQUIRED_MIN_NATIVE_WEI.toString()} wei to cover ` +
        `the swap value plus grantSession (with KeyStore registration) + execute gas — Altana's ` +
        `relay is not MegaFuel-sponsored). Fund it from the BNB Chain testnet faucet ` +
        `(https://testnet.bnbchain.org/faucet-smart) and try again.`
    );
  }

  const permissions = defaultAgentPermissions({
    chainId: BSC_TESTNET_CHAIN_ID,
    // This demo never touches the bnbagent ERC-8183 payment token — no budget needed.
    tokenSpend: { limit: BigInt(0) },
    nativeSpend: { limit: NATIVE_SPEND_CAP_WEI },
    extraCalls: [{ to: PANCAKE_V2_ROUTER_TESTNET }],
  });

  const expiry = Math.floor(Date.now() / 1000) + (opts?.ttlSeconds ?? SESSION_TTL_SECONDS);

  let session: AltanaSession;
  try {
    // register: true — per the Altana track's explicit requirement that
    // sessions be "registered in Keystore, so integration is read onchain
    // rather than from the pitch." This costs the real registration fee
    // (see REQUIRED_MIN_NATIVE_WEI above) in addition to ordinary grant gas.
    session = await adminProvider.grantSession({ permissions, expiry, register: true });
  } catch (err) {
    throw new Error(
      `Altana grantSession (register: true) failed for wallet ${adminProvider.address}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return {
    serializedSession: serializeSession(session),
    adminAddress: adminProvider.address,
    sessionAddress: session.walletAddress,
    sessionPublicKey: session.publicKey,
    expiry: session.expiry,
    callAllowlist: [PANCAKE_V2_ROUTER_TESTNET],
    nativeSpendCapWei: NATIVE_SPEND_CAP_WEI.toString(),
  };
}

/**
 * Execute one capped PancakeSwap testnet swap strictly within a
 * previously-granted session (session mode) — not the admin key, which is
 * the actual thing this demo proves. `serializedSession` is the raw
 * `serializeSession()` output from `grantSwapSession` (not the DB envelope
 * — unwrap that first, see `src/lib/altana/session-envelope.ts`).
 */
export async function executeSwapInSession(serializedSession: string): Promise<AltanaDemoSwapResult> {
  const session = await deserializeSession(serializedSession);
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
        `${sessionProvider.address}, expires ${new Date(session.expiry * 1000).toISOString()}): ${
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

/**
 * Revoke a previously-granted session (admin mode) — free at the protocol
 * level (gas only), effective immediately at the on-chain validator.
 * `serializedSession` is the raw `serializeSession()` output (unwrap the DB
 * envelope first). Only the session's public key is needed for revocation
 * (`revokeSession` accepts either the full object or just the key) — we
 * still deserialize fully so a corrupted/malformed stored session is caught
 * here with a clear error rather than silently sending a wrong key.
 */
export async function revokeGrantedSession(
  serializedSession: string
): Promise<{ transactionHash?: `0x${string}`; status: string; publicKey: `0x${string}` }> {
  const session = await deserializeSession(serializedSession);
  const adminProvider = await getAdminProvider();
  const result = await adminProvider.revokeSession(session.publicKey);
  return { transactionHash: result.transactionHash, status: result.status, publicKey: session.publicKey };
}

/**
 * Standalone proof composition (grant + execute) — kept for
 * `scripts/altana-demo-swap.ts` backward compat. Returns the executed swap
 * result plus the serialized session, so the CLI can show that the session
 * it just used is itself a real, persistable, revocable artifact.
 */
export async function runDemoSwap(): Promise<AltanaDemoSwapResult & { serializedSession: string }> {
  const granted = await grantSwapSession();
  const result = await executeSwapInSession(granted.serializedSession);
  return { ...result, serializedSession: granted.serializedSession };
}

/** Human-readable BNB amount for a wei string — small formatting helper shared by the API routes. */
export function weiToBnb(wei: string): string {
  return formatEther(BigInt(wei));
}
