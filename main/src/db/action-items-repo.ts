import Database from 'better-sqlite3';
import { ActionItem, ActionOwner, ActionStatus } from '../config';
import { randomUUID } from 'crypto';

export class ActionItemsRepo {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  add(item: {
    description: string;
    owner: ActionOwner | string;
    due_date?: string;
    source_conversation?: string;
    contact?: string;
  }): ActionItem {
    const id = randomUUID().slice(0, 8);
    const created = new Date().toISOString().slice(0, 10);

    // Sanitize owner — AI may return unexpected values (person names, Chinese text, etc.)
    const validOwners: ActionOwner[] = ['me', 'them', 'both'];
    const owner: ActionOwner = validOwners.includes(item.owner as ActionOwner)
      ? (item.owner as ActionOwner)
      : 'me';

    this.db.prepare(`
      INSERT INTO action_items (id, description, owner, due_date, status, source_conversation, contact, created)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(id, item.description, owner, item.due_date || null,
      item.source_conversation || null, item.contact || null, created);

    return {
      id,
      description: item.description,
      owner,
      due_date: item.due_date,
      status: 'pending',
      source_conversation: item.source_conversation,
      contact: item.contact,
      created,
    };
  }

  complete(id: string): boolean {
    const result = this.db.prepare(
      "UPDATE action_items SET status = 'done' WHERE id = ?"
    ).run(id);
    return result.changes > 0;
  }

  cancel(id: string): boolean {
    const result = this.db.prepare(
      "UPDATE action_items SET status = 'cancelled' WHERE id = ?"
    ).run(id);
    return result.changes > 0;
  }

  updateStatus(id: string, status: ActionStatus): boolean {
    const result = this.db.prepare(
      'UPDATE action_items SET status = ? WHERE id = ?'
    ).run(status, id);
    return result.changes > 0;
  }

  getPending(): ActionItem[] {
    return this.db.prepare(
      "SELECT * FROM action_items WHERE status = 'pending' ORDER BY due_date ASC"
    ).all() as ActionItem[];
  }

  getByContact(contact: string): ActionItem[] {
    return this.db.prepare(
      'SELECT * FROM action_items WHERE contact = ? COLLATE NOCASE ORDER BY created DESC'
    ).all(contact) as ActionItem[];
  }

  getOverdue(): ActionItem[] {
    return this.db.prepare(
      "SELECT * FROM action_items WHERE status = 'pending' AND due_date IS NOT NULL AND due_date < date('now') ORDER BY due_date ASC"
    ).all() as ActionItem[];
  }

  getFollowUps(): ActionItem[] {
    return this.db.prepare(
      "SELECT * FROM action_items WHERE status = 'pending' AND due_date IS NOT NULL AND due_date <= date('now') ORDER BY due_date ASC"
    ).all() as ActionItem[];
  }

  getAll(): ActionItem[] {
    return this.db.prepare(
      'SELECT * FROM action_items ORDER BY created DESC'
    ).all() as ActionItem[];
  }
}
