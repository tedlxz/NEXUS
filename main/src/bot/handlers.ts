import { vaultWriter } from '../vault/writer';
import { indexManager } from '../vault/index-manager';
import { actionItemsManager } from '../vault/action-items';
import { classifyIntent, IntentResult } from '../ai/intent';
import { parseProfile } from '../ai/profile';
import { summarizeConversation } from '../ai/conversation';
import { brainstorm } from '../ai/brainstorm';
import { resolveContactFuzzy, summarizeConversationHistory } from '../ai/query';
import { config, vaultPaths, ConversationData, PersonData } from '../config';
import { getDb } from '../db/database';
import { runMigrationIfNeeded } from '../db/migrate';
import { ConversationsRepo } from '../db/conversations-repo';
import { ContactsRepo } from '../db/contacts-repo';
import { extractKeywords } from '../db/search';
import { restartBot } from './restart';
import path from 'path';
import fs from 'fs/promises';

/** Refresh the Data Dashboard in the background (fire-and-forget) */
function refreshDashboard(): void {
  vaultWriter.saveDashboard().catch(err =>
    console.error('[Dashboard] Auto-refresh failed:', err)
  );
}

/** Refresh the Starred list in the background (fire-and-forget) */
function refreshStarredList(): void {
  vaultWriter.saveStarredList().catch(err =>
    console.error('[StarredList] Auto-refresh failed:', err)
  );
}

// Pending confirmations per user
interface PendingAction {
  type: 'new_contact' | 'log_conversation' | 'transcript' | 'transcript_contact_pending' | 'transcript_confirm_pending' | 'transcript_new_contact_confirm';
  data: PersonData | ConversationData | { content: string; fileName: string; caption: string; extractedDate?: string } | { matches: Array<{name: string; info: string}>; originalName: string; transcriptData: { content: string; fileName: string; caption: string; extractedDate?: string } } | { confirmedNames: string[]; transcriptData: { content: string; fileName: string; caption: string; extractedDate?: string } } | { personData: PersonData; conversationData: ConversationData };
  originalText: string;
  previewText: string;
}

