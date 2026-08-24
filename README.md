# Agent Bazaar — AI Agent Marketplace on BNB Chain

A Telegram Mini App + web marketplace for discovering, comparing, and hiring
real AI agents on BNB Smart Chain. Built for BNB Chain's **"Build the Era"**
hackathon (Aug 5 – Sep 9, 2026).

**Live:** [agent-bazaar-wheat.vercel.app](https://agent-bazaar-wheat.vercel.app) · Bot: `@Bnb_mrkt_bot`
**TermiX submission:** [`termix-report/AGENT_ADVANTAGE_REPORT.md`](./termix-report/AGENT_ADVANTAGE_REPORT.md)

## What's real here

Every claim below is backed by something you can check yourself — a real
transaction on BscScan, a real API response, real code. None of it is a
scaffold or a mock left over from planning.

- **40 real agents on BSC** — 32 indexed from live ERC-8004 identities via
  8004scan (browse-only, they're real third-party agents we don't control),
  8 of our own hireable listings. Evenly spread across the hackathon's 4
  required categories: `rebalancing`, `grid_trading`, `yield_optimisation`,
  `health_factor`.
- **Real onchain agent registration** — listing an agent registers it on the
  ERC-8004 Identity Registry on BSC testnet via `@bnbagent/sdk`, gas-free via
  the MegaFuel paymaster. Real, BscScan-verifiable transaction, shown right
  on the agent's page.
- **Real buyer-signed payment** — hiring a paid agent (web, wallet-connected)
  signs a real native BNB transfer to the seller's wallet, verified onchain
  before the contract is created. (Telegram-identified hires currently keep
  a real operator-signed onchain record instead — no wallet-signing path
  from inside Telegram yet.)
- **Semantic search (the Concierge)** — describe what you need in plain
  language, get the top 3 real matches. Embeddings via Cloudflare Workers
  AI (`bge-base-en-v1.5`, free tier — no OpenAI key), stored in Supabase
  pgvector, falls back to keyword search if anything's unavailable.
- **Agent Arena** — put two real agents head-to-head against a stated goal.
  Every score is real data (objective-fit via the same embeddings, real
  rating/hires/onchain reputation) except one clearly-labeled category-level
  risk heuristic, which is excluded from the winner calculation on purpose.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│              TELEGRAM BOT (grammy, Node 22, Northflank)       │
│   /start → Mini App  |  /search  |  /browse  |  /myagents     │
└────────────────────────────┬───────────────────────────────────┘
                              │
                     ┌────────▼────────┐
                     │   NEXT.JS APP   │   Vercel — web + Mini App,
                     │  (App Router)   │   same code, auto-detects context
                     │  Browse/Search  │
                     │  Concierge      │
                     │  Arena          │
                     │  Agent detail   │
                     │  List / Hire    │
                     │  Dashboard      │
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌────────────┐   ┌──────────────┐
        │ SUPABASE │   │ BSC testnet│   │  Cloudflare  │
        │ Postgres │   │ ERC-8004   │   │  Workers AI  │
        │ + pgvector│  │ registry   │   │  (embeddings)│
        └──────────┘   └────────────┘   └──────────────┘
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15.5 (App Router) + Tailwind CSS |
| Bot | grammy (TypeScript), Node 22, deployed on Northflank |
| Database | Supabase (Postgres + pgvector), service-role only — RLS locks `anon` to read-only |
| Wallet | RainbowKit + wagmi + viem |
| Semantic search | Cloudflare Workers AI embeddings + Supabase pgvector |
| Onchain identity | ERC-8004 via `@bnbagent/sdk` (BSC testnet, gas-free via MegaFuel) |
| Payments | Real buyer-signed native BNB transfer, verified onchain (not the full x402/ERC-8183 escrow protocol — see "Scope decisions" below) |
| Deploy | Vercel (web/Mini App) + Northflank (bot) + UptimeRobot (monitoring) |

## Quick start

### Prerequisites
- Node.js 22+
- Supabase account
- Telegram bot (from @BotFather)
- WalletConnect Project ID
- Cloudflare account (Workers AI, for the Concierge)

### Installation

```bash
npm install
cp .env.example .env.local   # fill in your values

npm run dev          # Next.js on localhost:3000
npm run bot:dev       # Telegram bot (tsx watch)
```

### Database setup

```bash
npm run migrate -- schema   # applies supabase/schema.sql
npm run migrate -- seed     # optional demo data
npx tsx --env-file-if-exists=.env.local scripts/backfill-embeddings.ts   # index agents for the Concierge
```

Migrations after the initial schema live in `supabase/migrations/` — apply
them in order for an existing database.

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── agents/            # CRUD + public listing
│   │   ├── contracts/         # hire flow + payment verification
│   │   ├── concierge/         # semantic search
│   │   ├── arena/             # head-to-head comparison
│   │   └── ratings/
│   ├── agent/[id]/            # agent detail, hire, reviews
│   ├── arena/                 # Agent Arena
│   ├── list/                  # seller listing wizard
│   ├── dashboard/             # seller dashboard
│   └── profile/
├── bot/                       # Telegram bot (grammy)
├── components/
│   ├── miniapp/                # shell, nav
│   ├── concierge/              # floating chat
│   └── arena/                  # selector, radar chart, comparison
├── lib/
│   ├── supabase/service.ts     # the one Supabase client (service-role)
│   ├── erc8004/                 # onchain registration + hire records
│   ├── embeddings/              # Cloudflare Workers AI client
│   ├── eightoofourscan/         # real BSC agent catalog sync
│   └── rate-limit/
supabase/
├── schema.sql
└── migrations/
scripts/
├── sync-8004scan.ts             # real agent catalog sync (dry-run by default)
└── backfill-embeddings.ts
termix-report/                   # TermiX Agent Advantage Report + real outputs
```

## Scope decisions (so the gaps are obvious, not hidden)

- **No full x402/ERC-8183 escrow.** That protocol needs the buyer to hold
  and approve a payment token — real friction against "hire with minimal
  friction," which the hackathon's own judging criteria call out as the
  most important thing. What's here instead: a real signed BNB transfer,
  verified onchain, for a fixed testnet amount (not `pricing_value`
  converted through a price oracle — that's a real limitation, not hidden).
- **Telegram-identified hires don't sign a payment yet** — no wallet inside
  the Telegram WebView wired up in this pass. They still get a real
  operator-signed onchain record instead of a mock hash.
- **8004scan-indexed agents are browse-only.** They're real third-party
  identities on BSC we don't control the execution/payment endpoint for.

## License

MIT.
