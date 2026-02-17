import { ai, MODEL } from './client';
import { extractJson } from './utils';

export type Intent =
  | 'new_contact'
  | 'log_conversation'
  | 'update_contact'
  | 'brainstorm'
  | 'query'
  | 'action_item'
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
3. "update_contact" — User mentioned new info about an existing contact
4. "brainstorm" — User wants to find relevant people from their network for a topic
5. "query" — User is querying info about a specific contact or past conversation that is ALREADY STORED in the Nexus system (e.g. "张三是做什么的？", "我上次和庞启智聊了什么？"). This is ONLY for looking up data in the contact database, NOT for general knowledge or web searches.
6. "action_item" — User wants to add or update a to-do item
7. "daily_note" — This is the DEFAULT fallback. Use this for: general chat, general knowledge questions, news searches, web searches, analysis requests, opinions, advice, or ANYTHING that doesn't clearly fit the above categories. Examples: "搜索Insta360的新闻", "帮我分析一下这个市场", "今天天气怎么样", "什么是PE基金"

Important rules:
- Must accurately distinguish "new_contact" from "log_conversation"
- If user mentions meeting someone and provides their background info, that is "new_contact"
- If user provides a detailed conversation transcript, that is "log_conversation"
- If the user is asking about general knowledge, news, market analysis, or anything NOT specifically about looking up a stored contact/conversation, use "daily_note"
- When in doubt, ALWAYS default to "daily_note" (do not over-infer)
- If information is insufficient, include "clarification_needed" with a question
- If the user says "特别关注"/"star"/"重点关注" about a contact or company, that is "update_contact" with starred: true. For companies, also include is_company: true in extracted_data.
- If the user says "取消特别关注"/"unstar"/"取消重点关注" about a contact or company, that is "update_contact" with starred: false. For companies, also include is_company: true in extracted_data.
- Examples: "把Insta360设为特别关注" → update_contact with name: "Insta360", starred: true, is_company: true
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
      'new_contact', 'log_conversation', 'update_contact',
      'brainstorm', 'query', 'action_item', 'daily_note',
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

