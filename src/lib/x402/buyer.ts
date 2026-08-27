/**
 * Buyer-side x402 signing, extracted from scripts/x402-buyer-demo.ts so the
 * real hire route (src/app/api/contracts/x402/route.ts) and the CLI proof
 * script share one implementation instead of two copies that could drift.
 *
 * Server-only: signs with a private key, never exposed to the browser.
 * See src/lib/x402/merchant.ts's docstring for why this demo signs with our
 * own funded wallet rather than a connected browser wallet (same wallet
 * plays both facilitator/seller and buyer — a real, verifiable
 * self-transfer, chosen deliberately, see that file and .env.local).
 */
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';

interface ChallengeAccept {
  scheme: string;
  network: string;
  asset: `0x${string}`;
  payTo: `0x${string}`;
  amount: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; assetTransferMethod: string };
}

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ('0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
}

/** Signs a real EIP-3009 TransferWithAuthorization for the given challenge
 * accept-entry and returns the base64 X-PAYMENT envelope ready to send
 * straight back to the same merchant that issued the challenge. */
export async function signX402Payment(accept: ChallengeAccept): Promise<string> {
  const privateKey = process.env.X402_BUYER_WALLET_PRIVATE_KEY || process.env.ALTANA_DEMO_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('Neither X402_BUYER_WALLET_PRIVATE_KEY nor ALTANA_DEMO_WALLET_PRIVATE_KEY is set');
  }
  const buyer = privateKeyToAccount(privateKey as `0x${string}`);

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: buyer.address,
    to: accept.payTo,
    value: BigInt(accept.amount),
    validAfter: BigInt(now - 60),
    validBefore: BigInt(now + accept.maxTimeoutSeconds),
    nonce: randomNonce(),
  };
  const domain = {
    name: accept.extra.name,
    version: accept.extra.version,
    chainId: bscTestnet.id,
    verifyingContract: accept.asset,
  };
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  } as const;
  const signature = await buyer.signTypedData({
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  });

  const envelope = {
    x402Version: 2,
    scheme: accept.scheme,
    network: accept.network,
    payload: {
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
      signature,
    },
  };
  return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

export type { ChallengeAccept };
