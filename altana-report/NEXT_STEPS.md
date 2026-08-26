# Altana session-key demo — the one remaining manual step

Everything code-side is done and verified (see the session's report). The
only thing blocking a real, live onchain transaction is that the dedicated
demo wallet has never been funded — the BNB Chain testnet faucet requires a
captcha/browser, which this environment cannot complete.

## 1. Fund this exact address

```
0x8d147CFFBb304d57C744b4f8DB7Eb266c8e0Aa25
```

Faucet: https://testnet.bnbchain.org/faucet-smart

Request at least **0.01 BNB** (testnet) — `grantSession({ register: true })`
now pays a real KeyStore registration fee on top of ordinary relay gas, plus
the swap value and execute gas. See `REQUIRED_MIN_NATIVE_WEI` in
`src/lib/altana/index.ts` for the exact breakdown/amount if you want to fund
more precisely.

The private key for this address already lives in `.env.local` as
`ALTANA_DEMO_WALLET_PRIVATE_KEY` — nothing else needs to change.

## 2. Run the standalone CLI proof (fastest way to confirm funding worked)

```
npx tsx --env-file-if-exists=.env.local scripts/altana-demo-swap.ts
```

This grants a real, KeyStore-registered Altana session scoped to the
PancakeSwap testnet router, executes one capped swap strictly within that
session (not the admin key), and prints a real, BscScan-verifiable
transaction hash plus the session's public key (check it against the
KeyStore registry to confirm `register: true` really landed onchain).

## 3. Exercise the full product flow (optional, but this is the actual demo)

Once funded, the same mechanism is live in the app:

1. Load `/agent/<AltanaGridBot's id>` and click **Grant Altana session**.
   This creates a real contract (same free-agent hire path every other
   agent uses) AND grants a real, registered Altana session in one call
   (`POST /api/altana/grant`).
2. You land on `/hire/<contract id>`, which now shows a live **Altana
   session** panel: the real call allowlist, spend cap, and expiry
   countdown, read back from `GET /api/altana/session/[contractId]`.
3. Click **Revoke session** — a real, immediate on-chain revocation
   (`POST /api/altana/revoke`), and the panel updates to `revoked` with the
   real revoke transaction hash.

Without funding, step 1 currently fails with a specific, honest error
(insufficient BNB testnet balance) surfaced directly in the UI — not a
crash, not a generic "something went wrong." That's the expected state
right now, not a bug.
