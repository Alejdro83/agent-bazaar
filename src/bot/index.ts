import { Bot, GrammyError, HttpError } from 'grammy';
import { hydrate } from '@grammyjs/hydrate';

// Bot token from environment
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MINI_APP_URL = process.env.NEXT_PUBLIC_TELEGRAM_MINI_APP_URL || 'https://agent-bazaar.vercel.app';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

// Create bot instance
const bot = new Bot(BOT_TOKEN);

// Use hydrate for reply methods
bot.use(hydrate());

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
          [{ text: '🌾 Yield Agents', callback_data: 'browse_yield' }],
          [{ text: '📈 Trading Agents', callback_data: 'browse_trading' }],
          [{ text: '🏦 DeFi Agents', callback_data: 'browse_defi' }],
          [{ text: '👁️ Monitoring Agents', callback_data: 'browse_monitoring' }],
          [{ text: '📊 Analytics Agents', callback_data: 'browse_analytics' }],
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

  // TODO: Query Supabase with semantic search
  await ctx.reply(
    `🔍 Searching for "${query}"...\n\n` +
    `*Top Results:*\n\n` +
    `1. 🌾 *BeefyHarvester v2*\n` +
    `   ⭐ 4.8 (340 hires) | 💰 0.5% yield\n` +
    `   Auto-harvest and restake across Venus, PancakeSwap, Beefy\n\n` +
    `2. 📈 *GridBot Pro*\n` +
    `   ⭐ 4.5 (128 hires) | 💰 $25/mo\n` +
    `   Automated grid trading on PancakeSwap\n\n` +
    `Tap an agent to see details, or open the full marketplace:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛍️ Open Marketplace', web_app: { url: MINI_APP_URL } }],
        ],
      },
    }
  );
});

// /myagents command — Show user's hired agents
bot.command('myagents', async (ctx) => {
  // TODO: Query Supabase for user's contracts
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
bot.on('web_app_data', async (ctx) => {
  const data = ctx.webAppData?.data;
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