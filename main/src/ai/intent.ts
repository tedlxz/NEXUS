import { ai, MODEL } from './client';
import { extractJson } from './utils';

export type Intent =
  | 'new_contact'
  | 'log_conversation'
  | 'update_contact'
  | 'enrich_contact'
  | 'brainstorm'
  | 'query'
  | 'action_item'
  | 'news_search'
  | 'clear_context'
  | 'daily_note';

export interface IntentResult {
  intent: Intent;
  confidence: number;
  extracted_data: Record<string, unknown>;
  clarification_needed?: string;
}

const SYSTEM_PROMPT = `You are the AI assistant for the Nexus system, helping PE investment professionals manage contacts and conversations.

Users will send you natural language messages via chat (may be in Chinese or English). Please determine the user's intent and return in JSON format.

Possible intents:
1. "new_contact" — User mentioned a newly met person or wants to record someone's info
2. "log_conversation" — User provided a conversation transcript or wants to record a conversation that happened
3. "update_contact" — User mentioned new info about an existing contact (simple field changes like role, org, tags)
4. "enrich_contact" — User wants to RE-PROCESS or IMPROVE an existing contact's profile. Use this when the user says things like "重新整理XX的资料", "改进XX的profile", "XX的信息不完整", "重新识别XX", "帮我补充XX的资料", or provides corrections AND asks to re-generate/improve the profile. The key difference from "update_contact": enrich_contact re-reads all data (vault file + conversations) and regenerates a comprehensive profile, while update_contact just changes specific fields.
5. "brainstorm" — User wants to find relevant people from their network for a topic
6. "query" — User is querying info about a specific contact or past conversation that is ALREADY STORED in the Nexus system (e.g. "张三是做什么的？", "我上次和庞启智聊了什么？"). This is ONLY for looking up data in the contact database, NOT for general knowledge or web searches.
7. "action_item" — User wants to add or update a to-do item
8. "news_search" — User wants to search for news or information about a specific company, person, or topic. Examples: "帮我搜索宁德时代的新闻", "有没有关于xxx公司的最新消息", "查一下Insta360", "搜索特斯拉财报"
9. "clear_context" — User explicitly asks to clear conversation context or history. Examples: "清除上下文", "clear", "清空对话历史", "重新开始"
10. "daily_note" — This is the DEFAULT fallback. Use this for: general chat, general knowledge questions, web searches, analysis requests, opinions, advice, or ANYTHING that doesn't clearly fit the above categories. Examples: "帮我分析一下这个市场", "今天天气怎么样", "什么是PE基金"

Important rules:
- Must accurately distinguish "new_contact" from "log_conversation"
- If user mentions meeting someone and provides their background info, that is "new_contact"
- If user provides a detailed conversation transcript, that is "log_conversation"
- If the user is asking about general knowledge, news, market analysis, or anything NOT specifically about looking up a stored contact/conversation, use "daily_note"
- When in doubt, ALWAYS default to "daily_note" (do not over-infer)
- If information is insufficient, include "clarification_needed" with a question
- If the user says "特别关注"/"star"/"重点关注" about a contact or company, that is "update_contact" with starred: true. For companies, also include is_company: true in extracted_data.
- If the user says "取消特别关注"/"unstar"/"取消重点关注" about a contact or company, that is "update_contact" with starred: false. For companies, also include is_company: true in extracted_data.
- If the user corrects or updates info about a company (listing status, industry, description, ticker, market, tags, website, etc.), that is "update_contact" with is_company: true in extracted_data.
- If the user corrects or updates info about a person (role, organization, profile, notes, etc.), that is "update_contact".
- Examples:
  - "把Insta360设为特别关注" → update_contact with name: "Insta360", starred: true, is_company: true
  - "Insta360 是上市公司" → update_contact with name: "Insta360", is_company: true
  - "Insta360 不是非上市公司，它是上市公司" → update_contact with name: "Insta360", is_company: true
  - "给 Insta360 加个标签：消费电子" → update_contact with name: "Insta360", is_company: true
  - "Insta360 的行业改成智能硬件" → update_contact with name: "Insta360", is_company: true
  - "把张三的职位改成 VP" → update_contact with name: "张三"
  - "张三现在去了阿里巴巴" → update_contact with name: "张三"
  - "Kevin 的背景补充一下，他之前在 Intel 工作过" → update_contact with name: "Kevin"
  - "重新整理钱锦的资料" → enrich_contact with name: "钱锦"
  - "钱锦的信息不完整，他是阳光电源的战略投资总监" → enrich_contact with name: "钱锦", correction: "他是阳光电源的战略投资总监"
  - "帮我改进张三的profile，补充一下他的背景" → enrich_contact with name: "张三"
  - "重新识别一下李四的资料，公司应该是腾讯" → enrich_contact with name: "李四", correction: "公司应该是腾讯"
  - "帮我搜索宁德时代的新闻" → news_search with company: "宁德时代"
  - "查一下特斯拉最近的新闻" → news_search with company: "特斯拉"
  - "有没有关于xxx公司的最新消息" → news_search with company: "xxx"
  - "清除上下文" → clear_context
  - "clear" → clear_context
  - "重新开始" → clear_context
- For "enrich_contact", extract: name (contact name), correction (the user's correction text or additional info, if provided)
- For "news_search", extract: company (company name), topic (what to search for, optional)
- For "clear_context", no extraction needed
- For "new_contact", extract: name, current_role, current_org, industries, how_we_met, tags
- For "log_conversation", extract: contact (name), source (communication channel)
- For "query", extract: contact_ref (how user referred to the person, may be vague/partial), topic (what they want to know about), query_type ("conversation_history" if asking about past conversations, "contact_info" if asking about a person's info, "search" if general search)

You MUST respond with ONLY valid JSON, no other text:
{
  "intent": "...",
  "confidence": 0.0-1.0,
  "extracted_data": { ... }
}`;

export async function classifyIntent(
  message: string,
  hasAttachment: boolean = false
): Promise<IntentResult> {
  const userContent = hasAttachment
    ? `[User sent a message with attachment]\n${message}`
    : message;

  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
    });

    const raw = resp.choices[0]?.message?.content || '';
    console.log('[AI Raw Intent]', raw);

    const parsed = JSON.parse(extractJson(raw)) as IntentResult;

    // Validate intent is one of the known types
    const validIntents: Intent[] = [
      'new_contact', 'log_conversation', 'update_contact', 'enrich_contact',
      'brainstorm', 'query', 'action_item', 'news_search', 'clear_context',
      'daily_note',
    ];
    if (!validIntents.includes(parsed.intent)) {
      parsed.intent = 'daily_note';
    }

    return parsed;
  } catch (err) {
    console.error('Intent classification error:', err);
    return {
      intent: 'daily_note',
      confidence: 0,
      extracted_data: {},
      clarification_needed: 'Failed to classify intent. Saved as daily note.',
    };
  }
}

