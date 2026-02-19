import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config, PersonData, ConversationData } from '../config';
import https from 'https';
import http from 'http';

const confirmKeyboard = Markup.inlineKeyboard([
  Markup.button.callback('✅ 确认', 'confirm_yes'),
  Markup.button.callback('❌ 否', 'confirm_no'),
]);

// For fuzzy contact matching - creates buttons for multiple matches
function createContactChoiceKeyboard(contacts: Array<{name: string; info: string}>): any {
  const buttons = contacts.map(c => [
    Markup.button.callback(`${c.name} (${c.info})`, `contact_${encodeURIComponent(c.name)}`)
  ]);
  buttons.push([Markup.button.callback('都不是，重新输入', 'contact_none')]);
  return Markup.inlineKeyboard(buttons);
}

import {
  handleMessage,
  handleTranscript,
  handleStatus,
  handlePending,
  handleFollowUp,
  handleExport,
  handleBrainstormCommand,
  handleDeleteContact,
  handleDashboard,
  handleMigrateCompanies,
  handleSync,
  handleEnrich,
  processTranscriptWithContact,
  executeNewContactWithTranscript,
  getPendingAction,
  confirmPendingAction,
  clearPendingAction,
  clearChatHistory,
  pendingActions,
} from './handlers';
import { runNewsflow } from '../newsflow';

