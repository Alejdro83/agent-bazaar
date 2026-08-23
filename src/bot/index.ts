import { Bot, GrammyError, HttpError } from 'grammy';
import { createServiceClient } from '../lib/supabase/service';

// Bot token from environment
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MINI_APP_URL = process.env.NEXT_PUBLIC_TELEGRAM_MINI_APP_URL || 'https://agent-bazaar.vercel.app';

const CATEGORY_LABELS: Record<string, string> = {
  rebalancing: 'Rebalancing',
  grid_trading: 'Grid Trading',
  yield_optimisation: 'Yield Optimisation',
  health_factor: 'Health Factor',
};

function formatPricing(pricingType: string, pricingValue: number): string {
  if (pricingType === 'free') return 'Free';
  if (pricingType === 'percentage') return `${pricingValue}% yield`;
  return `$${pricingValue}/mo`;
}

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

// Create bot instance
const bot = new Bot(BOT_TOKEN);

// /start command — Welcome + open Mini App
bot.command('start', async (ctx) => {
  const userName = ctx.from?.first_name || 'there';
  
  await ctx.reply(
    `🤖 *Welcome to Agent Bazaar, ${userName}!*\n\n` +
    `Discover, compare, and hire AI agents on BNB Smart Chain.\n\n` +
    `*Quick Commands:*\n` +
    `• /browse — Browse all agents\n` +
    `• /search — Search by keyword\n` +
    `• /myagents — Your active agents\n` +
    `• /help — Show all commands\n\n` +
    `Or tap the button below to open the full marketplace:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🛍️ Open Marketplace',
              web_app: { url: MINI_APP_URL },
            },
          ],
        ],
      },
    }
  );
});

// /browse command — Show categories
bot.command('browse', async (ctx) => {
  await ctx.reply(
    '📂 *Browse Agents by Category*\n\nSelect a category:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚖️ Rebalancing Agents', callback_data: 'browse_rebalancing' }],
          [{ text: '📈 Grid Trading Agents', callback_data: 'browse_grid_trading' }],
          [{ text: '🌾 Yield Agents', callback_data: 'browse_yield_optimisation' }],
          [{ text: '🛡️ Health Factor Agents', callback_data: 'browse_health_factor' }],
          [{ text: '🛍️ Open Full Marketplace', web_app: { url: MINI_APP_URL } }],
        ],
      },
    }
  );
});

// /search command — Prompt for search
bot.command('search', async (ctx) => {
  const query = ctx.match?.trim();
  
  if (!query) {
    await ctx.reply(
      '🔍 *Search Agents*\n\nUsage: `/search <keyword>`\n\nExample: `/search yield harvester`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const supabase = createServiceClient();
  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, name, avg_rating, total_hires, pricing_type, pricing_value, description')
    .eq('status', 'active')
    .textSearch('search_vector', query, { type: 'websearch' })
    .order('total_hires', { ascending: false })
    .limit(3);

  if (error || !agents || agents.length === 0) {
    await ctx.reply(
      `🔍 No agents found for "${query}". Try a different keyword or open the full marketplace:`,
      { reply_markup: { inline_keyboard: [[{ text: '🛍️ Open Marketplace', web_app: { url: MINI_APP_URL } }]] } }
    );
    return;
  }

  const lines = agents.map((a, i) =>
    `${i + 1}. *${a.name}*\n` +
    `   ⭐ ${a.avg_rating.toFixed(1)} (${a.total_hires} hires) | 💰 ${formatPricing(a.pricing_type, a.pricing_value)}\n` +
    `   ${a.description.slice(0, 90)}${a.description.length > 90 ? '…' : ''}`
  );

  await ctx.reply(
    `🔍 *Results for "${query}":*\n\n${lines.join('\n\n')}\n\nOpen the marketplace to hire:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Open Marketplace', web_app: { url: `${MINI_APP_URL}?search=${encodeURIComponent(query)}` } }],
        ],
      },
    }
  );
});

