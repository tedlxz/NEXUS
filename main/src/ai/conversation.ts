import { ai, MODEL } from './client';
import { ConversationData, ConversationSource, ActionItemInput } from '../config';
import { extractJson } from './utils';

const SYSTEM_PROMPT = `You are helping a PE professional process conversation records. Given a conversation transcript or summary (may be in Chinese or English), produce a structured analysis.

Return ONLY valid JSON:
{
  "ai_summary": "Narrative paragraph summarizing the conversation",
  "key_topics": ["topic1", "topic2"],
  "core_insights": "Analytical paragraph about what this conversation means strategically",
  "mentioned_companies": ["Company A", "Company B"],
  "mentioned_people": ["[[Person Name]] — context of mention"],
  "mentioned_deals": ["Deal/project name — status or context"],
  "company_tags": ["Actual company names mentioned in the conversation, e.g. 宁德时代, Tesla, 阳光电源. Only real company/organization names, NOT industry sectors or generic terms."],
  "action_items": [
    {
      "description": "What needs to be done",
      "owner": "me|them|both",
      "due_date": "YYYY-MM-DD or null",
      "priority": "high|medium|low"
    }
  ],
  "source": "Face-to-face|Zoom|WeChat Call|Phone|Email|WeChat Text|LinkedIn|Other",
  "occasion": "Context of why this conversation happened",
  "initiated_by": "me|them|mutual",
  "sentiment": "positive|neutral|negative|mixed",
  "relationship_signal": "strengthening|stable|cooling|new_connection",
  "follow_up_date": "YYYY-MM-DD or null",
  "follow_up_context": "What to follow up about",
  "tags": ["tag1", "tag2"]
}`;

export async function summarizeConversation(
  transcript: string,
  contactName: string,
  contactProfile?: string
): Promise<Partial<ConversationData>> {
  try {
    const context = contactProfile
      ? `\n\nExisting profile of ${contactName}:\n${contactProfile}`
      : '';

    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Conversation with: ${contactName}${context}\n\nTranscript/notes:\n${transcript}`,
        },
      ],
      temperature: 0.3,
    });

    const raw = resp.choices[0]?.message?.content || '{}';
    console.log('[AI Raw Conversation]', raw.slice(0, 200));
    const parsed = JSON.parse(extractJson(raw));

    const result: Partial<ConversationData> = {
      contact: contactName,
      date: new Date().toISOString().slice(0, 10),
      source: (parsed.source as ConversationSource) || 'Other',
      occasion: parsed.occasion,
      initiated_by: parsed.initiated_by,
      sentiment: parsed.sentiment,
      relationship_signal: parsed.relationship_signal,
      follow_up_date: parsed.follow_up_date || undefined,
      follow_up_context: parsed.follow_up_context || undefined,
      tags: parsed.tags,
      company_tags: parsed.company_tags,  // Independent company tags
      ai_summary: parsed.ai_summary,
      key_topics: parsed.key_topics,
      core_insights: parsed.core_insights,
      mentioned_companies: parsed.mentioned_companies,
      mentioned_people: parsed.mentioned_people,
      mentioned_deals: parsed.mentioned_deals,
      action_items: parsed.action_items as ActionItemInput[],
      raw_transcript: transcript,
    };

    return result;
  } catch (err) {
    console.error('Conversation summary error:', err);
    return {
      contact: contactName,
      date: new Date().toISOString().slice(0, 10),
      source: 'Other',
      ai_summary: 'Failed to generate AI summary.',
      raw_transcript: transcript,
    };
  }
}
