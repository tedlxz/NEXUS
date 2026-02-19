import { ai, MODEL } from './client';
import { extractJson } from './utils';
import { ContactIndexEntry } from '../config';

const RESOLVE_CONTACT_PROMPT = `You are helping match a vague contact reference to an actual person in a contact database.

The user may refer to someone by:
- Partial name, nickname, or surname (e.g., "房总" could match "庞启智" or "房某某")
- Their organization (e.g., "恩捷的那个人" → person who works at 恩捷)
- Their role (e.g., "那个做FA的" → someone whose role is FA)
- A combination (e.g., "Marshall Wace的研究员" → person at Marshall Wace)

Given the user's reference and a list of contacts, identify the most likely match(es).

Return ONLY valid JSON:
{
  "matches": [
    {
      "name": "Exact name from contact list",
      "confidence": 0.0-1.0,
      "reasoning": "Why this person matches"
    }
  ]
}

If no match is found, return {"matches": []}.
Be generous with matching — partial surname matches, org matches, and phonetic similarities all count.`;

export async function resolveContactFuzzy(
  reference: string,
  contacts: ContactIndexEntry[]
): Promise<{ name: string; confidence: number; reasoning: string }[]> {
  if (contacts.length === 0) return [];

  const contactList = contacts.map(c => {
    let desc = c.name;
    if (c.current_role) desc += ` | ${c.current_role}`;
    if (c.current_org) desc += ` @ ${c.current_org}`;
    if (c.tags?.length) desc += ` | tags: ${c.tags.join(', ')}`;
    return desc;
  }).join('\n');

  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: RESOLVE_CONTACT_PROMPT },
        {
          role: 'user',
          content: `User's reference: "${reference}"\n\nContact list:\n${contactList}`,
        },
      ],
      temperature: 0.1,
    });

    const raw = resp.choices[0]?.message?.content || '{}';
    console.log('[AI Fuzzy Match]', raw.slice(0, 200));
    const parsed = JSON.parse(extractJson(raw));
    return parsed.matches || [];
  } catch (err) {
    console.error('Fuzzy contact resolve error:', err);
    return [];
  }
}

const SUMMARIZE_CONVERSATIONS_PROMPT = `You are helping a PE professional review past conversation records with a specific contact.

You will receive:
1. The contact's name and profile info
2. A specific topic or question the user is asking about
3. Multiple conversation records (summaries, key topics, insights, and possibly raw transcripts)

Your task:
- Find all content related to the user's specific topic/question
- Provide a clear, structured summary of what was discussed about that topic across all conversations
- Include specific details, numbers, names mentioned
- Note which conversation (by date) each piece of info came from
- If the topic was not discussed in any conversation, say so clearly

Respond in the same language as the user's query. Be thorough but concise.`;

export async function summarizeConversationHistory(
  contactName: string,
  contactProfile: string,
  topic: string,
  conversationContents: { date: string; content: string }[]
): Promise<string> {
  if (conversationContents.length === 0) {
    return `No conversation records found with ${contactName}.`;
  }

  const conversationsText = conversationContents.map(c =>
    `=== Conversation on ${c.date} ===\n${c.content}`
  ).join('\n\n');

  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SUMMARIZE_CONVERSATIONS_PROMPT },
        {
          role: 'user',
          content: `Contact: ${contactName}\nProfile: ${contactProfile}\n\nUser's question: ${topic}\n\nConversation records:\n${conversationsText}`,
        },
      ],
      temperature: 0.3,
    });

    return resp.choices[0]?.message?.content || 'Failed to generate summary.';
  } catch (err) {
    console.error('Conversation history summary error:', err);
    return 'Failed to summarize conversation history.';
  }
}

const PROFILE_SUMMARY_PROMPT = `你是一个帮助 PE 投资专业人士管理人脉的 AI 助手。

你将收到一位联系人的完整资料和对话记录。请生成一份简洁但内容充实的人物 profile 总结。

要求：
1. 用结构化的格式呈现（可以用 emoji + 粗体做小标题）
2. 涵盖：基本信息、职业背景、专业领域、关系状态、近期互动要点
3. 如果有对话记录，提炼出关键信息和值得注意的点
4. 篇幅控制在 300-500 字左右
5. 用中文回复
6. 不要编造资料中没有的信息
7. 直接输出总结，不要输出思考过程`;

export async function generateProfileSummary(
  contactName: string,
  profileContent: string,
  conversationSummaries: { date: string; summary: string }[]
): Promise<string> {
  let userMessage = `联系人姓名：${contactName}\n\n`;
  userMessage += `===== 个人资料 =====\n${profileContent}\n\n`;

  if (conversationSummaries.length > 0) {
    userMessage += `===== 对话记录摘要 =====\n`;
    for (const conv of conversationSummaries) {
      userMessage += `[${conv.date}] ${conv.summary}\n`;
    }
  } else {
    userMessage += `（暂无对话记录）\n`;
  }

  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: PROFILE_SUMMARY_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
    });

    const raw = resp.choices[0]?.message?.content || '';
    // Strip <think> blocks if present
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return cleaned || 'Failed to generate profile summary.';
  } catch (err) {
    console.error('Profile summary generation error:', err);
    return 'Failed to generate profile summary.';
  }
}