export function createBot(): Telegraf {
  const telegramOptions: Partial<Telegraf.Options<Context>> = {};

  if (config.telegram.proxy) {
    const agent = new HttpsProxyAgent(config.telegram.proxy);
    telegramOptions.telegram = {
      agent: agent as any,
    };
    console.log(`[Bot] Using proxy: ${config.telegram.proxy}`);
  }

  const bot = new Telegraf(config.telegram.botToken, telegramOptions);

  // Auth middleware
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id?.toString();
    if (
      config.telegram.authorizedUserIds.length > 0 &&
      userId &&
      !config.telegram.authorizedUserIds.includes(userId)
    ) {
      console.log(`[Auth] Rejected user ${userId}`);
      await ctx.reply('Unauthorized. Your user ID: ' + userId);
      return;
    }
    return next();
  });

  // Commands
  bot.command('start', async (ctx) => {
    await ctx.reply(
      '🔷 *NEXUS PE CRM* is ready\\.\n\n' +
      'Send me natural language messages to:\n' +
      '• Record a new contact\n' +
      '• Log a conversation\n' +
      '• Update contact info\n' +
      '• Delete a contact\n' +
      '• Brainstorm network connections\n' +
      '• Query your contacts\n' +
      '• Add action items\n\n' +
      'Commands:\n' +
      '/brainstorm \\<topic\\> — Find relevant contacts\n' +
      '/delete \\<name\\> — Delete a contact\n' +
      '/status — System overview\n' +
      '/pending — Pending action items\n' +
      '/followup — Due follow\\-ups\n' +
      '/dashboard — Generate Data Dashboard\n' +
      '/migrate — Migrate company data\n' +
      '/sync — Sync Obsidian changes to SQL\n' +
      '/enrich — Enrich contact profiles with AI\n' +
      '/clear — 清空对话上下文\n' +
      '/export — Export contact index',
      { parse_mode: 'MarkdownV2' }
    );
  });

  bot.command('clear', async (ctx) => {
    clearChatHistory(ctx.from.id);
    await ctx.reply('🗑 对话上下文已清空。');
  });

  bot.command('status', async (ctx) => {
    const result = await handleStatus();
    await ctx.reply(result, { parse_mode: 'Markdown' });
  });

  bot.command('pending', async (ctx) => {
    const result = await handlePending();
    await ctx.reply(result, { parse_mode: 'Markdown' });
  });

  bot.command('followup', async (ctx) => {
    const result = await handleFollowUp();
    await ctx.reply(result, { parse_mode: 'Markdown' });
  });

  bot.command('brainstorm', async (ctx) => {
    const query = ctx.message.text.replace(/^\/brainstorm\s*/, '').trim();
    const userId = ctx.from.id.toString();
    if (!query) {
      await ctx.reply(
        '用法: /brainstorm <话题>\n\n' +
        '例如:\n' +
        '• /brainstorm 半导体行业\n' +
        '• /brainstorm 医疗器械出海东南亚\n' +
        '• /brainstorm 找一个消费品行业的FA'
      );
      return;
    }
    try {
      await ctx.sendChatAction('typing');
      const result = await handleBrainstormCommand(query, userId);
      await sendReply(ctx, result);
    } catch (err) {
      console.error('[Brainstorm Error]', err);
      await ctx.reply('Brainstorm failed. Please try again.');
    }
  });

  bot.command('export', async (ctx) => {
    const userId = ctx.from.id.toString();
    const result = await handleExport(userId);
    // Split if too long for Telegram
    if (result.length > 4000) {
      const chunks = splitMessage(result, 4000);
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    } else {
      await ctx.reply(result, { parse_mode: 'Markdown' });
    }
  });

  bot.command('dashboard', async (ctx) => {
    const userId = ctx.from.id;
    const result = await handleDashboard(userId.toString());
    await ctx.reply(result);
  });

  bot.command('migrate', async (ctx) => {
    const userId = ctx.from.id;
    const result = await handleMigrateCompanies(userId.toString());
    await ctx.reply(result);
  });

  bot.command('sync', async (ctx) => {
    const result = await handleSync();
    await ctx.reply(result);
  });

  bot.command('enrich', async (ctx) => {
    await ctx.reply('🔄 正在丰富联系人资料，请稍候...');
    const result = await handleEnrich();
    await ctx.reply(result);
  });

  bot.command('newsflow', async (ctx) => {
    await ctx.reply('📰 正在生成 Newsflow，请稍候...');
    try {
      const result = await runNewsflow();
      if (result.success) {
        await ctx.reply(
          `✅ Newsflow 推送完成！\n\n` +
          `📊 统计:\n` +
          `• 公司: ${result.stats.companiesSearched}\n` +
          `• 找到文章: ${result.stats.articlesFound}\n` +
          `• 匹配人员: ${result.stats.peopleMatched}\n\n` +
          `📁 已归档到 Obsidian`
        );
      } else {
        await ctx.reply(`❌ Newsflow 失败: ${result.error}`);
      }
    } catch (err) {
      console.error('[Newsflow Error]', err);
      await ctx.reply('❌ Newsflow 执行出错，请检查日志。');
    }
  });

  bot.command('delete', async (ctx) => {
    const query = ctx.message.text.replace(/^\/delete\s*/, '').trim();
    const userId = ctx.from.id;
    if (!query) {
      await ctx.reply(
        '用法: /delete <联系人姓名>\n\n' +
        '例如:\n' +
        '• /delete 王一开\n' +
        '• /delete 李四\n\n' +
        '⚠️ 这将同时从数据库和 Vault 中删除该联系人。'
      );
      return;
    }
    try {
      await ctx.sendChatAction('typing');
      const result = await handleDeleteContact(query, userId.toString());
      await ctx.reply(result, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[Delete Error]', err);
      await ctx.reply('Delete failed. Please try again.');
    }
  });

  // Inline button callbacks
  bot.action('confirm_yes', async (ctx) => {
    const userId = ctx.from.id;
    const pending = getPendingAction(userId);
    if (!pending) {
      await ctx.answerCbQuery('No pending action.');
      return;
    }
    await ctx.answerCbQuery('Processing...');
    // Remove buttons from the message
    await ctx.editMessageReplyMarkup(undefined);
    try {
      const result = await confirmPendingAction(userId);
      await sendReply(ctx, result);
    } catch (err) {
      console.error('[Confirm Error]', err);
      await ctx.reply('An error occurred. Please try again.');
    }
  });

  bot.action('confirm_no', async (ctx) => {
    const userId = ctx.from.id;
    clearPendingAction(userId);
    await ctx.answerCbQuery('Cancelled.');
    // Remove buttons and add cancelled text
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply('❌ 已取消。\n\n请告诉我你想怎么做，比如：\n• 重新整理这份 transcript\n• 修改某个信息\n• 或者其他需求');
  });

  // Transcript confirmation handlers (确认/否)
  bot.action('transcript_confirm_yes', async (ctx) => {
    const userId = ctx.from.id;
    const pending = pendingActions.get(userId);
    
    await ctx.answerCbQuery('确认中...');
    await ctx.editMessageReplyMarkup(undefined);
    
    if (!pending || pending.type !== 'transcript_confirm_pending') {
      await ctx.reply('超时了，请重新发送 transcript。');
      return;
    }
    
    const confirmData = pending.data as { confirmedNames: string[]; transcriptData: { content: string; fileName: string; caption: string; extractedDate?: string } };
    
    // User confirmed - use the first matched name
    const contactName = confirmData.confirmedNames[0];
    const result = await processTranscriptWithContact(
      confirmData.transcriptData.content,
      confirmData.transcriptData.fileName,
      confirmData.transcriptData.caption,
      contactName,
      userId,
      confirmData.transcriptData.extractedDate
    );
    
    const hasPending = !!getPendingAction(userId);
    await sendReply(ctx, result, hasPending);
  });

  bot.action('transcript_confirm_no', async (ctx) => {
    const userId = ctx.from.id;
    const pending = pendingActions.get(userId);
    
    await ctx.answerCbQuery('好的，请重新输入');
    await ctx.editMessageReplyMarkup(undefined);
    
    if (!pending || pending.type !== 'transcript_confirm_pending') {
      await ctx.reply('超时了，请重新发送 transcript。');
      return;
    }
    
    const confirmData = pending.data as { confirmedNames: string[]; transcriptData: { content: string; fileName: string; caption: string } };

    // User said "否" - ask them to re-enter the contact name
    pendingActions.set(userId, {
      type: 'transcript_contact_pending',
      data: confirmData.transcriptData,
      originalText: confirmData.transcriptData.content, // Reset so next input is treated as new description
      previewText: '请重新输入联系人姓名：'
    });

    await ctx.reply('好的，请重新告诉我联系人姓名。');
  });

  // New contact + transcript confirmation handlers
  bot.action('new_contact_transcript_yes', async (ctx) => {
    const userId = ctx.from.id;
    const pending = pendingActions.get(userId);
    
    await ctx.answerCbQuery('确认中...');
    await ctx.editMessageReplyMarkup(undefined);
    
    if (!pending || pending.type !== 'transcript_new_contact_confirm') {
      await ctx.reply('超时了，请重新发送 transcript。');
      return;
    }
    
    const confirmData = pending.data as { personData: PersonData; conversationData: ConversationData };
    
    // Execute the creation
    const result = await executeNewContactWithTranscript(confirmData.personData, confirmData.conversationData, userId.toString());

    pendingActions.delete(userId);
    await ctx.reply(result);
  });

  bot.action('new_contact_transcript_no', async (ctx) => {
    const userId = ctx.from.id;
    const pending = pendingActions.get(userId);

    await ctx.answerCbQuery('好的');
    await ctx.editMessageReplyMarkup(undefined);

    if (!pending || pending.type !== 'transcript_new_contact_confirm') {
      pendingActions.delete(userId);
      await ctx.reply('已取消。');
      return;
    }

    const confirmData = pending.data as { personData: PersonData; conversationData: ConversationData };

    // Keep transcript data and go back to transcript_contact_pending state
    // so user can provide corrected description
    const transcriptContent = confirmData.conversationData.raw_transcript || '';
    pendingActions.set(userId, {
      type: 'transcript_contact_pending',
      data: {
        content: transcriptContent,
        fileName: '',
        caption: '',
        extractedDate: confirmData.conversationData.date
      },
      originalText: transcriptContent, // Reset so next input is treated as new description
      previewText: '请告诉我需要修改哪些信息'
    });

    await ctx.reply('好的，请重新描述这位联系人的信息，比如：\n• 姓名、公司、职位\n• 其他背景信息\n\n我会重新整理。');
  });

  // Text messages
  bot.on(message('text'), async (ctx) => {
    const text = ctx.message.text;
    if (!text || text.startsWith('/')) return;

    const userId = ctx.from.id;
    console.log(`[Message] From ${userId}: ${text.slice(0, 50)}...`);

    try {
      // Check if user has a pending Y/N confirmation
      const pending = getPendingAction(userId);
      if (pending && (pending.type === 'new_contact' || pending.type === 'log_conversation' || pending.type === 'transcript' || pending.type === 'update_entity' || pending.type === 'enrich_contact')) {
        const lower = text.trim().toLowerCase();
        if (lower === 'y' || lower === 'yes' || lower === '是' || lower === '确认') {
          await ctx.sendChatAction('typing');
          const result = await confirmPendingAction(userId);
          await sendReply(ctx, result);
          return;
        } else if (lower === 'n' || lower === 'no' || lower === '否' || lower === '取消') {
          clearPendingAction(userId);
          await ctx.reply('❌ 已取消。\n\n请告诉我你想怎么做，比如重新整理或补充信息。');
          return;
        }
        // For Y/N pending types, if neither Y nor N, clear and continue as new message
        clearPendingAction(userId);
      }

      await ctx.sendChatAction('typing');
      const result = await handleMessage(text, userId);
      
      // Check if this is a transcript confirmation request
      if (result.startsWith('TRANSCRIPT_CONFIRM__')) {
        const dataJson = result.replace('TRANSCRIPT_CONFIRM__', '');
        const data = JSON.parse(dataJson);
        
        // Support both old format (just matches) and new format (matches + date)
        const matches = data.matches || data;
        const date = data.date;
        
        // Build the confirmation message with matched contacts
        let confirmText = '';
        if (date) {
          confirmText += `📅 **日期:** ${date}\n\n`;
        }
        confirmText += '我找到了以下联系人：\n';
        for (const m of matches) {
          confirmText += `• ${m.name}\n`;
        }
        confirmText += '\n请确认是否是这几个人？';
        
        // Send with confirmation buttons
        const buttons = [
          [Markup.button.callback('确认', 'transcript_confirm_yes')],
          [Markup.button.callback('否', 'transcript_confirm_no')]
        ];
        
        await ctx.reply(confirmText, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        });
        return;
      }
      
      // Check if this is a new contact + transcript confirmation request
      if (result.startsWith('NEW_CONTACT_TRANSCRIPT__')) {
        const previewText = result.replace('NEW_CONTACT_TRANSCRIPT__', '');
        
        // Send with confirmation buttons
        const buttons = [
          [Markup.button.callback('确认', 'new_contact_transcript_yes')],
          [Markup.button.callback('否', 'new_contact_transcript_no')]
        ];
        
        await ctx.reply(previewText, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons }
        });
        return;
      }
      
      const hasPending = !!getPendingAction(userId);
      
      // Don't show confirm buttons when asking for contact name
      const isAskingForContact = result.includes('这是和谁的聊天');
      await sendReply(ctx, result, hasPending && !isAskingForContact);
    } catch (err) {
      console.error('[Handler Error]', err);
      await ctx.reply('An error occurred processing your message. Please try again.');
    }
  });

  // Document/file messages (transcripts)
  bot.on(message('document'), async (ctx) => {
    const doc = ctx.message.document;
    const caption = ctx.message.caption || '';
    const userId = ctx.from.id;

    console.log(`[Document] From ${userId}: ${doc.file_name} (${doc.mime_type})`);

    // Only accept text-like files
    const allowedTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/octet-stream'];
    const textExts = ['.txt', '.md', '.csv', '.text', '.log'];
    const fileName = doc.file_name || '';
    const dotIdx = fileName.lastIndexOf('.');
    const ext = dotIdx >= 0 ? fileName.substring(dotIdx).toLowerCase() : '';
    const isTextFile = allowedTypes.includes(doc.mime_type || '') || textExts.includes(ext);

    if (!isTextFile) {
      await ctx.reply('I can only process text files (.txt, .md). Please send the transcript as a text file.');
      return;
    }

    try {
      await ctx.sendChatAction('typing');

      // Get file URL via Telegram API
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const fileUrl = fileLink.href;

      // Download file content
      const content = await downloadFile(fileUrl, config.telegram.proxy);

      if (!content || content.trim().length === 0) {
        await ctx.reply('The file appears to be empty.');
        return;
      }

      console.log(`[Document] Downloaded ${content.length} chars from ${fileName}`);

      // Process as transcript
      const result = await handleTranscript(content, caption, fileName, userId);
      const hasPending = !!getPendingAction(userId);
      // Don't show confirm buttons when asking for contact name
      const isAskingForContact = result.includes('这是和谁的聊天');
      await sendReply(ctx, result, hasPending && !isAskingForContact);
    } catch (err) {
      console.error('[Document Error]', err);
      await ctx.reply('Failed to process the file. Please try again.');
    }
  });

  // Error handler
  bot.catch((err: unknown, ctx: Context) => {
    console.error('[Bot Error]', err);
  });

  // Register command menu for Telegram input field
  bot.telegram.setMyCommands([
    { command: 'start', description: '显示帮助信息' },
    { command: 'brainstorm', description: '查找相关人脉' },
    { command: 'delete', description: '删除联系人' },
    { command: 'status', description: '系统概览' },
    { command: 'pending', description: '待办事项' },
    { command: 'followup', description: '到期跟进' },
    { command: 'dashboard', description: '生成数据看板' },
    { command: 'migrate', description: '迁移公司数据' },
    { command: 'sync', description: '同步 Obsidian 到 SQL' },
    { command: 'enrich', description: 'AI 丰富联系人资料' },
    { command: 'newsflow', description: '生成新闻推送' },
    { command: 'clear', description: '清空对话上下文' },
    { command: 'export', description: '导出联系人索引' },
  ]).catch(err => console.error('[Bot] Failed to set command menu:', err));

  return bot;
}

