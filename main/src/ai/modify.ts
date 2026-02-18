import { ai, MODEL } from './client';
import { extractJson } from './utils';

const EXTRACT_CHANGES_PROMPT = `You are helping a PE professional update their contact database. The user wants to modify some information about a contact.

Given:
1. The contact's current profile (YAML frontmatter + markdown)
2. The user's modification request (natural language, may be Chinese or English)

Extract the specific changes the user wants to make. Only include fields that the user explicitly wants to change. Do NOT include unchanged fields.

Return ONLY valid JSON:
{
  "changes": {
    "current_role": "new value or null if not changing",
    "current_org": "new value or null if not changing",
    "industries": ["new list"] or null,
    "closeness": "new value or null",
    "starred": true/false or null,
    "tags": ["new list"] or null,
    "profile": "new/updated profile text or null",
    "notes": "text to add to notes or null"
  },
  "description": "One-line summary of what is being changed (in the user's language)"
}

Only include keys in "changes" that are actually being modified. Omit null fields entirely.`;

export interface ContactChanges {
  changes: Record<string, unknown>;
  description: string;
}

export async function extractChanges(
  currentProfile: string,
  modificationRequest: string
): Promise<ContactChanges> {
  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: EXTRACT_CHANGES_PROMPT },
        {
          role: 'user',
          content: `Current profile:\n${currentProfile}\n\nModification request:\n${modificationRequest}`,
        },
      ],
      temperature: 0.1,
    });

    const raw = resp.choices[0]?.message?.content || '{}';
    console.log('[AI Extract Changes]', raw.slice(0, 300));
    return JSON.parse(extractJson(raw));
  } catch (err) {
    console.error('Extract changes error:', err);
    return { changes: {}, description: 'Failed to extract changes.' };
  }
}

const EXTRACT_COMPANY_CHANGES_PROMPT = `You are helping a PE professional update their company database. The user wants to modify some information about a company.

Given:
1. The company's current profile (YAML frontmatter + markdown)
2. The user's modification request (natural language, may be Chinese or English)

Extract the specific changes the user wants to make. Only include fields that the user explicitly wants to change. Do NOT include unchanged fields.

Understand Chinese equivalents:
- 上市公司 = listed: true, 非上市公司 = listed: false
- 美股 = market: "us", A股 = market: "cn", 港股 = market: "hk", 日股 = market: "jp", 韩股 = market: "kr"
- 上市地点/上市市场 = market field
- 股票代码/代码 = ticker field
- 行业 = industry field
- 标签/tag = tags field
- 网站 = website field
- 简介/描述/介绍 = description field
- 特别关注/star = starred field

Return ONLY valid JSON:
{
  "changes": {
    "listed": true/false or omit,
    "market": "us"/"cn"/"hk"/"jp"/"kr" or omit,
    "ticker": "string" or omit,
    "industry": "string" or omit,
    "tags": ["new list"] or omit,
    "website": "string" or omit,
    "description": "string" or omit,
    "starred": true/false or omit
  },
  "description": "One-line summary of what is being changed (in the user's language)"
}

Only include keys in "changes" that are actually being modified. Omit fields that are not mentioned.`;

export interface CompanyChanges {
  changes: Record<string, unknown>;
  description: string;
}

export async function extractCompanyChanges(
  currentProfile: string,
  modificationRequest: string
): Promise<CompanyChanges> {
  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: EXTRACT_COMPANY_CHANGES_PROMPT },
        {
          role: 'user',
          content: `Current profile:\n${currentProfile}\n\nModification request:\n${modificationRequest}`,
        },
      ],
      temperature: 0.1,
    });

    const raw = resp.choices[0]?.message?.content || '{}';
    console.log('[AI Extract Company Changes]', raw.slice(0, 300));
    return JSON.parse(extractJson(raw));
  } catch (err) {
    console.error('Extract company changes error:', err);
    return { changes: {}, description: 'Failed to extract company changes.' };
  }
}

const PARSE_REFILE_PROMPT = `You are helping a PE professional reorganize their conversation records.

The user wants to reassign a conversation record to a different contact, or correct which contact a conversation belongs to.

Given the user's request, extract:
1. Which conversation file they're referring to (may be partial filename, topic, or date)
2. The current contact (who it's currently filed under, if mentioned)
3. The correct contact (who it should be filed under)

Return ONLY valid JSON:
{
  "conversation_hint": "any identifying info about the conversation (filename fragment, date, topic)",
  "current_contact": "who it's currently assigned to (may be empty)",
  "correct_contact": "who it should be assigned to",
  "description": "One-line summary of the refile action"
}`;

export interface RefileRequest {
  conversation_hint: string;
  current_contact: string;
  correct_contact: string;
  description: string;
}

export async function parseRefileRequest(text: string): Promise<RefileRequest> {
  try {
    const resp = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: PARSE_REFILE_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
    });

    const raw = resp.choices[0]?.message?.content || '{}';
    console.log('[AI Refile Parse]', raw.slice(0, 300));
    return JSON.parse(extractJson(raw));
  } catch (err) {
    console.error('Refile parse error:', err);
    return {
      conversation_hint: '',
      current_contact: '',
      correct_contact: '',
      description: 'Failed to parse refile request.',
    };
  }
}
