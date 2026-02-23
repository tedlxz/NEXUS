import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { getDb } from './database';
import { ContactsRepo } from './contacts-repo';
import { CompaniesRepo } from './companies-repo';
import { ConversationsRepo } from './conversations-repo';
import { vaultPaths } from '../config';
import { vaultWriter } from '../vault/writer';
import { detectListedCompanyWithAI } from '../newsflow/services/starDataLoader';
import type { StockMarket } from '../newsflow/types';

/**
 * Auto-create company from contact's current_org if it doesn't exist.
 * Uses AI to detect if the company is listed and get ticker info.
 */
async function ensureCompanyFromContact(
  companiesRepo: CompaniesRepo,
  companyName: string
): Promise<number> {
  // Check if company already exists
  const existing = companiesRepo.findByName(companyName);
  if (existing && existing.id) {
    return existing.id;
  }

  console.log(`[Sync] Creating new company from contact: ${companyName}`);

  // Use AI to detect if listed
  let isListed = false;
  let ticker: string | undefined;
  let market: 'us' | 'hk' | 'cn' | 'jp' | 'kr' | undefined;

  try {
    const result = await detectListedCompanyWithAI(companyName);
    isListed = result.isListed;
    ticker = result.ticker;
    // Only use valid markets (filter out 'other' and any invalid values)
    if (result.market && ['us', 'hk', 'cn', 'jp', 'kr'].includes(result.market)) {
      market = result.market as 'us' | 'hk' | 'cn' | 'jp' | 'kr';
    }
    console.log(`[Sync] AI detection for ${companyName}: listed=${isListed}, ticker=${ticker}, market=${market}`);
  } catch (err) {
    console.error(`[Sync] AI detection failed for ${companyName}:`, err);
  }

  // Build description with ticker info
  let description = '';
  if (isListed && ticker && market) {
    const marketNames: Record<string, string> = { us: 'US', hk: 'HK', cn: 'CN' };
    description = `Listed on ${marketNames[market] || market} (${ticker})`;
  }

  // Create the company
  const companyId = companiesRepo.upsertCompany({
    name: companyName,
    description: description || undefined,
    listed: isListed,
    ticker: ticker,
    market: market,
  });

  // Also create the Obsidian file for the company
  await createCompanyObsidianFile(companyName, isListed, ticker, market);

  return companyId;
}

/**
 * Create a company .md file in Obsidian if it doesn't exist
 */
async function createCompanyObsidianFile(
  name: string,
  isListed: boolean,
  ticker?: string,
  market?: 'us' | 'hk' | 'cn' | 'jp' | 'kr'
): Promise<void> {
  const companiesDir = vaultPaths.companies;
  const fileName = `${name}.md`;
  const filePath = path.join(companiesDir, fileName);

  try {
    await fs.access(filePath);
    // File already exists
    return;
  } catch {
    // File doesn't exist, create it
  }

  let tickerLine = '';
  if (isListed && ticker && market) {
    tickerLine = `ticker: ${ticker}\nmarket: ${market}\n`;
  }

  const content = `---
type: company
name: "${name}"
${tickerLine}industries: []
tags: []
starred: false
---

# ${name}

## Overview



## Key Contacts



## Recent News



## Notes
`;

  await fs.writeFile(filePath, content, 'utf-8');
  console.log(`[Sync] Created company file: ${fileName}`);
}

/**
 * Update contact-company relationship in the database
 */
function updateContactCompanyRelationship(
  db: ReturnType<typeof getDb>,
  contactId: number,
  companyId: number,
  role?: string
): void {
  // Check if relationship already exists
  const existing = db.prepare(`
    SELECT id FROM contact_companies 
    WHERE contact_id = ? AND company_id = ? AND relationship = 'current'
  `).get(contactId, companyId) as { id: number } | undefined;

  if (!existing) {
    db.prepare(`
      INSERT INTO contact_companies (contact_id, company_id, relationship, role)
      VALUES (?, ?, 'current', ?)
    `).run(contactId, companyId, role || null);
    console.log(`[Sync] Linked contact ${contactId} to company ${companyId}`);
  }
}