async function sendReply(ctx: Context, text: string, withButtons: boolean = false): Promise<void> {
  // Strip <think>...</think> blocks from AI model output
  let stripped = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trimStart();

  // Strip the text-based confirmation prompt since we use buttons
  const cleanText = withButtons
    ? stripped.replace(/\n*Reply \*\*Y\*\*.*confirm.*cancel\./i, '').replace(/\n*回复.*确认.*取消.*/i, '').replace(/\n*确认修改？$/i, '').trimEnd()
    : stripped;

  try {
    if (cleanText.length > 4000) {
      const chunks = splitMessage(cleanText, 4000);
      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        if (isLast && withButtons) {
          await ctx.reply(chunks[i], { parse_mode: 'Markdown', ...confirmKeyboard });
        } else {
          await ctx.reply(chunks[i], { parse_mode: 'Markdown' });
        }
      }
    } else if (withButtons) {
      await ctx.reply(cleanText, { parse_mode: 'Markdown', ...confirmKeyboard });
    } else {
      await ctx.reply(cleanText, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    // Markdown parsing failed (unbalanced *, _, etc.) — fall back to plain text
    console.error('[sendReply] Markdown parse failed, falling back to plain text:', (err as Error).message);
    try {
      if (withButtons) {
        await ctx.reply(cleanText, { ...confirmKeyboard });
      } else {
        await ctx.reply(cleanText);
      }
    } catch (err2) {
      console.error('[sendReply] Plain text also failed:', err2);
    }
  }
}

function downloadFile(url: string, proxy?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
    };

    if (proxy) {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      options.agent = new HttpsProxyAgent(proxy);
    }

    const req = https.request(options, (res) => {
      const statusCode = res.statusCode || 0;
      if (statusCode < 200 || statusCode >= 300) {
        reject(new Error(`HTTP ${statusCode} downloading file`));
        res.resume(); // drain response
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve(buf.toString('utf-8'));
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Find last newline before maxLen
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt === -1) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}
