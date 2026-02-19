import fs from 'fs/promises';
import path from 'path';
import { config, vaultPaths, PersonData, ConversationData, ResearchData } from '../config';
import {
  personTemplate,
  conversationTemplate,
  researchTemplate,
  dailyNoteTemplate,
  dailyNoteEntry,
  companyTemplate,
} from './templates';

/** Get vault paths for a specific user */
export function getUserVaultPaths(userId: string) {
  const vaultBase = config.vault.getVaultPath(userId);
  return {
    people: path.join(vaultBase, 'People'),
    conversations: path.join(vaultBase, 'Conversations'),
    companies: path.join(vaultBase, 'Companies'),
    research: path.join(vaultBase, 'Research'),
    daily: path.join(vaultBase, 'Daily'),
    templates: path.join(vaultBase, 'Templates'),
    raw: path.join(vaultBase, '_raw'),
    system: path.join(vaultBase, '_system'),
    database: path.join(vaultBase, '_system', 'nexus.db'),
  };
}

/** Ensure vault folders exist for a specific user */
export async function ensureUserVaultFolders(userId: string): Promise<void> {
  const paths = getUserVaultPaths(userId);
  await ensureDir(paths.people);
  await ensureDir(paths.conversations);
  await ensureDir(paths.companies);
  await ensureDir(paths.research);
  await ensureDir(paths.daily);
  await ensureDir(paths.templates);
  await ensureDir(paths.raw);
  await ensureDir(paths.system);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/** Ensure all vault folders exist */
export async function ensureVaultFolders(): Promise<void> {
  await ensureDir(vaultPaths.people);
  await ensureDir(vaultPaths.conversations);
  await ensureDir(vaultPaths.companies);
  await ensureDir(vaultPaths.research);
  await ensureDir(vaultPaths.daily);
  await ensureDir(vaultPaths.templates);
  await ensureDir(vaultPaths.raw);
  await ensureDir(vaultPaths.system);
}

/** Atomic write: write to temp file then rename */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = filePath + '.tmp.' + Date.now();
  await fs.writeFile(tmp, content, 'utf-8');
  await fs.rename(tmp, filePath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class VaultWriter {
  async createPerson(data: PersonData, userId?: string): Promise<string> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const filePath = path.join(paths.people, `${data.name}.md`);
    const content = personTemplate(data);
    await atomicWrite(filePath, content);
    return filePath;
  }

  async updatePerson(name: string, updates: Partial<PersonData>, userId?: string): Promise<void> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const filePath = path.join(paths.people, `${name}.md`);
    const exists = await fileExists(filePath);
    if (!exists) {
      // Create new if doesn't exist
      await this.createPerson({ name, ...updates }, userId);
      return;
    }

    const matter = await import('gray-matter');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = matter.default(raw);

    // Merge frontmatter
    const updatedFm = { ...parsed.data };
    if (updates.current_role !== undefined) updatedFm.current_role = updates.current_role;
    if (updates.current_org !== undefined) updatedFm.current_org = updates.current_org;
    if (updates.industries !== undefined) updatedFm.industries = updates.industries;
    if (updates.closeness !== undefined) updatedFm.closeness = updates.closeness;
    if (updates.starred !== undefined) updatedFm.starred = updates.starred;
    if (updates.how_we_met !== undefined) updatedFm.how_we_met = updates.how_we_met;
    if (updates.introduced_by !== undefined) updatedFm.introduced_by = `[[${updates.introduced_by}]]`;
    if (updates.last_contact !== undefined) updatedFm.last_contact = updates.last_contact;
    if (updates.tags !== undefined) updatedFm.tags = updates.tags;
    updatedFm.updated = new Date().toISOString().slice(0, 10);

    let body = parsed.content;

    // Update specific sections if provided
    if (updates.profile) body = replaceSection(body, 'Profile', updates.profile);
    if (updates.career_history) body = replaceSection(body, 'Career History', updates.career_history);
    if (updates.education) body = replaceSection(body, 'Education', updates.education);
    if (updates.areas_of_expertise) body = replaceSection(body, 'Areas of Expertise', updates.areas_of_expertise);
    if (updates.key_connections) body = replaceSection(body, 'Key Connections', updates.key_connections);
    if (updates.public_info) body = replaceSection(body, 'Public Internet Info', updates.public_info);
    if (updates.notes) body = appendToSection(body, 'My Notes', updates.notes);

    const newContent = matter.default.stringify(body, updatedFm);
    await atomicWrite(filePath, newContent);
  }

  async createConversation(data: ConversationData, userId?: string): Promise<string> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const fileName = `${data.date} ${data.contact} ${data.source}.md`;
    const filePath = path.join(paths.conversations, fileName);
    const content = conversationTemplate(data);
    await atomicWrite(filePath, content);

    // Save raw transcript if provided
    if (data.raw_transcript) {
      await this.saveRawTranscript(data.contact, data.date, data.raw_transcript, userId);
    }

    return filePath;
  }

  async saveRawTranscript(contactName: string, date: string, content: string, userId?: string): Promise<string> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const filePath = path.join(paths.raw, `${date} ${contactName}.txt`);
    await atomicWrite(filePath, content);
    return filePath;
  }

  async createResearch(data: ResearchData, userId?: string): Promise<string> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const filePath = path.join(paths.research, `${data.topic}.md`);
    const content = researchTemplate(data);
    await atomicWrite(filePath, content);
    return filePath;
  }

  async appendDailyNote(message: string, result: string, userId?: string): Promise<void> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const today = new Date().toISOString().slice(0, 10);
    const filePath = path.join(paths.daily, `${today}.md`);
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

    const exists = await fileExists(filePath);
    if (!exists) {
      const content = dailyNoteTemplate(today) + dailyNoteEntry(timestamp, message, result);
      await atomicWrite(filePath, content);
    } else {
      const entry = dailyNoteEntry(timestamp, message, result);
      await fs.appendFile(filePath, entry, 'utf-8');
    }
  }

  async addConversationLink(contactName: string, conversationFile: string, userId?: string): Promise<void> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const filePath = path.join(paths.people, `${contactName}.md`);
    const exists = await fileExists(filePath);
    if (!exists) return;

    const content = await fs.readFile(filePath, 'utf-8');
    const convBaseName = path.basename(conversationFile, '.md');
    const link = `- [[${convBaseName}]]`;

    // Insert link under "## Conversation Records"
    const updated = appendToSection(content, 'Conversation Records', link);

    // Update last_contact in frontmatter
    const matter = await import('gray-matter');
    const parsed = matter.default(updated);
    parsed.data.last_contact = new Date().toISOString().slice(0, 10);
    parsed.data.updated = new Date().toISOString().slice(0, 10);

    const newContent = matter.default.stringify(parsed.content, parsed.data);
    await atomicWrite(filePath, newContent);
  }

  async readFile(filePath: string): Promise<string | null> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async listPeople(userId?: string): Promise<string[]> {
    try {
      const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
      const files = await fs.readdir(paths.people);
      return files.filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
    } catch {
      return [];
    }
  }

  async saveDashboard(userId?: string): Promise<string> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const dashboard = await generateDataDashboard(userId);
    const filePath = path.join(paths.system, 'Data Dashboard.md');
    await atomicWrite(filePath, dashboard);
    return filePath;
  }

  async saveStarredList(userId?: string): Promise<string> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const starredMd = await generateStarredList(userId);
    const filePath = path.join(paths.system, 'Starred.md');
    await atomicWrite(filePath, starredMd);
    return filePath;
  }

  /** Create or update a company file in Obsidian */
  async createOrUpdateCompany(
    companyName: string,
    relatedContacts: Array<{ name: string; role: string; relationship: 'current' | 'past' }> = [],
    relatedConversations: Array<{ date: string; contact: string; summary: string }> = [],
    industry?: string,
    description?: string,
    starred?: boolean,
    listed?: boolean,
    market?: 'us' | 'cn' | 'hk' | 'jp' | 'kr',
    ticker?: string,
    userId?: string
  ): Promise<string> {
    // Sanitize company name for filename (remove invalid characters)
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const safeName = companyName.replace(/[<>:"/\\|?*]/g, ' ');
    const filePath = path.join(paths.companies, `${safeName}.md`);
    const data = {
      name: companyName,
      industry,
      description,
      starred,
      listed,
      market,
      ticker,
      related_contacts: relatedContacts,
      related_conversations: relatedConversations,
    };
    const content = companyTemplate(data);
    await atomicWrite(filePath, content);
    return filePath;
  }

  /** Update specific fields of an existing company file */
  async updateCompany(companyName: string, changes: Record<string, unknown>, userId?: string): Promise<void> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    const safeName = companyName.replace(/[<>:"/\\|?*]/g, ' ');
    const filePath = path.join(paths.companies, `${safeName}.md`);
    const exists = await fileExists(filePath);
    if (!exists) {
      console.error(`[UpdateCompany] File not found: ${filePath}`);
      return;
    }

    const matter = await import('gray-matter');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = matter.default(raw);

    // Merge only provided fields into frontmatter
    if (changes.listed !== undefined) parsed.data.listed = changes.listed;
    if (changes.market !== undefined) parsed.data.market = changes.market;
    if (changes.ticker !== undefined) parsed.data.ticker = changes.ticker;
    if (changes.industry !== undefined) parsed.data.industry = changes.industry;
    if (changes.starred !== undefined) parsed.data.starred = changes.starred;
    if (changes.tags !== undefined) parsed.data.tags = changes.tags;
    if (changes.website !== undefined) parsed.data.website = changes.website;
    if (changes.description !== undefined) parsed.data.description = changes.description;
    parsed.data.updated = new Date().toISOString().slice(0, 10);

    // Rebuild Basic Info block in markdown body
    const marketNames: Record<string, string> = {
      us: '美股', cn: 'A股', hk: '港股', jp: '日股', kr: '韩股',
    };
    const listedVal = parsed.data.listed;
    const marketVal = parsed.data.market;
    const tickerVal = parsed.data.ticker;
    const marketDisplay = marketVal ? (marketNames[marketVal] || marketVal) : '—';

    const basicInfoContent =
      `> **上市状态：** ${listedVal ? '上市公司' : '非上市公司'}\n` +
      `> **上市地点：** ${marketDisplay}\n` +
      `> **股票代码：** ${tickerVal || '—'}`;

    let body = parsed.content;
    body = replaceSection(body, 'Basic Info', basicInfoContent);

    // Update Notes section if description changed
    if (changes.description !== undefined) {
      body = replaceSection(body, 'Notes', changes.description as string);
    }

    const newContent = matter.default.stringify(body, parsed.data);
    await atomicWrite(filePath, newContent);
  }

  /** Add conversation link to a company */
  async addConversationToCompany(
    companyName: string,
    conversationDate: string,
    contactName: string,
    summary: string,
    userId?: string
  ): Promise<void> {
    const paths = userId ? getUserVaultPaths(userId) : vaultPaths;
    // Sanitize company name for filename
    const safeName = companyName.replace(/[<>:"/\\|?*]/g, ' ');
    const filePath = path.join(paths.companies, `${safeName}.md`);
    try {
      const existing = await this.readFile(filePath);
      if (existing) {
        // Append to Related Conversations section
        const newEntry = `- [[${conversationDate} ${contactName}|${conversationDate}]] — ${summary.slice(0, 80)}...`;
        const updated = appendToSection(existing, 'Related Conversations', newEntry);
        await atomicWrite(filePath, updated);
      }
    } catch {
      // File doesn't exist, create new one
      await this.createOrUpdateCompany(companyName, [], [{ date: conversationDate, contact: contactName, summary }], undefined, undefined, undefined, undefined, undefined, undefined, userId);
    }
  }
}

function replaceSection(body: string, sectionName: string, newContent: string): string {
  const regex = new RegExp(
    `(## ${escapeRegex(sectionName)}\n)([\\s\\S]*?)(\n## |$)`,
    'm'
  );
  const match = body.match(regex);
  if (match) {
    const ending = match[3] || '';
    // ending already starts with \n if there's a next section, so only add one \n
    const separator = ending.startsWith('\n') ? '\n' : '\n\n';
    return body.replace(regex, `$1${newContent}${separator}${ending}`);
  }
  return body;
}

function appendToSection(body: string, sectionName: string, newContent: string): string {
  const regex = new RegExp(
    `(## ${escapeRegex(sectionName)}\n)([\\s\\S]*?)(\n## |$)`,
    'm'
  );
  const match = body.match(regex);
  if (match) {
    const existing = match[2].trim();
    const ending = match[3] || '';
    const combined = existing ? `${existing}\n${newContent}` : newContent;
    const separator = ending.startsWith('\n') ? '\n' : '\n\n';
    return body.replace(regex, `$1${combined}${separator}${ending}`);
  }
  return body;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Generate Starred list with all starred people and companies */
async function generateStarredList(userId?: string): Promise<string> {
  const { getDb } = await import('../db/database');
  const { ContactsRepo } = await import('../db/contacts-repo');
  const { CompaniesRepo } = await import('../db/companies-repo');

  // For now, use shared database. Per-user database can be implemented later.
  const db = getDb();
  const contactsRepo = new ContactsRepo(db);
  const companiesRepo = new CompaniesRepo(db);

  const allContacts = contactsRepo.getAll();
  const allCompanies = companiesRepo.getAll();

  const starredPeople = allContacts.filter(c => c.starred);
  const starredCompanies = allCompanies.filter(c => c.starred);

  let md = `# Starred\n\n`;
  md += `> Last updated: ${new Date().toISOString().slice(0, 10)}\n\n`;

  // People table
  md += `## People\n`;
  md += `| 联系人 | 职位 | 公司 |\n`;
  md += `| --- | --- | --- |\n`;
  for (const person of starredPeople) {
    const name = person.name || '';
    const role = person.current_role || '-';
    const org = person.current_org ? `[[${person.current_org}]]` : '-';
    md += `| [[${name}]] | ${role} | ${org} |\n`;
  }

  md += `\n## Companies\n`;
  md += `| 公司 | 行业 |\n`;
  md += `| --- | --- |\n`;
  for (const company of starredCompanies) {
    const name = company.name || '';
    const industry = company.industry || '-';
    md += `| [[${name}]] | ${industry} |\n`;
  }

  md += `\n---\n*Auto-generated. Starred status is set in each contact/company's frontmatter (\`starred: true\`).*\n`;

  return md;
}

/** Generate Data Dashboard with all contacts and companies in a table format */
export async function generateDataDashboard(userId?: string): Promise<string> {
  // For now, use shared database. Per-user database can be implemented later.
  const { getDb } = await import('../db/database');
  const { ContactsRepo } = await import('../db/contacts-repo');
  const { ConversationsRepo } = await import('../db/conversations-repo');
  const { CompaniesRepo } = await import('../db/companies-repo');
  
  const db = getDb();
  const contactsRepo = new ContactsRepo(db);
  const conversationsRepo = new ConversationsRepo(db);
  const companiesRepo = new CompaniesRepo(db);
  
  const allContacts = contactsRepo.getAll();
  const allCompanies = companiesRepo.getAll();
  
  // Build markdown
  let md = `# 📊 Data Dashboard\n\n`;
  md += `> Last updated: ${new Date().toISOString().slice(0, 10)}\n\n`;
  
  // Contacts table
  md += `## 👥 Contacts\n\n`;
  md += `| 联系人 | 职位 | Tags | 最近互动 | 详情 |\n`;
  md += `| --- | --- | --- | --- | --- |\n`;
  
  for (const contact of allContacts) {
    const name = contact.name || '';
    const role = contact.current_role || '';
    const org = contact.current_org || '';
    const position = role && org ? `${role} @ ${org}` : (role || org || '-');
    const tags = contact.tags ? contact.tags.join(', ') : '-';
    
    // Get last conversation date
    const contactId = contactsRepo.getContactId(name);
    let lastContact = '-';
    if (contactId) {
      const convs = conversationsRepo.getByContact(contactId);
      if (convs.length > 0) {
        lastContact = convs[0].date;
      }
    }
    
    // Build details column
    const industries = contact.industries ? contact.industries.join(', ') : '';
    const closeness = contact.closeness || '';
    let details = '';
    if (industries) details += `🏭 ${industries}`;
    if (closeness) details += (details ? ' | ' : '') + `🤝 ${closeness}`;
    details = details || '-';
    
    md += `| [[${name}]] | ${position} | ${tags} | ${lastContact} | ${details} |\n`;
  }
  
  // Companies table
  md += `\n## 🏢 Companies\n\n`;
  md += `| 公司 | 行业 | Tags | 相关人数 | 相关对话数 |\n`;
  md += `| --- | --- | --- | --- | --- |\n`;
  
  for (const company of allCompanies) {
    const companyData = companiesRepo.findByName(company.name);
    if (!companyData) continue;

    // Count related contacts (reuse allContacts fetched above)
    let relatedCount = 0;
    for (const c of allContacts) {
      if (c.current_org?.toLowerCase() === company.name.toLowerCase()) {
        relatedCount++;
      }
    }
    
    // Count related conversations (from company_tags)
    const allConvs = db.prepare('SELECT COUNT(*) as cnt FROM conversation_companies cc JOIN companies c ON cc.company_id = c.id WHERE c.name = ? COLLATE NOCASE').get(company.name) as { cnt: number };
    const convCount = allConvs?.cnt || 0;
    
    const industry = company.industry || '-';
    const tags = companyData.tags?.length ? companyData.tags.join(', ') : '-';
    md += `| [[${company.name}]] | ${industry} | ${tags} | ${relatedCount} | ${convCount} |\n`;
  }
  
  md += `\n---\n*This dashboard is auto-generated. Run \`/dashboard\` to refresh.*`;
  
  return md;
}

export const vaultWriter = new VaultWriter();