/**
 * Sync Obsidian vault changes back to SQL database.
 * This is a FULL sync: upserts everything from Obsidian AND deletes
 * SQL records that no longer have corresponding Obsidian files.
 */
export async function syncFromObsidian(): Promise<{
  contactsUpdated: number;
  contactsDeleted: number;
  companiesUpdated: number;
  companiesDeleted: number;
  conversationsUpdated: number;
}> {
  console.log('[Sync] Starting Obsidian -> SQL sync...');

  const db = getDb();
  const contactsRepo = new ContactsRepo(db);
  const companiesRepo = new CompaniesRepo(db);
  const conversationsRepo = new ConversationsRepo(db);

  let contactsUpdated = 0;
  let contactsDeleted = 0;
  let companiesUpdated = 0;
  let companiesDeleted = 0;
  let conversationsUpdated = 0;

  // ── Sync People ──
  const obsidianContactNames = new Set<string>();

  try {
    const peopleDir = vaultPaths.people;
    const peopleFiles = await fs.readdir(peopleDir);

    for (const file of peopleFiles) {
      if (!file.endsWith('.md')) continue;

      try {
        const filePath = path.join(peopleDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(content);

        if (data.type !== 'person') continue;

        const name = data.name || file.replace('.md', '');
        const current_role = data.current_role || null;
        const current_org = data.current_org?.replace(/^\[\[|\]\]$/g, '') || null;
        const closeness = data.closeness || 'medium';
        const starred = data.starred === true;
        const industries = data.industries || [];
        const tags = data.tags || [];

        obsidianContactNames.add(name.toLowerCase());

        contactsRepo.upsert({
          name,
          file: `People/${file}`,
          current_role,
          current_org,
          closeness,
          starred,
          industries,
          tags,
        });

        // Auto-create company if current_org exists
        if (current_org) {
          await ensureCompanyFromContact(companiesRepo, current_org);
          
          // Update contact-company relationship
          const company = companiesRepo.findByName(current_org);
          const contact = contactsRepo.findByName(name);
          if (company && contact && company.id && contact.id) {
            updateContactCompanyRelationship(db, contact.id, company.id, current_role);
          }
        }

        contactsUpdated++;
      } catch (err) {
        console.error(`[Sync] Error processing ${file}:`, err);
      }
    }
  } catch (err) {
    console.error('[Sync] Error reading People directory:', err);
  }

  // Delete contacts from SQL that no longer exist in Obsidian
  const allSqlContacts = contactsRepo.getAll();
  for (const contact of allSqlContacts) {
    if (!obsidianContactNames.has(contact.name.toLowerCase())) {
      console.log(`[Sync] Deleting contact from SQL (no Obsidian file): ${contact.name}`);
      contactsRepo.remove(contact.name);
      contactsDeleted++;
    }
  }

  // ── Sync Companies ──
  const obsidianCompanyNames = new Set<string>();

  try {
    const companiesDir = vaultPaths.companies;
    const companiesFiles = await fs.readdir(companiesDir);

    for (const file of companiesFiles) {
      if (!file.endsWith('.md')) continue;

      try {
        const filePath = path.join(companiesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(content);

        if (data.type !== 'company') continue;

        const name = data.name || file.replace('.md', '');
        const industry = data.industry || null;
        const tags = data.tags || [];
        const website = data.website || null;
        const description = data.description || null;
        const starred = data.starred === true;

        obsidianCompanyNames.add(name.toLowerCase());

        companiesRepo.upsertCompany({ name, industry, tags, website, description, starred }, tags);

        companiesUpdated++;
      } catch (err) {
        console.error(`[Sync] Error processing ${file}:`, err);
      }
    }
  } catch (err) {
    console.error('[Sync] Error reading Companies directory:', err);
  }

  // Delete companies from SQL that no longer exist in Obsidian
  const allSqlCompanies = companiesRepo.getAll();
  for (const company of allSqlCompanies) {
    if (!obsidianCompanyNames.has(company.name.toLowerCase())) {
      console.log(`[Sync] Deleting company from SQL (no Obsidian file): ${company.name}`);
      companiesRepo.removeByName(company.name);
      companiesDeleted++;
    }
  }

  console.log(`[Sync] Complete: ${contactsUpdated} contacts synced, ${contactsDeleted} deleted; ${companiesUpdated} companies synced, ${companiesDeleted} deleted`);
  
  // Regenerate Starred.md and Data Dashboard after sync
  await vaultWriter.saveStarredList();
  await vaultWriter.saveDashboard();
  
  return { contactsUpdated, contactsDeleted, companiesUpdated, companiesDeleted, conversationsUpdated };
}

/**
 * Sync a single Person file from Obsidian to SQL.
 * Called by the file watcher when a file is added or changed.
 */
export async function syncSinglePerson(filePath: string): Promise<void> {
  const db = getDb();
  const contactsRepo = new ContactsRepo(db);
  const companiesRepo = new CompaniesRepo(db);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data } = matter(content);

    if (data.type !== 'person') return;

    const file = path.basename(filePath);
    const name = data.name || file.replace('.md', '');
    const current_role = data.current_role || null;
    const current_org = data.current_org?.replace(/^\[\[|\]\]$/g, '') || null;
    const closeness = data.closeness || 'medium';
    const starred = data.starred === true;
    const industries = data.industries || [];
    const tags = data.tags || [];

    // Upsert contact
    contactsRepo.upsert({
      name,
      file: `People/${file}`,
      current_role,
      current_org,
      closeness,
      starred,
      industries,
      tags,
    });

    // Auto-create company if current_org exists and doesn't already exist
    if (current_org) {
      await ensureCompanyFromContact(companiesRepo, current_org);
      
      // Update contact-company relationship
      const company = companiesRepo.findByName(current_org);
      const contact = contactsRepo.findByName(name);
      if (company && contact && company.id && contact.id) {
        updateContactCompanyRelationship(db, contact.id, company.id, current_role);
      }
    }

    console.log(`[Sync] Updated contact: ${name}`);
  } catch (err) {
    console.error(`[Sync] Error syncing person ${filePath}:`, err);
  }
}

