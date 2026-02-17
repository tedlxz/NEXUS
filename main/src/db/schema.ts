import Database from 'better-sqlite3';

export const CURRENT_SCHEMA_VERSION = 4;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version   INTEGER NOT NULL,
  applied   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  industry        TEXT,
  tags            TEXT,
  website         TEXT,
  description     TEXT,
  starred         INTEGER NOT NULL DEFAULT 0,
  created         TEXT    NOT NULL DEFAULT (date('now')),
  updated         TEXT    NOT NULL DEFAULT (date('now'))
);

-- Company tags table
CREATE TABLE IF NOT EXISTS company_tags (
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tag         TEXT    NOT NULL COLLATE NOCASE,
  PRIMARY KEY (company_id, tag)
);

-- Contact-Company relationships (current and historical)
CREATE TABLE IF NOT EXISTS contact_companies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id      INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  relationship    TEXT    NOT NULL CHECK(relationship IN ('current', 'past')),
  role            TEXT,
  start_date      TEXT,
  end_date        TEXT,
  UNIQUE(contact_id, company_id, relationship)
);

-- Conversation-Company tags (which companies are mentioned in a conversation)
CREATE TABLE IF NOT EXISTS conversation_companies (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, company_id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  file            TEXT    NOT NULL,
  current_role    TEXT,
  current_org     TEXT,
  closeness       TEXT    CHECK(closeness IN ('close','medium','acquaintance')),
  starred         INTEGER NOT NULL DEFAULT 0,
  how_we_met      TEXT,
  introduced_by   TEXT,
  last_contact    TEXT,
  created         TEXT    NOT NULL DEFAULT (date('now')),
  updated         TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS contact_industries (
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  industry    TEXT    NOT NULL COLLATE NOCASE,
  PRIMARY KEY (contact_id, industry)
);

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag         TEXT    NOT NULL COLLATE NOCASE,
  PRIMARY KEY (contact_id, tag)
);

CREATE TABLE IF NOT EXISTS conversations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id          INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  date                TEXT    NOT NULL,
  source              TEXT,
  location            TEXT,
  occasion            TEXT,
  initiated_by        TEXT,
  sentiment           TEXT,
  relationship_signal TEXT,
  follow_up_date      TEXT,
  follow_up_context   TEXT,
  ai_summary          TEXT,
  key_topics          TEXT,
  core_insights       TEXT,
  mentioned_companies TEXT,
  mentioned_people    TEXT,
  mentioned_deals     TEXT,
  file                TEXT,
  created             TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  summary     TEXT    NOT NULL,
  created     TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE INDEX IF NOT EXISTS idx_conv_summaries_contact
  ON conversation_summaries(contact_id, created DESC);

CREATE TABLE IF NOT EXISTS action_items (
  id                    TEXT    PRIMARY KEY,
  description           TEXT    NOT NULL,
  owner                 TEXT    NOT NULL CHECK(owner IN ('me','them','both')),
  due_date              TEXT,
  status                TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','cancelled')),
  source_conversation   TEXT,
  contact               TEXT    COLLATE NOCASE,
  created               TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
CREATE INDEX IF NOT EXISTS idx_action_items_contact ON action_items(contact);
CREATE INDEX IF NOT EXISTS idx_action_items_due ON action_items(due_date);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_contacts USING fts5(
  name,
  current_role,
  current_org,
  industries,
  tags,
  how_we_met,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_conversations USING fts5(
  contact_name,
  ai_summary,
  key_topics,
  core_insights,
  mentioned_companies,
  mentioned_people,
  mentioned_deals,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(current_org COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_contacts_closeness ON contacts(closeness);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact ON contacts(last_contact);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_date ON conversations(date);
CREATE INDEX IF NOT EXISTS idx_contact_industries_industry ON contact_industries(industry COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag COLLATE NOCASE);

-- Company-related indexes
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(industry COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_contact_companies_contact ON contact_companies(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_companies_company ON contact_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_conversation_companies_conversation ON conversation_companies(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_companies_company ON conversation_companies(company_id);
`;

export function applySchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
