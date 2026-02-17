import { ActionItem, ActionOwner, ActionStatus } from '../config';
import { getDb } from '../db/database';
import { ActionItemsRepo } from '../db/action-items-repo';

export class ActionItemsManager {
  private get repo(): ActionItemsRepo {
    return new ActionItemsRepo(getDb());
  }

  async add(item: {
    description: string;
    owner: ActionOwner;
    due_date?: string;
    source_conversation?: string;
    contact?: string;
  }): Promise<ActionItem> {
    return this.repo.add(item);
  }

  async complete(id: string): Promise<boolean> {
    return this.repo.complete(id);
  }

  async cancel(id: string): Promise<boolean> {
    return this.repo.cancel(id);
  }

  async updateStatus(id: string, status: ActionStatus): Promise<boolean> {
    return this.repo.updateStatus(id, status);
  }

  async getPending(): Promise<ActionItem[]> {
    return this.repo.getPending();
  }

  async getByContact(contact: string): Promise<ActionItem[]> {
    return this.repo.getByContact(contact);
  }

  async getOverdue(): Promise<ActionItem[]> {
    return this.repo.getOverdue();
  }

  async getFollowUps(): Promise<ActionItem[]> {
    return this.repo.getFollowUps();
  }

  async getAll(): Promise<ActionItem[]> {
    return this.repo.getAll();
  }

  async formatPendingList(): Promise<string> {
    const pending = await this.getPending();
    if (pending.length === 0) return 'No pending action items.';

    return pending.map(item => {
      let line = `• ${item.description}`;
      if (item.contact) line += ` (${item.contact})`;
      if (item.owner !== 'me') line += ` [owner: ${item.owner}]`;
      if (item.due_date) line += ` — due ${item.due_date}`;
      return line;
    }).join('\n');
  }
}

export const actionItemsManager = new ActionItemsManager();
