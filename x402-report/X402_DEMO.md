# x402/B402 gasless payment demo — completed, 2026-08-27

`POST /api/x402/demo`, self-hosted — not an official partner track (no
separate bounty exists for x402/B402 in this hackathon), built as an
additional real payment rail beyond the direct-BNB hire flow.

## Facilitator investigation

Two officially-referenced facilitator paths were tried and ruled out by
direct verification, not guesswork:
- Vistara-Labs' open facilitator (`facilitator.b402.ai`) is NXDOMAIN
  (confirmed against Google's public DoH resolver).
- Binance's own gated b402 merchant API needs real merchant onboarding
  (client id, access token, RSA key) unavailable here.

Landed on [`@altananetwork/x402-server`](https://www.npmjs.com/package/@altananetwork/x402-server)
instead — published by the same Altana Network this project already
integrates for the session-key track, a merchant **we run ourselves**,
with no third-party facilitator uptime dependency. See
`src/lib/x402/merchant.ts` for the full story.

## Fully exercised end-to-end in real production, 2026-08-27

A real buyer (the same Altana demo wallet, reused deliberately as both
buyer and facilitator/payTo: a real, verifiable self-transfer, and a
wallet a faucet's anti-sybil check is more likely to accept than a
brand-new empty one — the same friction already hit once on the Altana
side, see `altana-report/NEXT_STEPS.md`) signs a real EIP-3009
`TransferWithAuthorization` for 0.1 testnet **$U**
(`0xc70B8741...648E5565`, cross-verified against `@bnbagent/sdk`'s own
address manifest and a live `get_erc20_token_info` read), gets it verified
and settled on-chain by our own facilitator (gasless for the buyer — only
the facilitator's tBNB pays gas), and receives a real
`computeAgentSignal()` result back.

- Real settlement transaction: tx
  [`0xf35d13fb...8a7c54`](https://testnet.bscscan.com/tx/0xf35d13fb63348856cae6467f2f52669384f2821a8e455d34be5fe99fd38a7c54),
  status `success`, verified directly via `eth_getTransactionReceipt` (not
  just the API's own report) — see `scripts/x402-buyer-demo.ts`.
- The facilitator wallet's real tBNB balance dropped by the exact gas cost
  of that broadcast (0.297168 → 0.297160 tBNB), confirming a real
  transaction was actually mined, not simulated.

## Reproducing

Get testnet $U for a funded wallet — message the official Telegram bot
[`@bnbchain_official_bot`](https://t.me/bnbchain_official_bot) with "I
would like to get U to my wallet `<address>`" (per
`@bnbagent/studio-cli`'s README; more options at
[united-coin-u.github.io/u-faucet](https://united-coin-u.github.io/u-faucet/)),
set `ALTANA_DEMO_WALLET_PRIVATE_KEY` (or `X402_BUYER_WALLET_PRIVATE_KEY`
for a separate buyer), then run:

```
npx tsx --env-file-if-exists=.env.local scripts/x402-buyer-demo.ts
```
