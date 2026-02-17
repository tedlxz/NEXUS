import { ai, MODEL } from './client';
import { PersonData } from '../config';
import { extractJson } from './utils';

const SYSTEM_PROMPT = `You are helping a PE professional organize contact information. Given a person's name and a natural language description (may be in Chinese or English), extract structured profile information.

Return ONLY valid JSON with these fields (omit fields with no data):
{
  "name": "Full name",
  "current_role": "Current job title",
  "current_org": "Current organization",
  "industries": ["industry1", "industry2"],
  "closeness": "close|medium|acquaintance",
  "how_we_met": "Context of first meeting",
  "introduced_by": "Name of person who introduced (no brackets)",
  "tags": ["tag1", "tag2"],
  "profile": "Markdown paragraph about this person — position, personality, background notes",
  "career_history": "Markdown timeline of career history if mentioned",
  "education": "Education info if mentioned",
  "areas_of_expertise": "Bullet list of expertise areas",
  "key_connections": "Known connections formatted as [[Name]] — context",
  "notes": "Any subjective observations or reminders"
}`;

export async function parseProfile(
  name: string,
  rawText: string
): Promise<PersonData> {
  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Person's name: ${name}\n\nRaw description:\n${rawText}`,
        },
      ],
      temperature: 0.2,
    });

    const raw = resp.choices[0]?.message?.content || '{}';
    console.log('[AI Raw Profile]', raw.slice(0, 200));
    const parsed = JSON.parse(extractJson(raw));

    return {
      name: parsed.name || name,
      current_role: parsed.current_role,
      current_org: parsed.current_org,
      industries: parsed.industries,
      closeness: parsed.closeness,
      how_we_met: parsed.how_we_met,
      introduced_by: parsed.introduced_by,
      tags: parsed.tags,
      profile: parsed.profile,
      career_history: parsed.career_history,
      education: parsed.education,
      areas_of_expertise: parsed.areas_of_expertise,
      key_connections: parsed.key_connections,
      notes: parsed.notes,
    };
  } catch (err) {
    console.error('Profile parsing error:', err);
    return {
      name,
      notes: rawText,
    };
  }
}
