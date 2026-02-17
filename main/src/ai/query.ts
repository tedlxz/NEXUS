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
