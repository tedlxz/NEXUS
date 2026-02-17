import { ContactIndexEntry } from '../config';
import { getDb } from '../db/database';
import { ContactsRepo } from '../db/contacts-repo';
import { SearchService, extractKeywords } from '../db/search';

export interface BrainstormFilter {
  topic: string;
  keywords?: string[];
  industries?: string[];
  tags?: string[];
  limit?: number;
}

export class IndexManager {
  private get contacts(): ContactsRepo {
    return new ContactsRepo(getDb());
  }

  private get searchService(): SearchService {
    return new SearchService(getDb());
  }

  async getAll(): Promise<ContactIndexEntry[]> {
    return this.contacts.getAll();
  }

  async findByName(name: string): Promise<ContactIndexEntry | undefined> {
    return this.contacts.findByName(name);
  }

  async search(query: string): Promise<ContactIndexEntry[]> {
    // Try FTS first, fall back to structured search
    const ftsResults = this.searchService.searchContacts(query, 20);
    if (ftsResults.length > 0) return ftsResults;
    return this.searchService.searchStructured(query, 20);
  }

  async addOrUpdate(entry: ContactIndexEntry): Promise<void> {
    this.contacts.upsert(entry);
  }

  async addConversationSummary(name: string, summary: string): Promise<void> {
    this.contacts.addConversationSummary(name, summary);
  }

  async remove(name: string): Promise<void> {
    this.contacts.remove(name);
  }

  async getCount(): Promise<number> {
    return this.contacts.getCount();
  }

  async getContactId(name: string): Promise<number | undefined> {
    return this.contacts.getContactId(name);
  }

  /** Get index for AI. With filter: pre-filtered brainstorm set. Without: all contacts. */
  async getIndexForAI(filter?: BrainstormFilter): Promise<string> {
    if (filter) {
      const keywords = filter.keywords || extractKeywords(filter.topic);
      const relevant = this.searchService.findRelevantForBrainstorm(
        filter.topic,
        keywords,
        { industries: filter.industries, tags: filter.tags },
        filter.limit || 30
      );
      return JSON.stringify(relevant, null, 2);
    }
    const all = this.contacts.getAll();
    return JSON.stringify(all, null, 2);
  }
}

export const indexManager = new IndexManager();
