import { PersonData, ConversationData, ResearchData, ActionItemInput, CompanyNoteData } from '../config';

function toYamlValue(val: string): string {
  // Always wrap in quotes to avoid YAML parsing issues
  if (!val) return '""';
  // Escape backslashes, double quotes, and newlines for valid YAML double-quoted strings
  const escaped = val
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  return `"${escaped}"`;
}

function toYamlList(items: string[], indent = 2): string {
  // Strip # prefix if present (Obsidian tags in YAML shouldn't have #)
  const cleanItems = items.map(i => i.replace(/^#/, ''));
  return cleanItems.map(i => `${' '.repeat(indent)}- ${toYamlValue(i)}`).join('\n');
}

export function personTemplate(data: PersonData): string {
  const now = new Date().toISOString().slice(0, 10);

  // Sanitize company name for file reference
  const safeCompanyName = data.current_org ? data.current_org.replace(/[<>:"/\\|?*]/g, ' ') : undefined;

  // Always include ALL frontmatter fields to match Obsidian template exactly
  const fm: string[] = [
    '---',
    'type: person',
    `name: ${toYamlValue(data.name)}`,
    data.current_role ? `current_role: ${toYamlValue(data.current_role)}` : 'current_role:',
    data.current_org ? `current_org: "[[${safeCompanyName}]]"` : 'current_org:',
  ];
  if (data.industries?.length) {
    fm.push('industries:');
    fm.push(toYamlList(data.industries));
  } else {
    fm.push('industries: []');
  }
  fm.push(`closeness: ${data.closeness || 'medium'}`);
  fm.push(`starred: ${data.starred ? 'true' : 'false'}`);
  fm.push(data.how_we_met ? `how_we_met: ${toYamlValue(data.how_we_met)}` : 'how_we_met:');
  fm.push(data.introduced_by ? `introduced_by: "[[${data.introduced_by}]]"` : 'introduced_by:');
  fm.push(data.last_contact ? `last_contact: ${data.last_contact}` : 'last_contact:');
  if (data.tags?.length) {
    fm.push('tags:');
    fm.push(toYamlList(data.tags));
  } else {
    fm.push('tags: []');
  }
  fm.push(`created: ${now}`);
  fm.push(`updated: ${now}`);
  fm.push('---');

  const sections: string[] = [
    `# ${data.name}`,
    '',
    '## Profile',
    data.profile || '',
    '',
    '## Career History',
    data.career_history || '',
    '',
    '## Education',
    data.education || '',
    '',
    '## Areas of Expertise',
    data.areas_of_expertise || '',
    '',
    '## Key Connections',
    data.key_connections || '',
    '',
    '## Public Internet Info',
    data.public_info || '',
    '',
    '## Conversation Records',
    '',
    '',
    '## My Notes',
    data.notes || '',
  ];

  return fm.join('\n') + '\n' + sections.join('\n') + '\n';
}

function formatActionItems(items: ActionItemInput[]): string {
  return items.map(item => {
    let line = `- [ ] ${item.description}`;
    if (item.priority) line += ` (priority ${item.priority})`;
    if (item.owner && item.owner !== 'me') line += ` (owner: ${item.owner})`;
    if (item.due_date) line += ` (due date) ${item.due_date}`;
    return line;
  }).join('\n');
}

export function conversationTemplate(data: ConversationData): string {
  const now = new Date().toISOString().slice(0, 10);
  const fm: string[] = [
    '---',
    'type: conversation',
    `contact: "[[${data.contact}]]"`,
    `date: ${data.date}`,
  ];
  if (data.end_date) fm.push(`end_date: ${data.end_date}`);
  fm.push(`source: ${data.source}`);
  if (data.location) fm.push(`location: ${toYamlValue(data.location)}`);
  if (data.occasion) fm.push(`occasion: ${toYamlValue(data.occasion)}`);
  if (data.initiated_by) fm.push(`initiated_by: ${data.initiated_by}`);
  if (data.sentiment) fm.push(`sentiment: ${data.sentiment}`);
  if (data.relationship_signal) fm.push(`relationship_signal: ${data.relationship_signal}`);
  if (data.follow_up_date) fm.push(`follow_up_date: ${data.follow_up_date}`);
  if (data.follow_up_context) fm.push(`follow_up_context: ${toYamlValue(data.follow_up_context)}`);
  // Company tags (independent system for marking which companies this conversation relates to)
  if (data.company_tags?.length) {
    fm.push('company_tags:');
    fm.push(toYamlList(data.company_tags));
  }
  if (data.tags?.length) {
    fm.push('tags:');
    fm.push(toYamlList(data.tags));
  }
  fm.push(`created: ${now}`);
  fm.push('---');

  // Build company tags header for display (shown before conversation content)
  const companyTagsHeader = data.company_tags?.length 
    ? data.company_tags.map(c => `#${c.replace(/\s+/g, '')}`).join(' ')
    : '';

  const title = `# ${data.date} with [[${data.contact}]] ${data.source}`;
  const sections: string[] = [
    companyTagsHeader,
    title,
    '',
    '## AI Summary',
    data.ai_summary || '',
    '',
    '## Key Topics',
    data.key_topics?.map(t => `- ${t}`).join('\n') || '',
    '',
    '## Core Insights',
    data.core_insights || '',
    '',
    '## Mentioned Companies',
    data.mentioned_companies?.map(c => `- ${c}`).join('\n') || '',
    '',
    '## Mentioned People',
    data.mentioned_people?.map(p => `- ${p}`).join('\n') || '',
    '',
    '## Mentioned Deals/Projects',
    data.mentioned_deals?.map(d => `- ${d}`).join('\n') || '',
    '',
    '## Action Items',
    data.action_items?.length ? formatActionItems(data.action_items) : '',
    '',
    '## My Notes',
    data.notes || '',
    '',
    '## Raw Transcript',
    data.raw_transcript ? `![[_raw/${data.date} ${data.contact}.txt]]` : '',
  ];

  return fm.join('\n') + '\n' + sections.join('\n') + '\n';
}

export function researchTemplate(data: ResearchData): string {
  const now = new Date().toISOString().slice(0, 10);
  const fm: string[] = [
    '---',
    'type: research',
    `topic: ${toYamlValue(data.topic)}`,
    `status: ${data.status || 'active'}`,
    `created: ${now}`,
    `updated: ${now}`,
    '---',
  ];

  const sections: string[] = [
    `# ${data.topic}`,
    '',
    '## Research Description',
    data.description || '',
    '',
    '## AI Recommended Related Contacts',
    data.related_contacts || '',
    '',
    '## Expansion Suggestions',
    data.expansion_suggestions || '',
  ];

  return fm.join('\n') + '\n' + sections.join('\n') + '\n';
}

export function dailyNoteTemplate(date: string): string {
  const fm = [
    '---',
    'type: daily',
    `date: ${date}`,
    '---',
  ];

  return fm.join('\n') + '\n' + `# Daily Notes - ${date}\n\n`;
}

export function dailyNoteEntry(timestamp: string, userMessage: string, result: string): string {
  return [
    `### ${timestamp}`,
    '',
    `> ${userMessage}`,
    '',
    result,
    '',
    '---',
    '',
  ].join('\n');
}

// Obsidian template files (placed in Templates/ folder)
export const obsidianPersonTemplate = `---
type: person
name: "{{name}}"
current_role:
current_org:
industries: []
closeness: medium
starred: false
how_we_met:
introduced_by:
last_contact:
tags: []
created: "{{date}}"
updated: "{{date}}"
---

# {{name}}

## Profile

## Career History

## Education

## Areas of Expertise

## Key Connections

## Public Internet Info

## Conversation Records

## My Notes
`;

export const obsidianConversationTemplate = `---
type: conversation
contact: "[[]]"
date: "{{date}}"
source:
location:
occasion:
initiated_by:
sentiment:
relationship_signal:
follow_up_date:
follow_up_context:
tags: []
created: "{{date}}"
---

# {{date}} with [[]]

## AI Summary

## Key Topics

## Core Insights

## Mentioned Companies

## Mentioned People

## Mentioned Deals/Projects

## Action Items

## My Notes

## Raw Transcript
`;

export const obsidianResearchTemplate = `---
type: research
topic: "{{title}}"
status: active
created: "{{date}}"
updated: "{{date}}"
---

# {{title}}

## Research Description

## AI Recommended Related Contacts

## Expansion Suggestions
`;

export const obsidianCompanyTemplate = `---
type: company
name: "{{name}}"
listed: false
market: 
ticker: 
starred: false
industries: []
created: "{{date}}"
updated: "{{date}}"
---

# {{name}}

## Basic Info

> **上市状态：** {{listed ? '上市公司' : '非上市公司'}}
> **上市地点：** {{market || '—'}}
> **股票代码：** {{ticker || '—'}}

## Related Contacts

_(Add contacts here)_

## Related Conversations

_(No conversations yet)_

## Notes
`;

// Company template
export function companyTemplate(data: CompanyNoteData): string {
  const now = new Date().toISOString().slice(0, 10);
  const fm: string[] = [
    '---',
    'type: company',
    `name: ${toYamlValue(data.name)}`,
  ];
  fm.push(`listed: ${data.listed ? 'true' : 'false'}`);
  fm.push(`market: ${data.market || ''}`);
  fm.push(`ticker: ${data.ticker ? toYamlValue(data.ticker) : ''}`);
  fm.push(data.industry ? `industry: ${toYamlValue(data.industry)}` : 'industry:');
  if (data.tags?.length) {
    fm.push('tags:');
    fm.push(toYamlList(data.tags));
  } else {
    fm.push('tags: []');
  }
  fm.push(data.website ? `website: ${toYamlValue(data.website)}` : 'website:');
  fm.push(data.description ? `description: ${toYamlValue(data.description)}` : 'description:');
  fm.push(`starred: ${data.starred ? 'true' : 'false'}`);
  fm.push(`created: ${now}`);
  fm.push(`updated: ${now}`);
  fm.push('---');

  // Build tags for display (as Obsidian tags)
  const displayTags = data.tags?.length 
    ? data.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ')
    : '';

  // Format market display name
  const marketNames: Record<string, string> = {
    us: '美股',
    cn: 'A股',
    hk: '港股',
    jp: '日股',
    kr: '韩股',
  };
  const marketDisplay = data.market ? marketNames[data.market] || data.market : '—';

  const sections: string[] = [
    displayTags,
    `# ${data.name}`,
    '',
    '## Basic Info',
    `> **上市状态：** ${data.listed ? '上市公司' : '非上市公司'}`,
    `> **上市地点：** ${marketDisplay}`,
    `> **股票代码：** ${data.ticker || '—'}`,
    '',
  ];

  // Related Contacts section
  if (data.related_contacts?.length) {
    sections.push('## Related Contacts', '');
    for (const contact of data.related_contacts) {
      const rel = contact.relationship === 'current' ? '(Current)' : '(Past)';
      sections.push(`- [[${contact.name}]] — ${contact.role} ${rel}`);
    }
    sections.push('');
  } else {
    sections.push('## Related Contacts', '', '_(No contacts yet)_', '');
  }

  // Related Conversations section
  if (data.related_conversations?.length) {
    sections.push('## Related Conversations', '');
    for (const conv of data.related_conversations) {
      sections.push(`- [[${conv.date} ${conv.contact}|${conv.date}]] — ${conv.summary.slice(0, 80)}...`);
    }
    sections.push('');
  } else {
    sections.push('## Related Conversations', '', '_(No conversations yet)_', '');
  }

  // Notes section
  sections.push('## Notes', '');
  sections.push(data.description || '');
  sections.push('');

  return fm.join('\n') + '\n' + sections.join('\n') + '\n';
}