/**
 * Remove a Person from SQL by their Obsidian file path.
 * Called by the file watcher when a file is deleted.
 */
export function removePerson(filePath: string): void {
  const db = getDb();
  const contactsRepo = new ContactsRepo(db);

  // Derive name from filename (People/张三.md → 张三)
  const fileName = path.basename(filePath, '.md');
  const existing = contactsRepo.findByName(fileName);

  if (existing) {
    contactsRepo.remove(existing.name);
    console.log(`[Sync] Deleted contact: ${existing.name}`);
  } else {
    // Try matching by file path
    const relPath = `People/${path.basename(filePath)}`;
    const allContacts = contactsRepo.getAll();
    const match = allContacts.find(c => c.file === relPath);
    if (match) {
      contactsRepo.remove(match.name);
      console.log(`[Sync] Deleted contact (by file): ${match.name}`);
    }
  }
}

/**
 * Sync a single Company file from Obsidian to SQL.
 */
export async function syncSingleCompany(filePath: string): Promise<void> {
  const db = getDb();
  const companiesRepo = new CompaniesRepo(db);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data } = matter(content);

    if (data.type !== 'company') return;

    const file = path.basename(filePath);
    const name = data.name || file.replace('.md', '');
    const industry = data.industry || null;
    const tags = data.tags || [];
    const website = data.website || null;
    const description = data.description || null;
    const starred = data.starred === true;

    companiesRepo.upsertCompany({ name, industry, tags, website, description, starred }, tags);

    console.log(`[Sync] Updated company: ${name}`);
  } catch (err) {
    console.error(`[Sync] Error syncing company ${filePath}:`, err);
  }
}

/**
 * Remove a Company from SQL by their Obsidian file path.
 */
export function removeCompany(filePath: string): void {
  const db = getDb();
  const companiesRepo = new CompaniesRepo(db);

  const fileName = path.basename(filePath, '.md');
  companiesRepo.removeByName(fileName);
  console.log(`[Sync] Deleted company: ${fileName}`);
}

// Run if called directly
if (require.main === module) {
  syncFromObsidian()
    .then(result => {
      console.log('Sync result:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('Sync error:', err);
      process.exit(1);
    });
}