// Extract date from filename (e.g., "2026-01-27 conversation with 张三.txt")
function extractDateFromFilename(fileName: string): string | undefined {
  // Match patterns like "2026-01-27", "2026_01_27", "20260127"
  const datePatterns = [
    /(\d{4})-(\d{1,2})-(\d{1,2})/,  // 2026-01-27
    /(\d{4})_(\d{1,2})_(\d{1,2})/,  // 2026_01_27
    /(\d{4})(\d{2})(\d{2})/,        // 20260127
  ];
  
  for (const pattern of datePatterns) {
    const match = fileName.match(pattern);
    if (match) {
      const [, year, month, day] = match;
      // Validate the date
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }
  return undefined;
}

const pendingActions = new Map<number, PendingAction>();

export { pendingActions };

export function getPendingAction(userId: number): PendingAction | undefined {
  return pendingActions.get(userId);
}

export function clearPendingAction(userId: number): void {
  pendingActions.delete(userId);
}

export async function confirmPendingAction(userId: number): Promise<string> {
  const pending = pendingActions.get(userId);
  if (!pending) return 'No pending action to confirm.';

  pendingActions.delete(userId);

  if (pending.type === 'new_contact') {
    return executeNewContact(pending.data as PersonData);
  } else if (pending.type === 'log_conversation' || pending.type === 'transcript') {
    return executeLogConversation(pending.data as ConversationData, pending.originalText);
  } else if (pending.type === 'transcript_contact_pending') {
    // This shouldn't happen - user should respond with contact name directly
    return '请告诉我联系人姓名。';
  }

  return 'Unknown action type.';
}

export async function handleMessage(text: string, userId: number): Promise<string> {
  // FIRST: Check if user is responding to a pending transcript (waiting for contact name)
  // This must be checked BEFORE intent classification
  const pending = pendingActions.get(userId);
  if (pending?.type === 'transcript_contact_pending') {
    const transcriptData = pending.data as { content: string; fileName: string; caption: string; extractedDate?: string };
    const contactInput = text.trim();

    // Check if user is responding to "create new contact?" prompt
    // When originalText differs from transcript content, we already received a contact description
    // and are waiting for 是/否 confirmation
    const isWaitingForNewContactConfirm = pending.originalText && pending.originalText !== transcriptData.content;

    if (isWaitingForNewContactConfirm) {
      const lower = contactInput.toLowerCase();
      if (lower === '是' || lower === 'yes' || lower === 'y' || lower === '对' || lower === '确认') {
        // User confirmed — create new contact from their description + save transcript
        const userDescription = pending.originalText;
        return await buildNewContactAndTranscriptPreview(userDescription, transcriptData, userId);
      }
      if (lower === '否' || lower === 'no' || lower === 'n' || lower === '不是' || lower === '取消') {
        // Reset to ask for contact info again
        pendingActions.set(userId, {
          type: 'transcript_contact_pending',
          data: transcriptData,
          originalText: transcriptData.content, // Reset so next input is treated as new description
          previewText: '请重新输入联系人信息'
        });
        return '好的，请重新告诉我联系人信息。';
      }
      // If neither 是 nor 否, treat as a new contact description — fall through to fuzzy matching below
    }

    // Use fuzzy matching to find potential contacts
    const allContacts = await indexManager.getAll();
    if (allContacts.length > 0) {
      const fuzzyMatches = await resolveContactFuzzy(contactInput, allContacts);

      // Filter matches with reasonable confidence (lowered threshold to show more options)
      const goodMatches = fuzzyMatches.filter(m => m.confidence >= 0.3).slice(0, 5);

      if (goodMatches.length >= 1) {
        // Always show matches and ask for confirmation (regardless of 1 or multiple matches)
        const matches = goodMatches.map(m => ({
          name: m.name,
          info: `${Math.round(m.confidence * 100)}% - ${m.reasoning?.slice(0, 30) || ''}`
        }));

        pendingActions.set(userId, {
          type: 'transcript_confirm_pending',
          data: {
            confirmedNames: matches.map(m => m.name),
            transcriptData
          },
          originalText: transcriptData.content,
          previewText: transcriptData.extractedDate
            ? `日期: ${transcriptData.extractedDate}\n\n我找到了以下联系人：\n${matches.map(m => `• ${m.name} (${m.info})`).join('\n')}`
            : `我找到了以下联系人：\n${matches.map(m => `• ${m.name} (${m.info})`).join('\n')}`
        });

        // Return special marker to tell telegram.ts to use confirmation buttons (include date if available)
        const confirmData = {
          matches,
          date: transcriptData.extractedDate
        };
        return "TRANSCRIPT_CONFIRM__" + JSON.stringify(confirmData);
      }
    }

    // No matches found — automatically proceed to create new contact + save transcript
    // Use the user's description to extract contact info via AI
    return await buildNewContactAndTranscriptPreview(contactInput, transcriptData, userId);
  }

  // THEN: Do intent classification for regular messages
  const intent = await classifyIntent(text);
  console.log(`[Intent] ${intent.intent} (${intent.confidence})`);

  if (intent.clarification_needed && intent.confidence < 0.5) {
    return `I'm not sure what you'd like to do. ${intent.clarification_needed}`;
  }

  // Check if user is confirming the matched contacts for transcript
  if (pending?.type === 'transcript_confirm_pending') {
    const confirmData = pending.data as { confirmedNames: string[]; transcriptData: { content: string; fileName: string; caption: string; extractedDate?: string } };
    
    const lower = text.trim().toLowerCase();
    
    // User clicked "确认" - proceed with the confirmed names
    if (lower === '确认' || lower === '是' || lower === 'yes' || lower === 'y' || lower === '对' || lower === '对的') {
      // Use the first confirmed name (or handle multiple if needed)
      const contactName = confirmData.confirmedNames[0];
      return processTranscriptWithContact(
        confirmData.transcriptData.content,
        confirmData.transcriptData.fileName,
        confirmData.transcriptData.caption,
        contactName,
        userId,
        confirmData.transcriptData.extractedDate
      );
    }
    
    // User clicked "否" - ask them to re-enter the contact name
    if (lower === '否' || lower === 'no' || lower === 'n' || lower === '不是' || lower === '不对') {
      pendingActions.set(userId, {
        type: 'transcript_contact_pending',
        data: confirmData.transcriptData,
        originalText: confirmData.transcriptData.content, // Reset so next input is treated as new description
        previewText: '请重新输入联系人姓名：'
      });
      return `好的，请重新告诉我联系人姓名。`;
    }
    
    // If user is trying to specify a different name, treat as new contact query
    return `请点击"确认"按钮确认联系人，或点击"否"重新输入姓名。`;
  }
  
  // Check if user is confirming new contact + transcript
  if (pending?.type === 'transcript_new_contact_confirm') {
    const confirmData = pending.data as { personData: PersonData; conversationData: ConversationData };
    const lower = text.trim().toLowerCase();
    
    if (lower === '确认' || lower === '是' || lower === 'yes' || lower === 'y' || lower === '对' || lower === '对的') {
      // User confirmed - create person AND save transcript
      pendingActions.delete(userId);
      return await executeNewContactWithTranscript(confirmData.personData, confirmData.conversationData);
    }
    
    if (lower === '否' || lower === 'no' || lower === 'n' || lower === '不是' || lower === '不对') {
      // Go back to transcript_contact_pending so user can provide corrected description
      const transcriptContent = confirmData.conversationData.raw_transcript || '';
      pendingActions.set(userId, {
        type: 'transcript_contact_pending',
        data: {
          content: transcriptContent,
          fileName: '',
          caption: '',
          extractedDate: confirmData.conversationData.date
        },
        originalText: transcriptContent,
        previewText: '请重新描述联系人信息'
      });
      return '好的，请重新描述这位联系人的信息，我会重新整理。';
    }

    return `请点击"确认"按钮确认，或点击"否"重新描述联系人信息。`;
  }

  switch (intent.intent) {
    case 'new_contact':
      return handleNewContact(text, intent, userId);
    case 'log_conversation':
      return handleLogConversation(text, intent, userId);
    case 'update_contact':
      return handleUpdateContact(text, intent, userId);
    case 'brainstorm':
      return handleBrainstorm(text, intent);
    case 'query':
      return handleQuery(text, intent);
    case 'action_item':
      return handleActionItem(text, intent);
    case 'daily_note':
    default:
      return handleChat(text);
  }
}

export async function handleTranscript(
  content: string,
  caption: string,
  fileName: string,
  userId: number
): Promise<string> {
  // First, check if contact name is provided in caption
  const captionContactMatch = caption?.match(/(?:with|和|跟|与)\s*([^\s]+)/i);
  let contactName = captionContactMatch ? captionContactMatch[1] : '';
  
  // Clean up contact name (remove punctuation)
  if (contactName) {
    contactName = contactName.replace(/[，。！？、；：""''（）【】]/g, '');
  }

  // Extract date from filename if present
  const extractedDate = extractDateFromFilename(fileName);

  // If no contact name found, ask the user first
  if (!contactName) {
    // Store transcript content for later processing
    pendingActions.set(userId, {
      type: 'transcript_contact_pending',
      data: { content, fileName, caption, extractedDate },
      originalText: content,
      previewText: extractedDate 
        ? `我收到了文件 "${fileName}"（日期: ${extractedDate}）。\n\n这是和谁的聊天？请告诉我联系人姓名。`
        : `我收到了文件 "${fileName}"。\n\n这是和谁的聊天？请告诉我联系人姓名。`,
    });
    
    return extractedDate
      ? `📄 我收到了文件 "${fileName}"（日期: **${extractedDate}**）。\n\n**这是和谁的聊天？请告诉我联系人姓名。**`
      : `📄 我收到了文件 "${fileName}"。\n\n**这是和谁的聊天？请告诉我联系人姓名。**`;
  }

  // If we have contact name, proceed with processing
  return processTranscriptWithContact(content, fileName, caption, contactName, userId, extractedDate);
}

export async function processTranscriptWithContact(
  content: string,
  fileName: string,
  caption: string,
  contactName: string,
  userId: number,
  extractedDate?: string
): Promise<string> {

  // Get existing profile for richer summary
  const existingContact = await indexManager.findByName(contactName);
  let profileContext: string | undefined;
  if (existingContact) {
    const fileContent = await vaultWriter.readFile(
      path.join(config.vault.path, existingContact.file)
    );
    if (fileContent) profileContext = fileContent;
  }

  // Summarize the full transcript
  const summary = await summarizeConversation(content, contactName, profileContext);

  const convData: ConversationData = {
    contact: contactName,
    date: extractedDate || summary.date || new Date().toISOString().slice(0, 10),
    source: summary.source || 'Other',
    location: summary.location,
    occasion: summary.occasion,
    initiated_by: summary.initiated_by,
    sentiment: summary.sentiment,
    relationship_signal: summary.relationship_signal,
    follow_up_date: summary.follow_up_date,
    follow_up_context: summary.follow_up_context,
    tags: summary.tags,
    ai_summary: summary.ai_summary,
    key_topics: summary.key_topics,
    core_insights: summary.core_insights,
    mentioned_companies: summary.mentioned_companies,
    mentioned_people: summary.mentioned_people,
    mentioned_deals: summary.mentioned_deals,
    action_items: summary.action_items,
    raw_transcript: content,
  };

  // Build preview
  let preview = `📄 Transcript file: **${fileName}**\n\n`;
  preview += `**Contact:** ${contactName}`;
  if (!existingContact) preview += ` (new contact — will be created)`;
  preview += `\n**Date:** ${convData.date}\n`;
  preview += `**Source:** ${convData.source}\n`;
  // Show company tags in preview (independent tag system)
  if (convData.company_tags?.length) {
    preview += `**Company Tags:** ${convData.company_tags.map(c => `#${c.replace(/\s+/g, '')}`).join(' ')}\n`;
  }
  if (convData.ai_summary) preview += `**Summary:** ${convData.ai_summary.slice(0, 200)}...\n`;
  if (convData.key_topics?.length) preview += `**Topics:** ${convData.key_topics.join(', ')}\n`;
  if (convData.action_items?.length) {
    preview += `**Action items:** ${convData.action_items.length}\n`;
    for (const item of convData.action_items) {
      preview += `  • ${item.description}\n`;
    }
  }
  preview += `\nSave this conversation under **${contactName}**? Reply **Y** to confirm or **N** to cancel.`;

  pendingActions.set(userId, {
    type: 'transcript',
    data: convData,
    originalText: content,
    previewText: preview,
  });

  return preview;
}

async function handleNewContact(text: string, intent: IntentResult, userId: number): Promise<string> {
  const name = (intent.extracted_data.name as string) || 'Unknown';
  if (name === 'Unknown') {
    return "I couldn't identify the person's name. Could you mention their name clearly?";
  }

  const existing = await indexManager.findByName(name);
  if (existing) {
    return `${name} already exists in your contacts. Did you mean to update their info? Just say something like "update ${name}: [new info]"`;
  }

  const profileData = await parseProfile(name, text);

  // Build preview and ask for confirmation
  let preview = `📋 I extracted the following contact info:\n\n`;
  preview += `**Name:** ${profileData.name}\n`;
  if (profileData.current_role) preview += `**Role:** ${profileData.current_role}\n`;
  if (profileData.current_org) preview += `**Org:** ${profileData.current_org}\n`;
  if (profileData.industries?.length) preview += `**Industries:** ${profileData.industries.join(', ')}\n`;
  if (profileData.closeness) preview += `**Closeness:** ${profileData.closeness}\n`;
  if (profileData.how_we_met) preview += `**How we met:** ${profileData.how_we_met}\n`;
  if (profileData.tags?.length) preview += `**Tags:** ${profileData.tags.join(', ')}\n`;
  if (profileData.profile) preview += `\n${profileData.profile}\n`;
  preview += `\nCreate this contact? Reply **Y** to confirm or **N** to cancel.`;

  pendingActions.set(userId, {
    type: 'new_contact',
    data: profileData,
    originalText: text,
    previewText: preview,
  });

  return preview;
}

async function executeNewContact(profileData: PersonData): Promise<string> {
  // Run migration if needed before creating contact
  const db = getDb();
  runMigrationIfNeeded(db);
  
  const filePath = await vaultWriter.createPerson(profileData);

  await indexManager.addOrUpdate({
    name: profileData.name,
    file: `People/${profileData.name}.md`,
    current_role: profileData.current_role,
    current_org: profileData.current_org,
    industries: profileData.industries,
    closeness: profileData.closeness,
    starred: profileData.starred,
    tags: profileData.tags,
  });

  const fileName = path.basename(filePath);
  let response = `✅ Created contact: **${profileData.name}**`;
  if (profileData.current_role) response += `\n📋 ${profileData.current_role}`;
  if (profileData.current_org) response += ` @ ${profileData.current_org}`;
  if (profileData.tags?.length) response += `\n🏷 ${profileData.tags.join(', ')}`;
  response += `\n📁 ${fileName}`;

  // Restart bot to sync database
  try {
    await restartBot();
    response += `\n🔄 Bot restarted and synced.`;
  } catch (err) {
    response += `\n⚠️ Contact saved but bot restart failed.`;
  }

  refreshDashboard();
  refreshStarredList();
  return response;
}

async function handleLogConversation(text: string, intent: IntentResult, userId: number): Promise<string> {
  const contactName = (intent.extracted_data.contact as string) ||
    (intent.extracted_data.name as string) || '';

  if (!contactName) {
    return "Who was this conversation with? Please mention the person's name.";
  }

  const existingContact = await indexManager.findByName(contactName);
  let profileContext: string | undefined;
  if (existingContact) {
    const content = await vaultWriter.readFile(
      path.join(process.cwd(), '..', existingContact.file)
    );
    if (content) profileContext = content;
  }

  const summary = await summarizeConversation(text, contactName, profileContext);

  const convData: ConversationData = {
    contact: contactName,
    date: summary.date || new Date().toISOString().slice(0, 10),
    source: summary.source || 'Other',
    location: summary.location,
    occasion: summary.occasion,
    initiated_by: summary.initiated_by,
    sentiment: summary.sentiment,
    relationship_signal: summary.relationship_signal,
    follow_up_date: summary.follow_up_date,
    follow_up_context: summary.follow_up_context,
    tags: summary.tags,
    ai_summary: summary.ai_summary,
    key_topics: summary.key_topics,
    core_insights: summary.core_insights,
    mentioned_companies: summary.mentioned_companies,
    mentioned_people: summary.mentioned_people,
    mentioned_deals: summary.mentioned_deals,
    action_items: summary.action_items,
    raw_transcript: text,
  };

  // Build preview
  let preview = `📋 Conversation summary:\n\n`;
  preview += `**Contact:** ${contactName}\n`;
  preview += `**Source:** ${convData.source}\n`;
  // Show company tags in preview (independent tag system)
  if (convData.company_tags?.length) {
    preview += `**Company Tags:** ${convData.company_tags.map(c => `#${c.replace(/\s+/g, '')}`).join(' ')}\n`;
  }
  if (convData.ai_summary) preview += `**Summary:** ${convData.ai_summary}\n`;
  if (convData.key_topics?.length) preview += `**Topics:** ${convData.key_topics.join(', ')}\n`;
  if (convData.action_items?.length) {
    preview += `**Action items:** ${convData.action_items.length}\n`;
    for (const item of convData.action_items) {
      preview += `  • ${item.description}\n`;
    }
  }
  if (!existingContact) {
    preview += `\n⚠️ ${contactName} is not in your contacts yet — will also create a new contact.\n`;
  }
  preview += `\nSave this conversation? Reply **Y** to confirm or **N** to cancel.`;

  pendingActions.set(userId, {
    type: 'log_conversation',
    data: convData,
    originalText: text,
    previewText: preview,
  });

  return preview;
}

async function executeLogConversation(convData: ConversationData, originalText: string): Promise<string> {
  const contactName = convData.contact;
  const filePath = await vaultWriter.createConversation(convData);
  const convFileName = path.basename(filePath, '.md');

  await vaultWriter.addConversationLink(contactName, filePath);

  const summaryLine = `${convData.date}: ${convData.ai_summary?.slice(0, 100) || 'Conversation logged'}...`;
  const existingContact = await indexManager.findByName(contactName);

  if (existingContact) {
    await indexManager.addConversationSummary(contactName, summaryLine);
  } else {
    const profileData = await parseProfile(contactName, originalText);
    await vaultWriter.createPerson(profileData);
    await indexManager.addOrUpdate({
      name: contactName,
      file: `People/${contactName}.md`,
      current_role: profileData.current_role,
      current_org: profileData.current_org,
      industries: profileData.industries,
      closeness: profileData.closeness,
      tags: profileData.tags,
      recent_conversations_summary: [summaryLine],
    });
  }

  // Store conversation metadata in SQLite for FTS search
  const contactId = await indexManager.getContactId(contactName);
  let convId: number | undefined;
  if (contactId) {
    const convRepo = new ConversationsRepo(getDb());
    convId = convRepo.insert({
      contact_id: contactId,
      date: convData.date,
      source: convData.source,
      location: convData.location,
      occasion: convData.occasion,
      initiated_by: convData.initiated_by,
      sentiment: convData.sentiment,
      relationship_signal: convData.relationship_signal,
      follow_up_date: convData.follow_up_date,
      follow_up_context: convData.follow_up_context,
      ai_summary: convData.ai_summary,
      key_topics: JSON.stringify(convData.key_topics || []),
      core_insights: convData.core_insights,
      mentioned_companies: JSON.stringify(convData.mentioned_companies || []),
      mentioned_people: JSON.stringify(convData.mentioned_people || []),
      mentioned_deals: JSON.stringify(convData.mentioned_deals || []),
      file: `Conversations/${convFileName}.md`,
    }, contactName);
  }
  
  // Store company tags for this conversation and update company files
  if (convId && convData.company_tags && convData.company_tags.length > 0) {
    const { CompaniesRepo } = await import('../db/companies-repo');
    const companiesRepo = new CompaniesRepo(getDb());
    companiesRepo.addConversationCompaniesByNames(convId, convData.company_tags);
    
    // Update company files in Obsidian
    for (const companyName of convData.company_tags) {
      await vaultWriter.addConversationToCompany(
        companyName,
        convData.date,
        contactName,
        convData.ai_summary || ''
      );
    }
  }
  
  // Also update company file if contact has current_org
  if (existingContact?.current_org) {
    await vaultWriter.addConversationToCompany(
      existingContact.current_org,
      convData.date,
      contactName,
      convData.ai_summary || ''
    );
  }

  if (convData.action_items?.length) {
    for (const item of convData.action_items) {
      await actionItemsManager.add({
        description: item.description,
        owner: item.owner,
        due_date: item.due_date,
        source_conversation: `Conversations/${convFileName}.md`,
        contact: contactName,
      });
    }
  }

  let response = `✅ Conversation with **${contactName}** logged`;
  if (convData.source !== 'Other') response += ` (${convData.source})`;
  if (convData.key_topics?.length) {
    response += `\n📌 Topics: ${convData.key_topics.slice(0, 3).join(', ')}`;
  }
  if (convData.action_items?.length) {
    response += `\n📋 ${convData.action_items.length} action item(s) tracked`;
  }
  if (convData.follow_up_date) {
    response += `\n📅 Follow-up: ${convData.follow_up_date}`;
  }
  
  // Link contact to company if current_org is specified
  if (contactId && existingContact?.current_org) {
    try {
      const { CompaniesRepo } = await import('../db/companies-repo');
      const companiesRepo = new CompaniesRepo(getDb());
      const companyId = companiesRepo.findOrCreateCompany(existingContact.current_org);
      companiesRepo.setContactCompany(contactId, companyId, 'current');
      response += `\n🏢 Linked to company: ${existingContact.current_org}`;
    } catch (err) {
      console.error('[Company Link Error]', err);
    }
  }
  
  response += `\n📁 ${path.basename(filePath)}`;

  refreshDashboard();
  refreshStarredList();
  return response;
}

/**
 * Build preview for new contact + transcript, then ask for confirmation
 * This shows user both the new person info AND transcript summary before final confirmation
 */
async function buildNewContactAndTranscriptPreview(
  userDescription: string,
  transcriptData: { content: string; fileName: string; caption: string; extractedDate?: string },
  userId: number
): Promise<string> {
  try {
    // Step 1: Extract contact info from description
    const profileData = await parseProfile('', userDescription);
    
    if (!profileData.name) {
      return `❌ 无法从描述中提取联系人姓名。请直接告诉我姓名。`;
    }
    
    // Step 2: Summarize the transcript
    const summary = await summarizeConversation(transcriptData.content, profileData.name, undefined);
    
    // Build preview showing both person info AND transcript
    let preview = `📋 **新联系人 + 对话归档**\n\n`;
    preview += `**联系人:** ${profileData.name}\n`;
    if (profileData.current_role) preview += `**职位:** ${profileData.current_role}\n`;
    if (profileData.current_org) preview += `**公司:** ${profileData.current_org}\n`;
    if (profileData.industries?.length) preview += `**行业:** ${profileData.industries.join(', ')}\n`;
    preview += `\n---\n`;
    preview += `**对话日期:** ${transcriptData.extractedDate || new Date().toISOString().slice(0, 10)}\n`;
    preview += `**来源:** ${summary.source || 'Other'}\n`;
    if (summary.ai_summary) preview += `**摘要:** ${summary.ai_summary.slice(150)}...\n`;
    if (summary.key_topics?.length) preview += `**主题:** ${summary.key_topics.join(', ')}\n`;
    preview += `\n确认创建并归档这个对话吗？`;
    
    // Store both person data and conversation data for final confirmation
    pendingActions.set(userId, {
      type: 'transcript_new_contact_confirm',
      data: {
        personData: profileData,
        conversationData: {
          contact: profileData.name,
          date: transcriptData.extractedDate || new Date().toISOString().slice(0, 10),
          source: summary.source || 'Other',
          tags: summary.tags,
          company_tags: summary.company_tags,
          ai_summary: summary.ai_summary,
          key_topics: summary.key_topics,
          core_insights: summary.core_insights,
          mentioned_companies: summary.mentioned_companies,
          mentioned_people: summary.mentioned_people,
          mentioned_deals: summary.mentioned_deals,
          action_items: summary.action_items,
          raw_transcript: transcriptData.content,
        }
      },
      originalText: transcriptData.content,
      previewText: preview,
    });
    
    // Return special marker for confirmation buttons
    return "NEW_CONTACT_TRANSCRIPT__" + preview;
    
  } catch (err) {
    console.error('[Preview Error]', err);
    return `❌ 处理失败: ${err}`;
  }
}

/**
 * Create a new contact from user's description AND save the transcript in one go
 * This handles cases like: "阳光电源的钱进总，他是集团海外投资投融资的负责人"
 */
async function createContactAndSaveTranscript(
  userDescription: string,
  transcriptData: { content: string; fileName: string; caption: string; extractedDate?: string },
  userId: number
): Promise<string> {
  try {
    // Run migration if needed
    const db = getDb();
    runMigrationIfNeeded(db);
    
    // Step 1: Extract contact info from user's description using AI
    const profileData = await parseProfile('', userDescription);
    
    if (!profileData.name) {
      return `❌ 无法从描述中提取联系人姓名。请直接告诉我姓名。`;
    }
    
    // Step 2: Create the person file
    const filePath = await vaultWriter.createPerson(profileData);
    
    // Step 3: Add to index
    await indexManager.addOrUpdate({
      name: profileData.name,
      file: `People/${profileData.name}.md`,
      current_role: profileData.current_role,
      current_org: profileData.current_org,
      industries: profileData.industries,
      closeness: profileData.closeness,
      starred: profileData.starred,
      tags: profileData.tags,
    });

    // Step 4: Save the transcript as a conversation
    const contactName = profileData.name;
    let profileContext: string | undefined;
    const existingContact = await indexManager.findByName(contactName);
    if (existingContact) {
      const fileContent = await vaultWriter.readFile(
        path.join(config.vault.path, existingContact.file)
      );
      if (fileContent) profileContext = fileContent;
    }
    
    // Summarize the transcript
    const summary = await summarizeConversation(transcriptData.content, contactName, profileContext);
    
    const convData: ConversationData = {
      contact: contactName,
      date: transcriptData.extractedDate || new Date().toISOString().slice(0, 10),
      source: summary.source || 'Other',
      location: summary.location,
      occasion: summary.occasion,
      initiated_by: summary.initiated_by,
      sentiment: summary.sentiment,
      relationship_signal: summary.relationship_signal,
      follow_up_date: summary.follow_up_date,
      follow_up_context: summary.follow_up_context,
      tags: summary.tags,
      company_tags: summary.company_tags,
      ai_summary: summary.ai_summary,
      key_topics: summary.key_topics,
      core_insights: summary.core_insights,
      mentioned_companies: summary.mentioned_companies,
      mentioned_people: summary.mentioned_people,
      mentioned_deals: summary.mentioned_deals,
      action_items: summary.action_items,
      raw_transcript: transcriptData.content,
    };
    
    // Save the conversation
    await executeLogConversation(convData, transcriptData.content);
    
    // Step 5: Restart bot to sync
    try {
      await restartBot();
    } catch (err) {
      console.error('[Create Contact] Bot restart failed:', err);
    }
    
    let response = `✅ 新联系人 **${contactName}** 已创建并保存对话！\n\n`;
    if (profileData.current_role) response += `📋 ${profileData.current_role}`;
    if (profileData.current_org) response += ` @ ${profileData.current_org}`;
    response += '\n';
    if (summary.ai_summary) {
      response += `\n📝 Summary: ${summary.ai_summary.slice(100)}...`;
    }
    
    return response;
    
  } catch (err) {
    console.error('[Create Contact] Error:', err);
    return `❌ 创建联系人失败: ${err}`;
  }
}

/**
 * Execute the final creation: create person + save transcript (after user confirms)
 */
export async function executeNewContactWithTranscript(
  personData: PersonData,
  conversationData: ConversationData
): Promise<string> {
  try {
    // Run migration if needed
    const db = getDb();
    runMigrationIfNeeded(db);
    
    // Step 1: Create person file
    const filePath = await vaultWriter.createPerson(personData);
    
    // Step 2: Add to index
    await indexManager.addOrUpdate({
      name: personData.name,
      file: `People/${personData.name}.md`,
      current_role: personData.current_role,
      current_org: personData.current_org,
      industries: personData.industries,
      closeness: personData.closeness,
      starred: personData.starred,
      tags: personData.tags,
    });

    // Step 3: Save conversation/transcript
    await executeLogConversation(conversationData, conversationData.raw_transcript || '');
    
    // Step 4: Restart bot to sync
    try {
      await restartBot();
    } catch (err) {
      console.error('[Create Contact] Bot restart failed:', err);
    }
    
    let response = `✅ 新联系人 **${personData.name}** 已创建并归档对话！\n\n`;
    if (personData.current_role) response += `📋 ${personData.current_role}`;
    if (personData.current_org) response += ` @ ${personData.current_org}`;
    response += '\n';
    if (conversationData.ai_summary) {
      response += `\n📝 对话摘要: ${conversationData.ai_summary.slice(100)}...`;
    }

    refreshDashboard();
    return response;

  } catch (err) {
    console.error('[Execute New Contact] Error:', err);
    return `❌ 创建失败: ${err}`;
  }
}

async function handleUpdateContact(text: string, intent: IntentResult, userId: number): Promise<string> {
  const name = (intent.extracted_data.name as string) || '';
  if (!name) {
    return "Which contact do you want to update? Please mention their name.";
  }

  const isCompany = intent.extracted_data.is_company === true;

  // Handle company updates (e.g. starring a company)
  if (isCompany) {
    const { CompaniesRepo } = await import('../db/companies-repo');
    const companiesRepo = new CompaniesRepo(getDb());
    const existingCompany = companiesRepo.findByName(name);
    if (!existingCompany) {
      return `I don't have a company named "${name}".`;
    }

    const starred = intent.extracted_data.starred as boolean | undefined;
    if (starred !== undefined) {
      companiesRepo.upsertCompany({ ...existingCompany, starred }, existingCompany.tags);

      // Update Obsidian file frontmatter
      const safeName = name.replace(/[<>:"/\\|?*]/g, ' ');
      const filePath = path.join(vaultPaths.companies, `${safeName}.md`);
      try {
        const matter = await import('gray-matter');
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = matter.default(raw);
        parsed.data.starred = starred;
        parsed.data.updated = new Date().toISOString().slice(0, 10);
        const newContent = matter.default.stringify(parsed.content, parsed.data);
        await fs.writeFile(filePath, newContent, 'utf-8');
      } catch (err) {
        console.error(`[Update Company] Error updating file:`, err);
      }
    }

    let response = starred
      ? `✅ **${name}** 已设为特别关注。`
      : `✅ **${name}** 已取消特别关注。`;

    refreshDashboard();
    refreshStarredList();
    return response;
  }

  const existing = await indexManager.findByName(name);
  if (!existing) {
    return `I don't have a contact named "${name}". Would you like to create a new contact instead?`;
  }

  const profileData = await parseProfile(name, text);
  await vaultWriter.updatePerson(name, profileData);

  await indexManager.addOrUpdate({
    name: profileData.name || name,
    file: existing.file,
    current_role: profileData.current_role || existing.current_role,
    current_org: profileData.current_org || existing.current_org,
    industries: profileData.industries || existing.industries,
    closeness: profileData.closeness || existing.closeness,
    starred: profileData.starred !== undefined ? profileData.starred : existing.starred,
    tags: profileData.tags || existing.tags,
  });

  let response = `✅ Updated **${name}**'s profile.`;

  // Restart bot to sync database
  try {
    await restartBot();
    response += ` Bot restarted and synced.`;
  } catch (err) {
    response += ` ⚠️ Update saved but bot restart failed.`;
  }

  refreshDashboard();
  refreshStarredList();
  return response;
}

export async function handleBrainstormCommand(query: string): Promise<string> {
  return runBrainstorm(query, query);
}

async function handleBrainstorm(text: string, intent: IntentResult): Promise<string> {
  const topic = (intent.extracted_data.topic as string) || text;
  const description = (intent.extracted_data.description as string) || text;
  return runBrainstorm(topic, description);
}

async function runBrainstorm(topic: string, description: string): Promise<string> {
  const keywords = extractKeywords(`${topic} ${description}`);
  const contactIndex = await indexManager.getIndexForAI({
    topic,
    keywords,
    limit: 30,
  });
  const result = await brainstorm(topic, description, contactIndex);

  await vaultWriter.createResearch({
    topic,
    description,
    related_contacts: result.related_contacts_markdown,
    expansion_suggestions: result.expansion_suggestions,
  });

  let response = `🔍 Research: **${topic}**\n`;
  if (result.recommendations.length > 0) {
    response += '\nRelevant contacts:\n';
    for (const rec of result.recommendations.slice(0, 5)) {
      const score = Math.round(rec.relevance_score * 100);
      response += `• **${rec.name}** (${score}%) — ${rec.reasoning.slice(0, 80)}\n`;
    }
  } else {
    response += '\nNo directly relevant contacts found in your network.';
  }
  if (result.expansion_suggestions) {
    response += `\n💡 See Research/${topic}.md for expansion suggestions.`;
  }

  return response;
}

async function handleQuery(text: string, intent: IntentResult): Promise<string> {
  const contactRef = (intent.extracted_data.contact_ref as string) ||
    (intent.extracted_data.name as string) || '';
  const topic = (intent.extracted_data.topic as string) || '';
  const queryType = (intent.extracted_data.query_type as string) || 'contact_info';

  // Step 1: Resolve the contact (fuzzy AI matching)
  const resolvedContact = await resolveContact(contactRef || text);

  if (!resolvedContact) {
    // No contact reference — do a general search
    const searchTerm = contactRef || topic || text;
    const matches = await indexManager.search(searchTerm);
    if (matches.length === 0) {
      return `No contacts found matching your query.`;
    }
    let response = `Found ${matches.length} contact(s):\n`;
    for (const m of matches.slice(0, 10)) {
      response += `• **${m.name}**`;
      if (m.current_role) response += ` — ${m.current_role}`;
      if (m.current_org) response += ` @ ${m.current_org}`;
      response += '\n';
    }
    return response;
  }

  // Step 2: If asking about conversation history, search and summarize
  if (queryType === 'conversation_history' || topic) {
    return handleConversationQuery(resolvedContact, topic || text, text);
  }

  // Step 3: Simple contact info query
  const contact = resolvedContact;
  let response = `**${contact.name}**`;
  if (contact.current_role) response += `\n📋 ${contact.current_role}`;
  if (contact.current_org) response += ` @ ${contact.current_org}`;
  if (contact.industries?.length) response += `\n🏭 ${contact.industries.join(', ')}`;
  if (contact.closeness) response += `\n🤝 Closeness: ${contact.closeness}`;
  if (contact.last_contact) response += `\n📅 Last contact: ${contact.last_contact}`;
  if (contact.tags?.length) response += `\n🏷 ${contact.tags.join(', ')}`;
  if (contact.recent_conversations_summary?.length) {
    response += '\n\nRecent conversations:';
    for (const s of contact.recent_conversations_summary.slice(0, 3)) {
      response += `\n• ${s}`;
    }
  }
  return response;
}

/** Resolve a vague contact reference to an actual contact entry */
async function resolveContact(reference: string): Promise<ReturnType<typeof indexManager.findByName> extends Promise<infer T> ? T : never> {
  if (!reference) return undefined;

  // Try exact match first
  const exact = await indexManager.findByName(reference);
  if (exact) return exact;

  // Try FTS search
  const searchResults = await indexManager.search(reference);
  if (searchResults.length === 1) return searchResults[0];

  // Use AI fuzzy matching
  const allContacts = await indexManager.getAll();
  if (allContacts.length === 0) return undefined;

  const fuzzyMatches = await resolveContactFuzzy(reference, allContacts);
  if (fuzzyMatches.length > 0 && fuzzyMatches[0].confidence >= 0.6) {
    const matched = await indexManager.findByName(fuzzyMatches[0].name);
    if (matched) {
      console.log(`[Fuzzy] "${reference}" → ${matched.name} (${fuzzyMatches[0].confidence}, ${fuzzyMatches[0].reasoning})`);
      return matched;
    }
  }

  // If FTS had multiple results, return the first as best guess
  if (searchResults.length > 0) return searchResults[0];

  return undefined;
}

/** Search conversation history and summarize with AI */
async function handleConversationQuery(
  contact: NonNullable<Awaited<ReturnType<typeof indexManager.findByName>>>,
  topic: string,
  originalQuery: string
): Promise<string> {
  // Gather all conversation content for this contact
  const conversationContents: { date: string; content: string }[] = [];

  // 1. Get conversation files from vault
  const convDir = path.join(config.vault.path, 'Conversations');
  try {
    const files = await fs.readdir(convDir);
    const contactFiles = files.filter(f =>
      f.includes(contact.name) && f.endsWith('.md')
    );

    for (const file of contactFiles) {
      const content = await fs.readFile(path.join(convDir, file), 'utf-8');
      const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? dateMatch[1] : 'unknown';
      conversationContents.push({ date, content });
    }
  } catch { /* no conversations dir yet */ }

  // 2. Get raw transcripts from vault
  const rawDir = path.join(config.vault.path, '_raw');
  try {
    const files = await fs.readdir(rawDir);
    const contactFiles = files.filter(f =>
      f.includes(contact.name) && (f.endsWith('.txt') || f.endsWith('.md'))
    );

    for (const file of contactFiles) {
      const content = await fs.readFile(path.join(rawDir, file), 'utf-8');
      const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? dateMatch[1] : 'unknown';
      // Check if we already have this date from conversation files
      if (!conversationContents.some(c => c.date === date)) {
        conversationContents.push({ date, content: `[Raw Transcript]\n${content}` });
      } else {
        // Append raw transcript to existing entry
        const existing = conversationContents.find(c => c.date === date);
        if (existing) {
          existing.content += `\n\n[Raw Transcript]\n${content}`;
        }
      }
    }
  } catch { /* no raw dir yet */ }

  // 3. Also check SQLite conversation metadata
  const contactId = await indexManager.getContactId(contact.name);
  if (contactId) {
    const convRepo = new ConversationsRepo(getDb());
    const dbConvs = convRepo.getByContact(contactId);
    for (const conv of dbConvs) {
      if (!conversationContents.some(c => c.date === conv.date)) {
        let content = '';
        if (conv.ai_summary) content += `Summary: ${conv.ai_summary}\n`;
        if (conv.key_topics) content += `Topics: ${conv.key_topics}\n`;
        if (conv.core_insights) content += `Insights: ${conv.core_insights}\n`;
        if (content) {
          conversationContents.push({ date: conv.date, content });
        }
      }
    }
  }

  if (conversationContents.length === 0) {
    return `No conversation records found with **${contact.name}**. Start by logging a conversation or sending a transcript.`;
  }

  // Sort by date
  conversationContents.sort((a, b) => a.date.localeCompare(b.date));

  // Get contact profile for context
  const profileContent = await vaultWriter.readFile(
    path.join(config.vault.path, contact.file)
  ) || `${contact.name} - ${contact.current_role || ''} @ ${contact.current_org || ''}`;

  // Use AI to summarize relevant conversation content
  const summary = await summarizeConversationHistory(
    contact.name,
    profileContent.slice(0, 1000),
    topic || originalQuery,
    conversationContents
  );

  let response = `🔍 **${contact.name}** — conversation history`;
  if (topic) response += ` re: ${topic}`;
  response += `\n📊 ${conversationContents.length} conversation(s) found\n\n`;
  response += summary;

  return response;
}

async function handleActionItem(text: string, intent: IntentResult): Promise<string> {
  const description = (intent.extracted_data.description as string) || text;
  const contact = (intent.extracted_data.contact as string) || undefined;
  const dueDate = (intent.extracted_data.due_date as string) || undefined;
  const owner = ((intent.extracted_data.owner as string) || 'me') as 'me' | 'them' | 'both';

  const item = await actionItemsManager.add({
    description,
    owner,
    due_date: dueDate,
    contact,
  });

  let response = `✅ Action item added: ${item.description}`;
  if (item.contact) response += ` (${item.contact})`;
  if (item.due_date) response += `\n📅 Due: ${item.due_date}`;
  response += `\n🆔 ${item.id}`;

  return response;
}

async function handleChat(text: string): Promise<string> {
  try {
    const { ai, MODEL } = await import('../ai/client');
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `你是 NEXUS，一个帮助 PE 投资专业人士管理人脉和对话的 AI 助手。你可以自然地和用户对话，回答问题，提供建议。

用户可能会用中文或英文跟你聊天。请用和用户相同的语言回复。

回答要简洁实用，不要过于冗长。直接输出答案，不要输出思考过程、推理步骤或分析过程。`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.7,
    });

    return resp.choices[0]?.message?.content || '抱歉，我没有生成回复。';
  } catch (err) {
    console.error('[Chat Error]', err);
    return '抱歉，对话服务暂时不可用。';
  }
}

// Command handlers
export async function handleStatus(): Promise<string> {
  const contactCount = await indexManager.getCount();
  const pending = await actionItemsManager.getPending();
  const overdue = await actionItemsManager.getOverdue();

  let response = `📊 **NEXUS Status**\n`;
  response += `👥 Contacts: ${contactCount}\n`;
  response += `📋 Pending items: ${pending.length}\n`;
  if (overdue.length > 0) {
    response += `⚠️ Overdue items: ${overdue.length}\n`;
  }
  return response;
}

export async function handleDashboard(): Promise<string> {
  try {
    const filePath = await vaultWriter.saveDashboard();
    const fileName = filePath.split('/').pop();
    return `✅ Data Dashboard 已更新\n\n📁 文件: ${fileName}\n\n在 Obsidian 中打开查看完整表格。`;
  } catch (err) {
    console.error('[Dashboard Error]', err);
    return `❌ 生成 Dashboard 失败: ${err}`;
  }
}

export async function handleMigrateCompanies(): Promise<string> {
  try {
    // Dynamic import to avoid circular dependencies
    const { migrateCompanies } = await import('../db/migrate-companies');
    await migrateCompanies();
    return `✅ 公司数据迁移完成！\n\n已处理现有联系人的公司信息：\n• 检测并修复了改名的公司（自动更新联系人文件）\n• 为新公司创建了 Obsidian 文件\n• 同步到 SQL 数据库\n\n使用 /dashboard 查看更新后的数据看板。`;
  } catch (err) {
    console.error('[Migrate Companies Error]', err);
    return `❌ 公司数据迁移失败: ${err}`;
  }
}

export async function handleSync(): Promise<string> {
  try {
    const { syncFromObsidian } = await import('../db/sync-from-obsidian');
    const result = await syncFromObsidian();
    let msg = `✅ Obsidian 同步完成！\n\n📇 Contacts: ${result.contactsUpdated} synced`;
    if (result.contactsDeleted > 0) msg += `, ${result.contactsDeleted} deleted`;
    msg += `\n🏢 Companies: ${result.companiesUpdated} synced`;
    if (result.companiesDeleted > 0) msg += `, ${result.companiesDeleted} deleted`;
    return msg;
  } catch (err) {
    console.error('[Sync Error]', err);
    return `❌ 同步失败: ${err}`;
  }
}

export async function handleEnrich(): Promise<string> {
  try {
    const { enrichContactProfiles } = await import('../db/enrich-profiles');
    const result = await enrichContactProfiles();
    if (result.enriched.length === 0) {
      return `✅ 没有需要丰富资料的联系人。\n\n今天没有新添加的联系人或对话。`;
    }
    return `✅ 资料丰富完成！\n\n已丰富 ${result.enriched.length} 位联系人:\n${result.enriched.map(n => `• ${n}`).join('\n')}`;
  } catch (err) {
    console.error('[Enrich Error]', err);
    return `❌ 丰富资料失败: ${err}`;
  }
}

export async function handlePending(): Promise<string> {
  const list = await actionItemsManager.formatPendingList();
  return `📋 **Pending Action Items**\n\n${list}`;
}

export async function handleFollowUp(): Promise<string> {
  const items = await actionItemsManager.getFollowUps();
  if (items.length === 0) {
    return 'No follow-ups due today.';
  }

  let response = '📅 **Follow-ups Due**\n\n';
  for (const item of items) {
    response += `• ${item.description}`;
    if (item.contact) response += ` (${item.contact})`;
    response += ` — due ${item.due_date}\n`;
  }
  return response;
}

export async function handleExport(): Promise<string> {
  const indexJson = await indexManager.getIndexForAI();
  return `📤 **Contact Index Export**\n\`\`\`json\n${indexJson}\n\`\`\``;
}

/**
 * Delete a contact from both Vault and Database
 */
export async function handleDeleteContact(name: string): Promise<string> {
  // Check if contact exists
  const existing = await indexManager.findByName(name);
  if (!existing) {
    return `I don't have a contact named "${name}".`;
  }

  // Delete from database
  const db = getDb();
  const contactsRepo = new ContactsRepo(db);
  contactsRepo.remove(name);

  // Delete from Vault (Obsidian file)
  const filePath = path.join(config.vault.path, existing.file);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    console.error('[Delete] Failed to delete file:', err);
  }

  let response = `✅ Deleted contact: **${name}**`;

  // Restart bot to sync database
  try {
    await restartBot();
    response += `. Bot restarted and synced.`;
  } catch (err) {
    response += `. ⚠️ Contact deleted but bot restart failed.`;
  }

  refreshDashboard();
  refreshStarredList();
  return response;
}
