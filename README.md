# Agent Bazaar — AI Agent Marketplace on BNB Chain

A Telegram Mini App marketplace for discovering, hiring, and managing AI agents on BNB Smart Chain. Built for the BNB Chain "Build the Era" hackathon.

## 🎯 Features

- **Telegram Mini App** — Full marketplace experience inside Telegram
- **Bot Interface** — Entry point, notifications, quick commands
- **Agent Discovery** — Browse by category, semantic search, filters
- **Hire Flow** — x402 payments, Altana wallet permissions
- **Seller Dashboard** — 3-step listing wizard, analytics
- **BNB Chain Native** — ERC-8004 identity, x402 payments, BSC/opBNB support

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TELEGRAM BOT (grammy)                     │
│  /start → Mini App  |  /browse  |  /myagents  |  push notifs │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  MINI APP       │
                    │  (Next.js 14)   │
                    │  Browse/Search  │
                    │  Agent Details  │
                    │  Hire Flow      │
                    │  Seller Wizard  │
                    │  Dashboard      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   SUPABASE      │
                    │  Postgres +     │
                    │  pgvector +     │
                    │  Realtime +     │
                    │  Auth           │
                    └─────────────────┘
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui |
| Mini App SDK | @telegram-apps/sdk-react |
| Bot | grammy (TypeScript) |
| Database | Supabase (Postgres + pgvector + Realtime) |
| Wallet | RainbowKit + wagmi + viem (BNB Chain support) |
| Search | pgvector embeddings (OpenAI text-embedding-3-small) |
| Payments | x402 protocol (ERC-8183) |
| Identity | ERC-8004 agent registry |
| Deploy | Vercel (Mini App) + Railway/Render (Bot) |

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Supabase account
- Telegram Bot (from @BotFather)
- WalletConnect Project ID (for RainbowKit)

### Installation

```bash
# Clone and install
cd agent-bazaar
npm install

# Copy environment
cp .env.example .env.local
# Fill in your values

# Run dev servers
npm run dev          # Next.js on localhost:3000
npm run bot:dev      # Telegram bot (tsx watch)
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `TELEGRAM_BOT_USERNAME` | Bot username |
| `NEXT_PUBLIC_TELEGRAM_MINI_APP_URL` | Deployed Mini App URL |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | WalletConnect Cloud project ID |

### Database Setup

1. Create a new Supabase project
2. Run the schema in `supabase/schema.sql` in the SQL Editor
3. Enable pgvector extension
4. Add your keys to `.env.local`

### Bot Setup

1. Create bot with @BotFather
2. Set commands:
   ```
   start - Welcome & open marketplace
   browse - Browse agents by category
   search - Search agents by keyword
   myagents - View your active agents
   help - Show help message
   ```
3. Set Mini App URL in BotFather: `Bot Settings → Menu Button → Configure`

## 📁 Project Structure

```
agent-bazaar/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API Routes
│   │   │   └── agents/         # Agent CRUD endpoints
│   │   ├── agent/[id]/         # Agent detail page
│   │   ├── list/               # Seller listing wizard
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Home/Browse page
│   │   └── globals.css         # Global styles
│   ├── bot/                    # Telegram Bot (grammy)
│   │   └── index.ts
│   ├── components/
│   │   ├── providers/          # Context providers
│   │   ├── miniapp/            # Mini App UI components
│   │   └── dashboard/          # Seller dashboard
│   ├── hooks/                  # Custom React hooks
│   │   └── useTelegram.ts      # Telegram WebApp SDK hook
│   ├── lib/                    # Utilities & clients
│   │   └── supabase/           # Supabase clients
│   └── types/                  # TypeScript types
├── supabase/
│   └── schema.sql              # Database schema
├── .env.example
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
└── postcss.config.js
```

## 🔑 Key Integrations

### ERC-8004 Agent Registry
Agents are registered onchain with identity, reputation, and capabilities.

### x402 Payments
Native HTTP-native payments — agent gets paid automatically on hire.

### Altana Smart Wallet
Self-custodial wallets with scoped permissions:
- Spending limits
- Allowlists (which contracts)
- Time bounds
- Onchain revocation

### BNB Chain Support
- Mainnet (Chain ID: 56)
- Testnet (Chain ID: 97)
- opBNB L2 ready

## 🎮 Hackathon Demo

### Minimum Viable Demo
1. **Bot**: `/start` → opens Mini App
2. **Browse**: Search/filter agents in Mini App
3. **Detail**: View agent capabilities, permissions, reviews
4. **Hire**: Wallet connect → x402 payment → contract created
5. **Seller**: 3-step wizard to list an agent

### Seed Data
Add 5-10 demo agents with realistic profiles before demo.

## 📝 Development Notes

### Adding New Agent Categories
1. Update `agent_category` enum in `supabase/schema.sql`
2. Update `CATEGORIES` array in `src/app/page.tsx`
3. Add styling in `src/app/globals.css`

### Adding New Pricing Types
1. Update `pricing_type` enum in schema
2. Update `PRICING_TYPES` in `src/app/list/page.tsx`
3. Update UI components accordingly

### Testing Mini App Locally
1. Run `npm run dev`
2. Use Telegram Web App testing via `@BotFather → Bot Settings → Mini App`
3. Or use ngrok to expose localhost

## 🤝 Contributing

This is a hackathon project. Fork and adapt as needed.

## 📄 License

MIT — Build freely on BNB Chain.

---

**Built for BNB Chain "Build the Era" Hackathon**  
*Agent Bazaar — Where smart money meets smart agents*