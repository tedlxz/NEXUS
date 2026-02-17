import Database from 'better-sqlite3';
import { ContactIndexEntry } from '../config';

export class ContactsRepo {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  findByName(name: string): ContactIndexEntry | undefined {
    const row = this.db.prepare(
      'SELECT * FROM contacts WHERE name = ? COLLATE NOCASE'
    ).get(name) as any;
    if (!row) return undefined;
    return this.hydrateEntry(row);
  }

  findById(id: number): ContactIndexEntry | undefined {
    const row = this.db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this.hydrateEntry(row);
  }

  getAll(): ContactIndexEntry[] {
    const rows = this.db.prepare('SELECT * FROM contacts ORDER BY name').all() as any[];
    return rows.map(r => this.hydrateEntry(r));
  }

  getCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM contacts').get() as any;
    return row.cnt;
  }

  upsert(entry: ContactIndexEntry): number {
    const txn = this.db.transaction(() => {
      const existing = this.db.prepare(
        'SELECT id FROM contacts WHERE name = ? COLLATE NOCASE'
      ).get(entry.name) as any;

      let contactId: number;

      if (existing) {
        contactId = existing.id;
        this.db.prepare(`
          UPDATE contacts SET
            file = COALESCE(?, file),
            current_role = COALESCE(?, current_role),
            current_org = COALESCE(?, current_org),
            closeness = COALESCE(?, closeness),
            starred = COALESCE(?, starred),
            last_contact = COALESCE(?, last_contact),
            updated = date('now')
          WHERE id = ?
        `).run(
          entry.file, entry.current_role, entry.current_org,
          entry.closeness,
          entry.starred !== undefined ? (entry.starred ? 1 : 0) : null,
          entry.last_contact, contactId
        );
      } else {
        const result = this.db.prepare(`
          INSERT INTO contacts (name, file, current_role, current_org, closeness, starred, last_contact)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          entry.name, entry.file, entry.current_role || null,
          entry.current_org || null, entry.closeness || null,
          entry.starred ? 1 : 0,
          entry.last_contact || null
        );
        contactId = result.lastInsertRowid as number;
      }

      // Replace industries
      this.db.prepare('DELETE FROM contact_industries WHERE contact_id = ?').run(contactId);
      if (entry.industries?.length) {
        const ins = this.db.prepare(
          'INSERT OR IGNORE INTO contact_industries (contact_id, industry) VALUES (?, ?)'
        );
        for (const ind of entry.industries) {
          ins.run(contactId, ind);
        }
      }

      // Replace tags
      this.db.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(contactId);
      if (entry.tags?.length) {
        const ins = this.db.prepare(
          'INSERT OR IGNORE INTO contact_tags (contact_id, tag) VALUES (?, ?)'
        );
        for (const tag of entry.tags) {
          ins.run(contactId, tag);
        }
      }

      // Rebuild FTS for this contact
      this.rebuildFtsForContact(contactId);

      return contactId;
    });

    return txn();
  }

  addConversationSummary(name: string, summary: string): void {
    const contact = this.db.prepare(
      'SELECT id FROM contacts WHERE name = ? COLLATE NOCASE'
    ).get(name) as any;
    if (!contact) return;

    this.db.prepare(
      'INSERT INTO conversation_summaries (contact_id, summary) VALUES (?, ?)'
    ).run(contact.id, summary);

    this.db.prepare(
      "UPDATE contacts SET last_contact = date('now'), updated = date('now') WHERE id = ?"
    ).run(contact.id);
  }

  remove(name: string): void {
    const contact = this.db.prepare(
      'SELECT id FROM contacts WHERE name = ? COLLATE NOCASE'
    ).get(name) as any;
    if (!contact) return;

    // Remove FTS entry first
    this.removeFtsForContact(contact.id);

    // CASCADE handles industries, tags, summaries
    this.db.prepare('DELETE FROM contacts WHERE id = ?').run(contact.id);
  }

  getContactId(name: string): number | undefined {
    const row = this.db.prepare(
      'SELECT id FROM contacts WHERE name = ? COLLATE NOCASE'
    ).get(name) as any;
    return row?.id;
  }

  private hydrateEntry(row: any): ContactIndexEntry {
    const industries = this.db.prepare(
      'SELECT industry FROM contact_industries WHERE contact_id = ?'
    ).all(row.id) as any[];

    const tags = this.db.prepare(
      'SELECT tag FROM contact_tags WHERE contact_id = ?'
    ).all(row.id) as any[];

    const summaries = this.db.prepare(
      'SELECT summary FROM conversation_summaries WHERE contact_id = ? ORDER BY created DESC LIMIT 10'
    ).all(row.id) as any[];

    return {
      name: row.name,
      file: row.file,
      current_role: row.current_role || undefined,
      current_org: row.current_org || undefined,
      industries: industries.map(i => i.industry),
      closeness: row.closeness || undefined,
      starred: row.starred === 1,
      last_contact: row.last_contact || undefined,
      tags: tags.map(t => t.tag),
      recent_conversations_summary: summaries.map(s => s.summary),
      created: row.created || undefined,
    };
  }

  rebuildFtsForContact(contactId: number): void {
    const contact = this.db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId) as any;
    if (!contact) return;

    const industries = this.db.prepare(
      'SELECT industry FROM contact_industries WHERE contact_id = ?'
    ).all(contactId) as any[];
    const tags = this.db.prepare(
      'SELECT tag FROM contact_tags WHERE contact_id = ?'
    ).all(contactId) as any[];

    const industriesStr = industries.map(i => i.industry).join(' ');
    const tagsStr = tags.map(t => t.tag).join(' ');

    // Delete old FTS entry (if exists)
    this.removeFtsForContact(contactId);

    // Insert new FTS entry
    this.db.prepare(`
      INSERT INTO fts_contacts(rowid, name, current_role, current_org, industries, tags, how_we_met)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      contactId,
      contact.name || '',
      contact.current_role || '',
      contact.current_org || '',
      industriesStr,
      tagsStr,
      contact.how_we_met || ''
    );
  }

  private removeFtsForContact(contactId: number): void {
    // Simply delete from FTS table
    try {
      this.db.prepare('DELETE FROM fts_contacts WHERE rowid = ?').run(contactId);
    } catch (err) {
      // Ignore if FTS entry doesn't exist
    }
  }
}
