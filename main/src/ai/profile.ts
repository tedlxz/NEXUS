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

const RE_ENRICH_PROMPT = `You are helping a PE professional improve and complete a contact's profile. You will receive:

1. The contact's current profile (YAML frontmatter + markdown from their vault file)
2. The user's correction or additional information
3. Conversation summaries with this contact (if any)

Your job: merge the user's corrections with the existing data and conversation insights to produce a complete, improved profile. The user's corrections always take priority over existing data.

Important:
- If the user says "公司是X" or "在X工作", set current_org to X
- If the user provides a role/title, set current_role accordingly
- Preserve existing data that is NOT contradicted by the user's corrections
- Use conversation summaries to enrich profile, career_history, areas_of_expertise, and notes sections
- For well-known companies (上市公司, Fortune 500, etc.), add appropriate industry tags
- Do NOT fabricate information not present in the inputs

Return ONLY valid JSON with these fields (include ALL fields, use existing values for unchanged ones):
{
  "name": "Full name",
  "current_role": "Current job title",
  "current_org": "Current organization",
  "industries": ["industry1", "industry2"],
  "closeness": "close|medium|acquaintance",
  "how_we_met": "Context of first meeting",
  "introduced_by": "Name of person who introduced (no brackets)",
  "tags": ["tag1", "tag2"],
  "profile": "Markdown paragraph — comprehensive profile merging all sources",
  "career_history": "Markdown timeline of career history",
  "education": "Education info",
  "areas_of_expertise": "Bullet list of expertise areas",
  "key_connections": "Known connections formatted as [[Name]] — context",
  "notes": "Subjective observations or reminders"
}`;

export async function reEnrichProfile(
  name: string,
  currentProfileContent: string,
  userCorrection: string,
  conversationSummaries: { date: string; summary: string }[]
): Promise<PersonData> {
  let userMessage = `Contact name: ${name}\n\n`;
  userMessage += `===== Current Profile =====\n${currentProfileContent}\n\n`;
  userMessage += `===== User's Correction / Additional Info =====\n${userCorrection}\n\n`;

  if (conversationSummaries.length > 0) {
    userMessage += `===== Conversation Summaries =====\n`;
    for (const conv of conversationSummaries) {
      userMessage += `[${conv.date}] ${conv.summary}\n`;
    }
  }

  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: RE_ENRICH_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
    });

    const raw = resp.choices[0]?.message?.content || '{}';
    console.log('[AI Re-Enrich Profile]', raw.slice(0, 300));
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
    console.error('Re-enrich profile error:', err);
    return { name };
  }
}
