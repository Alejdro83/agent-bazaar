# Altana session-key demo — completed, 2026-08-26

The funding gap documented below is closed. The demo wallet
(`0x8d147CFFBb304d57C744b4f8DB7Eb266c8e0Aa25`) was funded on 2026-08-26 —
0.0078 BNB mainnet (to satisfy the official testnet faucet's anti-sybil
check) and 0.3 BNB testnet (from the faucet itself) — and both the
standalone CLI proof and the real production API flow have been run
end-to-end, each producing a real, verified onchain transaction.

## Real results (verified via `eth_getTransactionReceipt`, not just SDK output)

**Standalone CLI** (`scripts/altana-demo-swap.ts`): a capped swap executed
strictly through the session key (not the admin key).
- tx: `0x49fb7e0cdb5c3a8ad6d9e280343cf6c20046bd7128a4d52205caab9a61759e01`
- status: `1` (success)
- BscScan: https://testnet.bscscan.com/tx/0x49fb7e0cdb5c3a8ad6d9e280343cf6c20046bd7128a4d52205caab9a61759e01
- session public key: `0x041fca1f9f33b5a8dff8c6405a57f97049059f0dfdb3778bcb185a465963a911d3581b4b48d9c4296968bbb5bbb2c0f46771ea32a2d1fa32bf9dd23d249a33a5d7`
- granted with `register: true` (real KeyStore registration)

**Real production flow** (the exact path a buyer/judge hits in the live
app — `POST /api/altana/grant` → `GET /api/altana/session/[contractId]` →
`POST /api/altana/revoke`), run directly against
`https://agent-bazaar-wheat.vercel.app`:
- Grant produced contract `1a3df19a-660b-4e81-a402-455621eba705` and a
  real, KeyStore-registered session (public key
  `0x043fc44c9d3c7b1984707bca29cc13c193b8234810bac880860f3032be09814724087423f203055fc020f3c9b4169f333db6507349242d0b7ea15265ee7e4dbf93`,
  spend cap 0.003 BNB, 1h expiry).
- Session-status endpoint correctly read back the live allowlist/spend
  cap/expiry (`status: "active"`).
- Revoke produced a second real transaction:
  `0xee7f5b8ea038307c64a1b8d29839eb5e1b579e0e921f8a7e4e4acb577a90c1be`,
  status `1`, confirmed at block 127328184.

## Verifiable independently, not just via BscScan

Altana runs its own **Keystore Explorer** — a separate lookup tool from a
normal chain explorer, purpose-built for verifying registered sessions —
at [`testnet.altana.network`](https://testnet.altana.network). Looking up
the demo wallet directly there
([`/account/0x8d147CFFBb304d57C744b4f8DB7Eb266c8e0Aa25`](https://testnet.altana.network/account/0x8d147CFFBb304d57C744b4f8DB7Eb266c8e0Aa25))
shows its 3 real registered keys (1 root, 2 session) — one session
`Expired`, the other `Revoked`. That second one is the exact session the
real production flow above granted then revoked: independent confirmation
of both steps, without taking this report's word for it. This is the
literal evidence "Best Built with Altana" asks for (*"live onchain
transactions in the Altana explorer"*), not just a BscScan link.

## How the funding gap was actually closed

The official BNB testnet faucet turned out to require the *requesting*
address to already hold ≥0.002 BNB on **BSC mainnet** (an anti-sybil
check, undocumented on the faucet page itself, only surfaced as a
`Request Failed: insufficient BNB on BSC mainnet` error). Since Coinbase.com
doesn't support BNB Smart Chain withdrawals natively, the path that worked
was: buy a small amount of real BNB directly on BSC mainnet via MetaMask's
built-in on-ramp (card/Apple Pay via MoonPay/Transak), send ~0.0078 BNB to
the demo wallet, then retry the testnet faucet successfully (0.3 BNB
received).

## Reproducing

```
npx tsx --env-file-if-exists=.env.local scripts/altana-demo-swap.ts
```

runs another full grant → execute cycle against the same funded wallet
(each run consumes a small amount of the remaining testnet balance).
