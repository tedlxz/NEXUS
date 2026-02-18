import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    authorizedUserIds: (process.env.AUTHORIZED_USER_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean),
    proxy: process.env.TELEGRAM_PROXY || '',
  },
  minimax: {
    apiKey: requireEnv('MINIMAX_API_KEY'),
    baseUrl: 'https://api.minimax.io/v1',
    model: 'MiniMax-M2.5',
  },
  vault: {
    path: process.env.VAULT_PATH ||
      path.join(
        process.env.HOME || '',
        'Library/Mobile Documents/iCloud~md~obsidian/Documents/Nexus-Vault'
      ),
  },
  web: {
    port: parseInt(process.env.PORT || '3000', 10),
    password: process.env.WEB_PASSWORD || '',
  },
};

// Derived paths
export const vaultPaths = {
  people: path.join(config.vault.path, 'People'),
  conversations: path.join(config.vault.path, 'Conversations'),
  companies: path.join(config.vault.path, 'Companies'),
  research: path.join(config.vault.path, 'Research'),
  daily: path.join(config.vault.path, 'Daily'),
  templates: path.join(config.vault.path, 'Templates'),
  raw: path.join(config.vault.path, '_raw'),
  system: path.join(config.vault.path, '_system'),
  index: path.join(config.vault.path, '_system', 'index.json'),
  actionItems: path.join(config.vault.path, '_system', 'action-items.json'),
  database: path.join(config.vault.path, '_system', 'nexus.db'),
};

// Type definitions used across the project
export type Closeness = 'close' | 'medium' | 'acquaintance';
export type ConversationSource =
  | 'Face-to-face' | 'Zoom' | 'WeChat Call' | 'Phone'
  | 'Email' | 'WeChat Text' | 'LinkedIn' | 'Other';
export type Sentiment = 'positive' | 'neutral' | 'negative' | 'mixed';
export type RelationshipSignal = 'strengthening' | 'stable' | 'cooling' | 'new_connection';
export type InitiatedBy = 'me' | 'them' | 'mutual';
export type ActionOwner = 'me' | 'them' | 'both';
export type ActionStatus = 'pending' | 'done' | 'cancelled';

export interface PersonData {
  name: string;
  current_role?: string;
  current_org?: string;
  industries?: string[];
  closeness?: Closeness;
  starred?: boolean;
  how_we_met?: string;
  introduced_by?: string;
  last_contact?: string;
  tags?: string[];
  profile?: string;
  career_history?: string;
  education?: string;
  areas_of_expertise?: string;
  key_connections?: string;
  public_info?: string;
  notes?: string;
}

export interface ConversationData {
  contact: string;
  date: string;
  end_date?: string;
  source: ConversationSource;
  location?: string;
  occasion?: string;
  initiated_by?: InitiatedBy;
  sentiment?: Sentiment;
  relationship_signal?: RelationshipSignal;
  follow_up_date?: string;
  follow_up_context?: string;
  tags?: string[];
  company_tags?: string[];  // Independent company tags for this conversation
  ai_summary?: string;
  key_topics?: string[];
  core_insights?: string;
  mentioned_companies?: string[];
  mentioned_people?: string[];
  mentioned_deals?: string[];
  action_items?: ActionItemInput[];
  notes?: string;
  raw_transcript?: string;
}

export interface ActionItemInput {
  description: string;
  owner: ActionOwner;
  due_date?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface ResearchData {
  topic: string;
  status?: 'active' | 'completed' | 'archived';
  description?: string;
  related_contacts?: string;
  expansion_suggestions?: string;
}

export interface ContactIndexEntry {
  name: string;
  file: string;
  current_role?: string;
  current_org?: string;
  industries?: string[];
  closeness?: string;
  starred?: boolean;
  last_contact?: string;
  tags?: string[];
  recent_conversations_summary?: string[];
  created?: string;
}

// Company-related types
export interface CompanyData {
  name: string;
  industry?: string;
  tags?: string[];
  website?: string;
  description?: string;
  starred?: boolean;
  listed?: boolean;        // 是否上市
  market?: 'us' | 'cn' | 'hk' | 'jp' | 'kr';  // 上市地点: 美股/A股/港股/日股/韩股
  ticker?: string;         // 股票代码
}

export interface CompanyNoteData extends CompanyData {
  related_contacts?: Array<{
    name: string;
    role: string;
    relationship: 'current' | 'past';
  }>;
  related_conversations?: Array<{
    date: string;
    contact: string;
    summary: string;
  }>;
}

export interface ContactCompany {
  contact_id: number;
  company_id: number;
  relationship: 'current' | 'past';
  role?: string;
  start_date?: string;
  end_date?: string;
  company_name?: string;
  company_industry?: string;
}

export interface ConversationCompany {
  conversation_id: number;
  company_id: number;
  company_name?: string;
  company_industry?: string;
}

export interface ActionItem {
  id: string;
  description: string;
  owner: ActionOwner;
  due_date?: string;
  status: ActionStatus;
  source_conversation?: string;
  contact?: string;
  created: string;
}
