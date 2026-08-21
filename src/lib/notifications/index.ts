import { Bot, Context } from 'grammy';
import { createClient } from '@supabase/supabase-js';

/**
 * Bot notification service
 * Sends Telegram notifications for contract events
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface NotificationEvent {
  type: 'contract_created' | 'contract_completed' | 'contract_expired' | 'new_rating';
  contractId: string;
  agentId: string;
  sellerId: string;
  buyerId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Send notification to a Telegram user
 */
async function sendNotification(
  bot: Bot,
  telegramUserId: string,
  message: string
): Promise<boolean> {
  try {
    await bot.api.sendMessage(telegramUserId, message, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (error) {
    console.error(`Failed to send notification to ${telegramUserId}:`, error);
    return false;
  }
}

/**
 * Format contract notification message
 */
function formatContractMessage(event: NotificationEvent, agentName: string): string {
  switch (event.type) {
    case 'contract_created':
      return (
        `🎉 <b>New Hire!</b>\n\n` +
        `Your agent <b>${agentName}</b> has been hired!\n\n` +
        `📋 Contract: <code>${event.contractId.slice(0, 8)}</code>\n` +
        `👤 Buyer: <code>${event.buyerId.slice(0, 8)}</code>\n\n` +
        `Open Agent Bazaar to view details.`
      );

    case 'contract_completed':
      return (
        `✅ <b>Contract Completed</b>\n\n` +
        `Contract for <b>${agentName}</b> has been completed.\n\n` +
        `📋 Contract: <code>${event.contractId.slice(0, 8)}</code>\n` +
        `💰 Payment has been processed.`
      );

    case 'contract_expired':
      return (
        `⏰ <b>Contract Expired</b>\n\n` +
        `Contract for <b>${agentName}</b> has expired.\n\n` +
        `📋 Contract: <code>${event.contractId.slice(0, 8)}</code>`
      );

    case 'new_rating':
      const score = event.metadata?.score || 0;
      const comment = event.metadata?.comment || 'No comment';
      return (
        `⭐ <b>New Rating!</b>\n\n` +
        `Your agent <b>${agentName}</b> received a new rating.\n\n` +
        `Score: ${'★'.repeat(Number(score))}${'☆'.repeat(5 - Number(score))}\n` +
        `Comment: "${comment}"`
      );

    default:
      return `📢 Update for ${agentName}`;
  }
}

/**
 * Process a notification event
 */
export async function processNotification(
  bot: Bot,
  event: NotificationEvent
): Promise<void> {
  // Fetch agent name
  const { data: agent } = await supabase
    .from('agents')
    .select('name')
    .eq('id', event.agentId)
    .single();

  const agentName = agent?.name || 'Unknown Agent';
  const message = formatContractMessage(event, agentName);

  // Notify seller
  await sendNotification(bot, event.sellerId, message);

  // For contract_created, also notify buyer
  if (event.type === 'contract_created') {
    const buyerMessage =
      `✅ <b>Hire Confirmed!</b>\n\n` +
      `You've successfully hired <b>${agentName}</b>.\n\n` +
      `📋 Contract: <code>${event.contractId.slice(0, 8)}</code>\n\n` +
      `The agent is now active. Open Agent Bazaar to view details.`;

    await sendNotification(bot, event.buyerId, buyerMessage);
  }
}

/**
 * Setup Supabase realtime listener for contract events
 * Call this when the bot starts
 */
export function setupRealtimeListeners(bot: Bot): void {
  // Listen for new contracts
  supabase
    .channel('contracts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'contracts',
      },
      async (payload) => {
        const contract = payload.new;
        await processNotification(bot, {
          type: 'contract_created',
          contractId: contract.id,
          agentId: contract.agent_id,
          sellerId: contract.seller_id,
          buyerId: contract.buyer_id,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'contracts',
      },
      async (payload) => {
        const contract = payload.new;
        const oldContract = payload.old;

        if (contract.status === 'completed' && oldContract.status !== 'completed') {
          await processNotification(bot, {
            type: 'contract_completed',
            contractId: contract.id,
            agentId: contract.agent_id,
            sellerId: contract.seller_id,
            buyerId: contract.buyer_id,
          });
        }
      }
    )
    .subscribe();

  // Listen for new ratings
  supabase
    .channel('ratings')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ratings',
      },
      async (payload) => {
        const rating = payload.new;

        // Fetch contract to get seller_id
        const { data: contract } = await supabase
          .from('contracts')
          .select('seller_id, buyer_id')
          .eq('id', rating.contract_id)
          .single();

        if (contract) {
          await processNotification(bot, {
            type: 'new_rating',
            contractId: rating.contract_id,
            agentId: rating.agent_id,
            sellerId: contract.seller_id,
            buyerId: contract.buyer_id,
            metadata: {
              score: rating.score,
              comment: rating.comment,
            },
          });
        }
      }
    )
    .subscribe();

  console.log('🔔 Realtime notification listeners active');
}
