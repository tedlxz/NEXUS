import Database from 'better-sqlite3';
import fs from 'fs';
import { vaultPaths } from '../config';
import { CURRENT_SCHEMA_VERSION } from './schema';

interface OldContactIndex {
  contacts: Array<{
    name: string;
    file: string;
    current_role?: string;
    current_org?: string;
    industries?: string[];
    closeness?: string;
    last_contact?: string;
    tags?: string[];
    recent_conversations_summary?: string[];
  }>;
}

interface OldActionItems {
  items: Array<{
    id: string;
    description: string;
    owner: string;
    due_date?: string;
    status: string;
    source_conversation?: string;
    contact?: string;
    created: string;
  }>;
}

export function runMigrationIfNeeded(db: Database.Database): void {
  // Check current schema version
  const versionRow = db.prepare(
    'SELECT MAX(version) as ver FROM schema_version'
  ).get() as any;
  const currentVer = versionRow?.ver ?? 0;

  // Run initial JSON → SQLite migration if needed
  if (currentVer < 1) {
  console.log('[Migration] Migrating from JSON to SQLite...');

  const txn = db.transaction(() => {
    // Migrate index.json
    const indexPath = vaultPaths.index;
    if (fs.existsSync(indexPath)) {
      try {
        const raw = fs.readFileSync(indexPath, 'utf-8');
        const data: OldContactIndex = JSON.parse(raw);

        for (const contact of data.contacts) {
          // Insert contact
          const result = db.prepare(`
            INSERT OR IGNORE INTO contacts (name, file, current_role, current_org, closeness, last_contact)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            contact.name, contact.file,
            contact.current_role || null,
            contact.current_org || null,
            contact.closeness || null,
            contact.last_contact || null
          );

          const contactId = result.lastInsertRowid as number;
          if (contactId === 0) continue; // Already existed (IGNORE)

          // Insert industries
          if (contact.industries?.length) {
            const ins = db.prepare(
              'INSERT OR IGNORE INTO contact_industries (contact_id, industry) VALUES (?, ?)'
            );
            for (const ind of contact.industries) {
              ins.run(contactId, ind);
            }
          }

          // Insert tags
          if (contact.tags?.length) {
            const ins = db.prepare(
              'INSERT OR IGNORE INTO contact_tags (contact_id, tag) VALUES (?, ?)'
            );
            for (const tag of contact.tags) {
              ins.run(contactId, tag);
            }
          }

          // Insert conversation summaries
          if (contact.recent_conversations_summary?.length) {
            const ins = db.prepare(
              'INSERT INTO conversation_summaries (contact_id, summary) VALUES (?, ?)'
            );
            for (const summary of contact.recent_conversations_summary) {
              ins.run(contactId, summary);
            }
          }

          // Build FTS entry
          const industriesStr = (contact.industries || []).join(' ');
          const tagsStr = (contact.tags || []).join(' ');
          db.prepare(`
            INSERT INTO fts_contacts(rowid, name, current_role, current_org, industries, tags, how_we_met)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            contactId,
            contact.name || '',
            contact.current_role || '',
            contact.current_org || '',
            industriesStr,
            tagsStr,
            ''
          );
        }

        console.log(`[Migration] Migrated ${data.contacts.length} contacts`);

        // Rename old file
        fs.renameSync(indexPath, indexPath + '.bak');
        console.log(`[Migration] Renamed index.json → index.json.bak`);
      } catch (err) {
        console.error('[Migration] Error migrating index.json:', err);
      }
    }

    // Migrate action-items.json
    const actionPath = vaultPaths.actionItems;
    if (fs.existsSync(actionPath)) {
      try {
        const raw = fs.readFileSync(actionPath, 'utf-8');
        const data: OldActionItems = JSON.parse(raw);

        const ins = db.prepare(`
          INSERT OR IGNORE INTO action_items (id, description, owner, due_date, status, source_conversation, contact, created)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of data.items) {
          ins.run(
            item.id, item.description, item.owner,
            item.due_date || null, item.status,
            item.source_conversation || null,
            item.contact || null, item.created
          );
        }

        console.log(`[Migration] Migrated ${data.items.length} action items`);

        fs.renameSync(actionPath, actionPath + '.bak');
        console.log(`[Migration] Renamed action-items.json → action-items.json.bak`);
      } catch (err) {
        console.error('[Migration] Error migrating action-items.json:', err);
      }
    }

    // Record schema version 1 (initial migration done)
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(1);
    console.log(`[Migration] Initial migration complete. Schema version: 1`);
  });

  txn();
  } // end if currentVer < 1

  // v2 → v3: Add starred column to contacts
  const v3Row = db.prepare('SELECT MAX(version) as ver FROM schema_version').get() as any;
  if ((v3Row?.ver ?? 0) < 3) {
    console.log('[Migration] v2 → v3: Adding starred column...');
    db.exec('ALTER TABLE contacts ADD COLUMN starred INTEGER NOT NULL DEFAULT 0');
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(3);
    console.log('[Migration] v3 complete.');
  }

  // v3 → v4: Add starred column to companies
  const v4Row = db.prepare('SELECT MAX(version) as ver FROM schema_version').get() as any;
  if ((v4Row?.ver ?? 0) < 4) {
    console.log('[Migration] v3 → v4: Adding starred column to companies...');
    db.exec('ALTER TABLE companies ADD COLUMN starred INTEGER NOT NULL DEFAULT 0');
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(4);
    console.log('[Migration] v4 complete.');
  }
}
