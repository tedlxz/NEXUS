import Database from 'better-sqlite3';

export interface ConversationRow {
  id?: number;
  contact_id: number;
  date: string;
  source?: string;
  location?: string;
  occasion?: string;
  initiated_by?: string;
  sentiment?: string;
  relationship_signal?: string;
  follow_up_date?: string;
  follow_up_context?: string;
  ai_summary?: string;
  key_topics?: string;
  core_insights?: string;
  mentioned_companies?: string;
  mentioned_people?: string;
  mentioned_deals?: string;
  file?: string;
}

export class ConversationsRepo {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  insert(data: ConversationRow, contactName: string): number {
    const result = this.db.prepare(`
      INSERT INTO conversations (
        contact_id, date, source, location, occasion,
        initiated_by, sentiment, relationship_signal,
        follow_up_date, follow_up_context,
        ai_summary, key_topics, core_insights,
        mentioned_companies, mentioned_people, mentioned_deals, file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.contact_id, data.date, data.source || null,
      data.location || null, data.occasion || null,
      data.initiated_by || null, data.sentiment || null,
      data.relationship_signal || null,
      data.follow_up_date || null, data.follow_up_context || null,
      data.ai_summary || null, data.key_topics || null,
      data.core_insights || null,
      data.mentioned_companies || null, data.mentioned_people || null,
      data.mentioned_deals || null, data.file || null
    );

    const convId = result.lastInsertRowid as number;

    // Insert into FTS
    this.db.prepare(`
      INSERT INTO fts_conversations(
        rowid, contact_name, ai_summary, key_topics, core_insights,
        mentioned_companies, mentioned_people, mentioned_deals
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      convId, contactName,
      data.ai_summary || '', data.key_topics || '',
      data.core_insights || '',
      data.mentioned_companies || '', data.mentioned_people || '',
      data.mentioned_deals || ''
    );

    return convId;
  }

  getByContact(contactId: number): ConversationRow[] {
    return this.db.prepare(
      'SELECT * FROM conversations WHERE contact_id = ? ORDER BY date DESC'
    ).all(contactId) as ConversationRow[];
  }

  getByDateRange(from: string, to: string): ConversationRow[] {
    return this.db.prepare(
      'SELECT * FROM conversations WHERE date >= ? AND date <= ? ORDER BY date DESC'
    ).all(from, to) as ConversationRow[];
  }
}
