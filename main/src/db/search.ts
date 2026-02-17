import Database from 'better-sqlite3';
import { ContactIndexEntry } from '../config';
import { ContactsRepo } from './contacts-repo';

export interface SearchResult {
  type: 'contact' | 'conversation';
  contactName: string;
  snippet: string;
  rank: number;
  entry?: ContactIndexEntry;
}

// Chinese and English stop words to exclude from keyword extraction
const STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
  'through', 'after', 'before', 'above', 'below', 'and', 'or', 'but',
  'not', 'no', 'if', 'then', 'so', 'than', 'that', 'this', 'these',
  'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
  'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their', 'what',
  'which', 'who', 'whom', 'where', 'when', 'how', 'find', 'help',
  // Chinese
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会',
  '着', '没有', '看', '好', '自己', '这', '他', '她', '们', '那',
  '个', '吗', '把', '让', '给', '但', '还', '可以', '想', '能',
  '帮', '帮我', '找', '找找', '看看', '什么', '这个', '那个',
  '关于', '相关', '可能', '现在', '正在',
]);

export function extractKeywords(text: string): string[] {
  // Split on whitespace and punctuation (keeps Chinese characters together in chunks)
  const tokens = text
    .toLowerCase()
    .split(/[\s,，。！？、；：""''（）【】\-—·/\\|@#$%^&*()+=\[\]{}<>~`]+/)
    .filter(t => t.length > 0)
    .filter(t => !STOP_WORDS.has(t));

  // Deduplicate
  return [...new Set(tokens)];
}

export class SearchService {
  private db: Database.Database;
  private contactsRepo: ContactsRepo;

  constructor(db: Database.Database) {
    this.db = db;
    this.contactsRepo = new ContactsRepo(db);
  }

  /** Full-text search across contacts */
  searchContacts(query: string, limit: number = 20): ContactIndexEntry[] {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return [];

    const ftsQuery = keywords.map(k => `"${k}"`).join(' OR ');

    try {
      const rows = this.db.prepare(`
        SELECT rowid, rank FROM fts_contacts
        WHERE fts_contacts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, limit) as any[];

      return rows
        .map(r => this.contactsRepo.findById(r.rowid))
        .filter((e): e is ContactIndexEntry => e !== undefined);
    } catch {
      // FTS query syntax error — fall back to structured search
      return this.searchStructured(query, limit);
    }
  }

  /** Structured search (LIKE-based fallback) */
  searchStructured(query: string, limit: number = 20): ContactIndexEntry[] {
    const pattern = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT DISTINCT c.id FROM contacts c
      LEFT JOIN contact_industries ci ON ci.contact_id = c.id
      LEFT JOIN contact_tags ct ON ct.contact_id = c.id
      WHERE c.name LIKE ? COLLATE NOCASE
        OR c.current_role LIKE ? COLLATE NOCASE
        OR c.current_org LIKE ? COLLATE NOCASE
        OR ci.industry LIKE ? COLLATE NOCASE
        OR ct.tag LIKE ? COLLATE NOCASE
      LIMIT ?
    `).all(pattern, pattern, pattern, pattern, pattern, limit) as any[];

    return rows
      .map(r => this.contactsRepo.findById(r.id))
      .filter((e): e is ContactIndexEntry => e !== undefined);
  }

  /** Full-text search across conversations, returns contact entries */
  searchConversations(query: string, limit: number = 20): ContactIndexEntry[] {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return [];

    const ftsQuery = keywords.map(k => `"${k}"`).join(' OR ');

    try {
      const rows = this.db.prepare(`
        SELECT DISTINCT cv.contact_id
        FROM fts_conversations
        JOIN conversations cv ON cv.id = fts_conversations.rowid
        WHERE fts_conversations MATCH ?
        LIMIT ?
      `).all(ftsQuery, limit) as any[];

      return rows
        .map(r => this.contactsRepo.findById(r.contact_id))
        .filter((e): e is ContactIndexEntry => e !== undefined);
    } catch {
      return [];
    }
  }

  /** Combined search across contacts and conversations */
  search(query: string, limit: number = 20): SearchResult[] {
    const contactResults = this.searchContacts(query, limit);
    const convResults = this.searchConversations(query, limit);

    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (const entry of contactResults) {
      if (!seen.has(entry.name)) {
        seen.add(entry.name);
        results.push({
          type: 'contact',
          contactName: entry.name,
          snippet: [entry.current_role, entry.current_org].filter(Boolean).join(' @ '),
          rank: 1,
          entry,
        });
      }
    }

    for (const entry of convResults) {
      if (!seen.has(entry.name)) {
        seen.add(entry.name);
        results.push({
          type: 'conversation',
          contactName: entry.name,
          snippet: `Discussed in conversation`,
          rank: 0.5,
          entry,
        });
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Pre-filter contacts for brainstorm.
   * Multi-phase scoring: FTS contacts + FTS conversations + structured filters + closeness/recency bonus.
   * Returns top N contacts with full data.
   */
  findRelevantForBrainstorm(
    topic: string,
    keywords: string[],
    filters?: {
      industries?: string[];
      tags?: string[];
    },
    limit: number = 30
  ): ContactIndexEntry[] {
    const scores = new Map<number, number>();

    // If keywords provided, run FTS
    if (keywords.length > 0) {
      const ftsQuery = keywords.map(k => `"${k}"`).join(' OR ');

      // Phase 1: FTS contact match
      try {
        const contactHits = this.db.prepare(`
          SELECT rowid, rank FROM fts_contacts WHERE fts_contacts MATCH ?
        `).all(ftsQuery) as any[];

        for (const hit of contactHits) {
          scores.set(hit.rowid, (scores.get(hit.rowid) || 0) + Math.abs(hit.rank) * 10);
        }
      } catch { /* invalid FTS query, skip */ }

      // Phase 2: FTS conversation match
      try {
        const convHits = this.db.prepare(`
          SELECT cv.contact_id, rank FROM fts_conversations
          JOIN conversations cv ON cv.id = fts_conversations.rowid
          WHERE fts_conversations MATCH ?
        `).all(ftsQuery) as any[];

        for (const hit of convHits) {
          scores.set(hit.contact_id, (scores.get(hit.contact_id) || 0) + Math.abs(hit.rank) * 5);
        }
      } catch { /* invalid FTS query, skip */ }
    }

    // Phase 3: Structured filters boost
    if (filters?.industries?.length) {
      const placeholders = filters.industries.map(() => '?').join(',');
      const industryHits = this.db.prepare(`
        SELECT contact_id FROM contact_industries
        WHERE industry IN (${placeholders})
      `).all(...filters.industries) as any[];

      for (const hit of industryHits) {
        scores.set(hit.contact_id, (scores.get(hit.contact_id) || 0) + 20);
      }
    }

    if (filters?.tags?.length) {
      const placeholders = filters.tags.map(() => '?').join(',');
      const tagHits = this.db.prepare(`
        SELECT contact_id FROM contact_tags
        WHERE tag IN (${placeholders})
      `).all(...filters.tags) as any[];

      for (const hit of tagHits) {
        scores.set(hit.contact_id, (scores.get(hit.contact_id) || 0) + 15);
      }
    }

    // If no results from FTS/filters, return all contacts (small DB fallback)
    if (scores.size === 0) {
      const totalCount = this.contactsRepo.getCount();
      if (totalCount <= limit) {
        return this.contactsRepo.getAll();
      }
      // For large DBs with no keyword match, return most recently contacted
      const rows = this.db.prepare(`
        SELECT id FROM contacts ORDER BY last_contact DESC NULLS LAST LIMIT ?
      `).all(limit) as any[];
      return rows
        .map(r => this.contactsRepo.findById(r.id))
        .filter((e): e is ContactIndexEntry => e !== undefined);
    }

    // Phase 4: Closeness and recency bonuses
    const today = new Date().toISOString().slice(0, 10);
    for (const [contactId, score] of scores) {
      const contact = this.db.prepare(
        'SELECT closeness, last_contact FROM contacts WHERE id = ?'
      ).get(contactId) as any;

      if (!contact) continue;

      let bonus = 0;
      if (contact.closeness === 'close') bonus += 15;
      else if (contact.closeness === 'medium') bonus += 5;

      if (contact.last_contact) {
        const daysAgo = daysBetween(contact.last_contact, today);
        if (daysAgo < 90) bonus += 10;
        else if (daysAgo < 180) bonus += 5;
      }

      scores.set(contactId, score + bonus);
    }

    // Sort by score descending, take top N
    const ranked = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    console.log(`[Search] Brainstorm pre-filter: ${scores.size} candidates → top ${ranked.length}`);

    return ranked
      .map(([id]) => this.contactsRepo.findById(id))
      .filter((e): e is ContactIndexEntry => e !== undefined);
  }
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(Math.round((b - a) / (1000 * 60 * 60 * 24)));
}
