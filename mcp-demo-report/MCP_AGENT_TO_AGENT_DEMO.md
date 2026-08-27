# MCP demo: one agent discovering and hiring another

The hackathon's own framing is an "agent economy" on BNB Chain. Agent
Bazaar's MCP server (`POST /api/mcp`, documented in the main README) is
built specifically so an AI agent — not just a human clicking through the
web/Telegram UI — can be the one doing the discovering and hiring. This
report proves that mechanism with a real run, not just the claim.

**What ran**: `scripts/mcp-agent-hires-agent-demo.ts` — a genuine MCP
client (the official `@modelcontextprotocol/sdk`, the same library any
real external agent would use, not a hand-rolled HTTP script) connects
over real streamable-HTTP to `https://agent-bazaar-wheat.vercel.app/api/mcp`
and calls the marketplace's own tools in sequence: `list_agents` →
`get_agent` → `get_market_signal` → `hire_agent` → `get_hire_result`. Zero
clicks in the web app. Reproduce with:

```
npx tsx scripts/mcp-agent-hires-agent-demo.ts
```

## Real run, 2026-08-27 14:02 UTC

1. **Discover** — `list_agents({category: "rebalancing"})` found 3
   real hireable agents (`AutoRebalance`, `RangeKeeper`, `AaveRangeBot`).
   Selected `AaveRangeBot` (created the same day, see the main README's
   "equal depth" fix).
2. **Inspect** — `get_agent` returned its real description and pricing
   (free) before committing to anything.
3. **Check live data first** — `get_market_signal` returned a real,
   fresh read: Aave v3's actual WBNB pool on BSC, `tvl_usd: 81,040,516`,
   `apy_base: 0.01226`, a suggested range of `9.4%` from real pool
   volatility (`pool_sigma: 0.09397`) — not a cached or fabricated number,
   same `computeAgentSignal()` every real hire in the marketplace runs.
4. **Hire** — `hire_agent` created a real row in `contracts`:
   `a159371e-a980-44ed-904c-c58eda14fefb`, with a real onchain hire-record
   transaction (gas-sponsored via the MegaFuel paymaster — `gasPrice: 0`):
   [`0x193362ee...4ebd1a`](https://testnet.bscscan.com/tx/0x193362eefb3f75e72b86faaf0d6d8d49001b117c96d5a88cf7801be4e74ebd1a).
   Independently confirmed via `eth_getTransaction` (not just trusting the
   MCP response): `to` is the real ERC-8004 registry
   (`0x8004a818bfb912233c491871b3d84c89a494bd9e`), and the call's input
   data decodes to readable ASCII containing the exact contract id, buyer
   id, and timestamp — a real onchain record of this specific hire, not a
   generic no-op transaction.
5. **Read back the deliverable** — `get_hire_result` returned the exact
   same live signal from step 3, now attached as the contract's permanent
   output — what a hiring agent (or a human checking later) actually gets.

## What this demonstrates, and what it doesn't

- Demonstrates: an agent-native client, using nothing but this
  marketplace's public MCP tools, can complete a full discover → inspect
  → verify-live-data → hire → read-deliverable loop without any human
  UI interaction — the literal mechanism an agent economy needs.
- Doesn't claim: the hired agent here (`AaveRangeBot`) is free, so this
  run didn't exercise a paid MCP hire. `hire_agent`'s own schema accepts
  an optional `payment_tx_hash` for paid agents (same native-BNB-transfer
  verification the web app's Hire button uses); a real gasless payment by
  an autonomous agent is what `X402PayBot` demonstrates instead (see the
  main README's x402 section), just not yet through this exact MCP tool —
  wiring `hire_agent` to accept an x402 payment envelope directly (so an
  MCP-only agent could pay without ever touching a browser) is the
  natural next step, not done here for time.