// /myagents command — Show user's hired agents
bot.command('myagents', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const supabase = createServiceClient();
  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, pricing_type, pricing_value, pricing_currency, status, agents(name)')
    .eq('buyer_id', String(telegramId))
    .in('status', ['active', 'completed'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !contracts || contracts.length === 0) {
    await ctx.reply(
      '🤖 *Your Active Agents*\n\n' +
      'You don\'t have any active agents yet.\n\n' +
      'Browse the marketplace to find and hire agents:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛍️ Browse Agents', web_app: { url: MINI_APP_URL } }],
          ],
        },
      }
    );
    return;
  }

  const lines = contracts.map((c) => {
    const agentName = (c.agents as unknown as { name: string } | null)?.name || 'Unknown agent';
    return `🤖 *${agentName}*\n   💰 ${formatPricing(c.pricing_type, c.pricing_value)} | ${c.status}`;
  });

  await ctx.reply(`🤖 *Your Active Agents*\n\n${lines.join('\n\n')}`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '🛍️ Open Marketplace', web_app: { url: `${MINI_APP_URL}/dashboard` } }]],
    },
  });
});

// /help command
bot.command('help', async (ctx) => {
  await ctx.reply(
    '📖 *Agent Bazaar Commands*\n\n' +
    '• /start — Welcome & quick start\n' +
    '• /browse — Browse agents by category\n' +
    '• /search — Search agents by keyword\n' +
    '• /myagents — View your active agents\n' +
    '• /help — Show this help message\n\n' +
    '💡 *Tip:* Tap "Open Marketplace" for the full experience with search, filters, and wallet connection.',
    { parse_mode: 'Markdown' }
  );
});

// Handle callback queries (category browsing)
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  
  if (data.startsWith('browse_')) {
    const category = data.replace('browse_', '');
    // TODO: Query Supabase for agents in category
    
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `📂 *${category.charAt(0).toUpperCase() + category.slice(1)} Agents*\n\n` +
      `Open the marketplace to browse all ${category} agents with filters and search:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `🛍️ Browse ${category} Agents`, web_app: { url: `${MINI_APP_URL}?category=${category}` } }],
          ],
        },
      }
    );
  }
});

// Handle Mini App data (when user completes an action in Mini App)
bot.on('message:web_app_data', async (ctx) => {
  const data = ctx.msg.web_app_data?.data;
  if (data) {
    try {
      const parsed = JSON.parse(data);
      console.log('📱 Mini App data received:', parsed);
      
      // Handle different action types
      switch (parsed.action) {
        case 'hire_confirmed':
          await ctx.reply(
            `✅ *Agent Hired!*\n\n` +
            `🤖 ${parsed.agent_name}\n` +
            `💰 ${parsed.pricing}\n` +
            `📋 Contract ID: \`${parsed.contract_id}\`\n\n` +
            `Use /myagents to monitor your agent.`,
            { parse_mode: 'Markdown' }
          );
          break;
        case 'agent_listed':
          await ctx.reply(
            `🎉 *Agent Listed!*\n\n` +
            `Your agent "${parsed.agent_name}" is now live on Agent Bazaar.\n\n` +
            `Share it with others!`,
            { parse_mode: 'Markdown' }
          );
          break;
        default:
          await ctx.reply('📱 Action completed!');
      }
    } catch (e) {
      console.error('Failed to parse Mini App data:', e);
    }
  }
});

// Error handling
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

// Start bot
async function startBot() {
  console.log('🤖 Starting Agent Bazaar Bot...');
  
  // Set bot commands
  await bot.api.setMyCommands([
    { command: 'start', description: 'Welcome & open marketplace' },
    { command: 'browse', description: 'Browse agents by category' },
    { command: 'search', description: 'Search agents by keyword' },
    { command: 'myagents', description: 'View your active agents' },
    { command: 'help', description: 'Show help message' },
  ]);

  // Start polling
  bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot @${botInfo.username} is running!`);
    },
  });
}

startBot().catch(console.error);