import Database from 'better-sqlite3';
import { CompanyData, ContactCompany, ConversationCompany } from '../config';

export interface CompanyRow {
  id: number;
  name: string;
  industry: string;
  tags: string;
  website: string;
  description: string;
  starred: number;
}

export class CompaniesRepo {
  constructor(private db: Database.Database) {}

  // Company CRUD
  upsertCompany(data: CompanyData, tags?: string[]): number {
    const existing = this.db.prepare(
      'SELECT id FROM companies WHERE name = ? COLLATE NOCASE'
    ).get(data.name) as { id: number } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE companies SET industry = ?, website = ?, description = ?, starred = COALESCE(?, starred), updated = date('now')
        WHERE id = ?
      `).run(data.industry || null, data.website || null, data.description || null, data.starred !== undefined ? (data.starred ? 1 : 0) : null, existing.id);
      
      // Update tags if provided
      if (tags && tags.length > 0) {
        this.setCompanyTags(existing.id, tags);
      }
      return existing.id;
    }

    const result = this.db.prepare(`
      INSERT INTO companies (name, industry, website, description, starred)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.name, data.industry || null, data.website || null, data.description || null, data.starred ? 1 : 0);
    
    const companyId = result.lastInsertRowid as number;
    
    // Add tags if provided
    if (tags && tags.length > 0) {
      this.setCompanyTags(companyId, tags);
    }
    
    return companyId;
  }

  // Company tags
  setCompanyTags(companyId: number, tags: string[]): void {
    // Remove existing tags
    this.db.prepare('DELETE FROM company_tags WHERE company_id = ?').run(companyId);
    // Add new tags
    const ins = this.db.prepare('INSERT OR IGNORE INTO company_tags (company_id, tag) VALUES (?, ?)');
    for (const tag of tags) {
      ins.run(companyId, tag);
    }
  }

  getCompanyTags(companyId: number): string[] {
    const rows = this.db.prepare(
      'SELECT tag FROM company_tags WHERE company_id = ?'
    ).all(companyId) as { tag: string }[];
    return rows.map(r => r.tag);
  }

  findByName(name: string): CompanyData | undefined {
    const row = this.db.prepare(
      'SELECT * FROM companies WHERE name = ? COLLATE NOCASE'
    ).get(name) as any;
    
    if (!row) return undefined;
    const tags = this.getCompanyTags(row.id);
    return {
      name: row.name,
      industry: row.industry,
      tags: tags.length > 0 ? tags : undefined,
      website: row.website,
      description: row.description,
      starred: row.starred === 1,
    };
  }

  getAll(): CompanyData[] {
    const rows = this.db.prepare('SELECT * FROM companies ORDER BY name').all() as any[];
    return rows.map(row => {
      const tags = this.getCompanyTags(row.id);
      return {
        name: row.name,
        industry: row.industry,
        tags: tags.length > 0 ? tags : undefined,
        website: row.website,
        description: row.description,
        starred: row.starred === 1,
      };
    });
  }

  removeByName(name: string): void {
    const existing = this.db.prepare(
      'SELECT id FROM companies WHERE name = ? COLLATE NOCASE'
    ).get(name) as { id: number } | undefined;
    if (!existing) return;

    // CASCADE handles company_tags, contact_companies, conversation_companies
    this.db.prepare('DELETE FROM companies WHERE id = ?').run(existing.id);
  }

  // Contact-Company relationships
  setContactCompany(contactId: number, companyId: number, relationship: 'current' | 'past', role?: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO contact_companies (contact_id, company_id, relationship, role)
      VALUES (?, ?, ?, ?)
    `).run(contactId, companyId, relationship, role || null);
  }

  getContactCompanies(contactId: number): ContactCompany[] {
    return this.db.prepare(`
      SELECT cc.*, c.name as company_name, c.industry as company_industry
      FROM contact_companies cc
      JOIN companies c ON cc.company_id = c.id
      WHERE cc.contact_id = ?
      ORDER BY cc.relationship, c.name
    `).all(contactId) as ContactCompany[];
  }

  getContactCurrentCompany(contactId: number): ContactCompany | undefined {
    return this.db.prepare(`
      SELECT cc.*, c.name as company_name, c.industry as company_industry
      FROM contact_companies cc
      JOIN companies c ON cc.company_id = c.id
      WHERE cc.contact_id = ? AND cc.relationship = 'current'
      LIMIT 1
    `).get(contactId) as ContactCompany | undefined;
  }

  getContactPastCompanies(contactId: number): ContactCompany[] {
    return this.db.prepare(`
      SELECT cc.*, c.name as company_name, c.industry as company_industry
      FROM contact_companies cc
      JOIN companies c ON cc.company_id = c.id
      WHERE cc.contact_id = ? AND cc.relationship = 'past'
      ORDER BY c.name
    `).all(contactId) as ContactCompany[];
  }

  // Conversation-Company tags
  addConversationCompany(conversationId: number, companyId: number): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO conversation_companies (conversation_id, company_id)
      VALUES (?, ?)
    `).run(conversationId, companyId);
  }

  getConversationCompanies(conversationId: number): ConversationCompany[] {
    return this.db.prepare(`
      SELECT cc.*, c.name as company_name, c.industry as company_industry
      FROM conversation_companies cc
      JOIN companies c ON cc.company_id = c.id
      WHERE cc.conversation_id = ?
      ORDER BY c.name
    `).all(conversationId) as ConversationCompany[];
  }

  // Find or create company by name
  findOrCreateCompany(name: string): number {
    const existing = this.findByName(name);
    if (existing) {
      const row = this.db.prepare('SELECT id FROM companies WHERE name = ? COLLATE NOCASE').get(name) as { id: number };
      return row.id;
    }
    return this.upsertCompany({ name });
  }

  // Get companies mentioned in a conversation (by company names)
  addConversationCompaniesByNames(conversationId: number, companyNames: string[]): void {
    for (const name of companyNames) {
      const companyId = this.findOrCreateCompany(name);
      this.addConversationCompany(conversationId, companyId);
    }
  }
}
