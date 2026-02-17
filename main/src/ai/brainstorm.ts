import { ai, MODEL } from './client';
import { extractJson } from './utils';

const SYSTEM_PROMPT = `You are helping a PE professional find relevant people in their contact network for a specific topic or opportunity.

You will receive:
1. A topic or research question
2. A description of what they're looking for
3. A PRE-FILTERED subset of their contact index (JSON array) — these contacts have been identified as potentially relevant based on keyword and industry matching. Analyze them in depth.

Analyze the contacts and recommend the most relevant ones. For each recommendation, explain WHY they're relevant and suggest an approach.

Return ONLY valid JSON:
{
  "recommendations": [
    {
      "name": "Contact Name",
      "relevance_score": 0.0-1.0,
      "reasoning": "Why this contact is relevant",
      "suggested_approach": "How to leverage this connection",
      "connection_path": "Direct or through [[Other Person]]"
    }
  ],
  "expansion_suggestions": "Markdown text with suggestions for expanding the network in this area",
  "related_contacts_markdown": "Formatted markdown for the Research file's Related Contacts section"
}`;

export async function brainstorm(
  topic: string,
  description: string,
  contactIndex: string
): Promise<{
  recommendations: Array<{
    name: string;
    relevance_score: number;
    reasoning: string;
    suggested_approach: string;
    connection_path: string;
  }>;
  expansion_suggestions: string;
  related_contacts_markdown: string;
}> {
  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Topic: ${topic}\n\nDescription: ${description}\n\nContact Index:\n${contactIndex}`,
        },
      ],
      temperature: 0.5,
    });

    const raw = resp.choices[0]?.message?.content || '{}';
    console.log('[AI Raw Brainstorm]', raw.slice(0, 200));
    return JSON.parse(extractJson(raw));
  } catch (err) {
    console.error('Brainstorm error:', err);
    return {
      recommendations: [],
      expansion_suggestions: 'Failed to generate suggestions.',
      related_contacts_markdown: '',
    };
  }
}
