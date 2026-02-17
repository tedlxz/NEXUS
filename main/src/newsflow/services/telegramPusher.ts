import { Telegraf } from 'telegraf';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { newsflowConfig } from '../config';
import type { DailyBriefing } from '../types';
import { formatBriefingMessage } from '../templates/dailyBriefing';

/**
 * Telegram Pusher Service
 *
 * Sends daily briefing to configured Telegram chat
 */

let bot: Telegraf | null = null;

function getBot(): Telegraf {
  if (!bot) {
    const options: Partial<Telegraf.Options<any>> = {};
    if (newsflowConfig.telegram.proxy) {
      const agent = new HttpsProxyAgent(newsflowConfig.telegram.proxy);
      options.telegram = { agent: agent as any };
      console.log(`[Newsflow] Telegram using proxy: ${newsflowConfig.telegram.proxy}`);
    }
    bot = new Telegraf(newsflowConfig.telegram.botToken, options);
  }
  return bot;
}

/**
 * Send daily briefing to Telegram
 */
export async function sendBriefingToTelegram(briefing: DailyBriefing): Promise<boolean> {
  const chatId = newsflowConfig.telegram.chatId;

  try {
    const message = formatBriefingMessage(briefing);
    const tgBot = getBot();

    // Split message if too long (Telegram has 4096 char limit per message)
    if (message.length > 4000) {
      const parts = splitMessage(message, 4000);
      for (const part of parts) {
        if (part.trim()) {
          await tgBot.telegram.sendMessage(chatId, part, {
            parse_mode: 'Markdown',
          });
        }
      }
    } else {
      await tgBot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
    }

    console.log(`[Newsflow] Sent briefing to Telegram chat ${chatId}`);
    return true;
  } catch (error) {
    console.error('[Newsflow] Error sending to Telegram:', error);
    return false;
  }
}

/**
 * Send error notification to Telegram
 */
export async function sendErrorNotification(error: string): Promise<boolean> {
  const chatId = newsflowConfig.telegram.chatId;

  try {
    const tgBot = getBot();
    await tgBot.telegram.sendMessage(
      chatId,
      `❌ *Newsflow 运行错误*\n\n${error}`,
      { parse_mode: 'Markdown' }
    );
    return true;
  } catch (err) {
    console.error('[Newsflow] Error sending error notification:', err);
    return false;
  }
}

/**
 * Send test message to verify Telegram connection
 */
export async function sendTestMessage(): Promise<boolean> {
  const chatId = newsflowConfig.telegram.chatId;

  try {
    const tgBot = getBot();
    await tgBot.telegram.sendMessage(
      chatId,
      '✅ *Newsflow 配置测试*\n\nTelegram 连接成功！',
      { parse_mode: 'Markdown' }
    );
    return true;
  } catch (error) {
    console.error('[Newsflow] Error sending test message:', error);
    return false;
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt === -1) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}

export default {
  sendBriefingToTelegram,
  sendErrorNotification,
  sendTestMessage,
};
