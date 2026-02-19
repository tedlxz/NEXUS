import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';

/**
 * Global Context Manager
 * 
 * Tracks all user actions across the system to enable follow-up understanding.
 * Every operation (newsflow, contact query, brainstorm, etc.) is recorded.
 * 
 * Data Structure:
 * - chatHistory: Recent conversation turns (for chat context)
 * - lastAction: Summary of the most recent action
 * - recentActions: Last N actions with full data (for follow-up)
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ActionDetails {
  // For newsflow/search actions
  companies?: string[];
  searchQuery?: string;
  results?: any[];
  
  // For contact actions
  contact?: string;
  contacts?: string[];
  
  // For brainstorm actions
  topic?: string;
  
  // For conversation actions
  conversationWith?: string;
  
  // Generic
  [key: string]: any;
}

export interface RecentAction {
  type: ActionType;
  timestamp: string;
  summary: string;        // Human-readable summary
  details: ActionDetails; // Full data for follow-up
}

export type ActionType = 
  | 'newsflow'
  | 'news_search'
  | 'contact_query'
  | 'conversation_log'
  | 'brainstorm'
  | 'search'
  | 'enrich_contact'
  | 'update_contact'
  | 'new_contact'
  | 'action_item'
  | 'unknown';

export interface GlobalContextData {
  chatHistory: ChatMessage[];
  lastAction: RecentAction | null;
  recentActions: RecentAction[];
}

// Constants
const MAX_CHAT_HISTORY = 20;       // 10 user+assistant pairs
const MAX_RECENT_ACTIONS = 10;     // Keep last 10 actions for follow-up
const CONTEXT_FILE = 'context.json';

// Per-user context storage
const userContexts = new Map<number, GlobalContextData>();

/**
 * Get context file path for a user
 */
function getContextFilePath(userId: number): string {
  // Store in vault path if available, otherwise temp
  const vaultPath = config.vault?.path || '/tmp/nexus';
  return path.join(vaultPath, `_system`, `user_${userId}`, CONTEXT_FILE);
}

/**
 * Initialize or get context for a user
 */
export function getContext(userId: number): GlobalContextData {
  if (!userContexts.has(userId)) {
    userContexts.set(userId, {
      chatHistory: [],
      lastAction: null,
      recentActions: [],
    });
  }
  return userContexts.get(userId)!;
}

/**
 * Save context to file (for persistence across bot restarts)
 */
async function saveContext(userId: number): Promise<void> {
  const context = getContext(userId);
  const filePath = getContextFilePath(userId);
  
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(context, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Context] Save failed:', err);
  }
}

/**
 * Load context from file
 */
export async function loadContext(userId: number): Promise<GlobalContextData> {
  const filePath = getContextFilePath(userId);
  
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data) as GlobalContextData;
    userContexts.set(userId, parsed);
    return parsed;
  } catch {
    // File doesn't exist or is invalid, return default
    return getContext(userId);
  }
}

/**
 * Add a message to chat history
 */
export function addChatMessage(userId: number, role: 'user' | 'assistant', content: string): void {
  const context = getContext(userId);
  
  context.chatHistory.push({ role, content });
  
  // Trim to max size
  if (context.chatHistory.length > MAX_CHAT_HISTORY) {
    context.chatHistory.splice(0, context.chatHistory.length - MAX_CHAT_HISTORY);
  }
  
  // Auto-save (debounced in production, immediate for now)
  saveContext(userId).catch(console.error);
}

/**
 * Record an action performed by the user
 */
export function recordAction(
  userId: number,
  type: ActionType,
  summary: string,
  details: ActionDetails = {}
): void {
  const context = getContext(userId);
  
  const action: RecentAction = {
    type,
    timestamp: new Date().toISOString(),
    summary,
    details,
  };
  
  // Update lastAction
  context.lastAction = action;
  
  // Add to recentActions
  context.recentActions.push(action);
  
  // Trim to max size
  if (context.recentActions.length > MAX_RECENT_ACTIONS) {
    context.recentActions.shift();
  }
  
  // Auto-save
  saveContext(userId).catch(console.error);
  
  console.log(`[Context] Recorded action: ${type} - ${summary}`);
}

/**
 * Check if current message is a follow-up to previous action
 */
export function isFollowUp(userId: number, message: string): boolean {
  const context = getContext(userId);
  
  if (!context.lastAction) return false;
  
  // Keywords that indicate follow-up
  const followUpKeywords = [
    '还有', '更多', '还有吗', '再', '另外',
    'more', 'another', 'also', 'else',
    '关于这个', '这个公司', '这家', '刚才',
    '之前', '上次', '之前那个',
  ];
  
  const lowerMessage = message.toLowerCase();
  
  // Check if message contains follow-up keywords
  for (const keyword of followUpKeywords) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  
  // Check if message is very short (likely a follow-up)
  if (message.length < 20 && context.lastAction) {
    return true;
  }
  
  return false;
}

/**
 * Get context summary for AI
 * Returns a formatted string to inject into AI prompts
 */
export function getContextSummary(userId: number): string {
  const context = getContext(userId);
  
  const parts: string[] = [];
  
  // 1. Last action
  if (context.lastAction) {
    parts.push(`## 最近一次操作`);
    parts.push(`类型: ${context.lastAction.type}`);
    parts.push(`摘要: ${context.lastAction.summary}`);
    parts.push(`时间: ${context.lastAction.timestamp}`);
    
    // Add relevant details based on action type
    const { details } = context.lastAction;
    if (details.companies?.length) {
      parts.push(`涉及公司: ${details.companies.join(', ')}`);
    }
    if (details.contact) {
      parts.push(`涉及联系人: ${details.contact}`);
    }
    if (details.topic) {
      parts.push(`主题: ${details.topic}`);
    }
    if (details.searchQuery) {
      parts.push(`搜索词: ${details.searchQuery}`);
    }
  }
  
  // 2. Recent actions summary (last 3)
  if (context.recentActions.length > 1) {
    parts.push(`\n## 最近操作记录`);
    const recent = context.recentActions.slice(-3);
    for (let i = 0; i < recent.length - 1; i++) {
      const a = recent[i];
      const time = new Date(a.timestamp).toLocaleString('zh-CN');
      parts.push(`- [${time}] ${a.type}: ${a.summary}`);
    }
  }
  
  return parts.join('\n');
}

/**
 * Get recent actions for follow-up processing
 */
export function getRecentActions(userId: number, limit = 5): RecentAction[] {
  const context = getContext(userId);
  return context.recentActions.slice(-limit);
}

/**
 * Get chat history for context
 */
export function getChatHistory(userId: number): ChatMessage[] {
  const context = getContext(userId);
  return context.chatHistory;
}

/**
 * Clear chat history (keep recent actions)
 */
export function clearChatHistory(userId: number): void {
  const context = getContext(userId);
  context.chatHistory = [];
  saveContext(userId).catch(console.error);
  console.log(`[Context] Cleared chat history for user ${userId}`);
}

/**
 * Clear all context (full reset)
 */
export function clearAllContext(userId: number): void {
  userContexts.set(userId, {
    chatHistory: [],
    lastAction: null,
    recentActions: [],
  });
  saveContext(userId).catch(console.error);
  console.log(`[Context] Cleared all context for user ${userId}`);
}

/**
 * Clear specific action type from recent actions
 * Useful when user starts a completely new topic
 */
export function clearRecentActions(userId: number): void {
  const context = getContext(userId);
  context.lastAction = null;
  context.recentActions = [];
  saveContext(userId).catch(console.error);
  console.log(`[Context] Cleared recent actions for user ${userId}`);
}

/**
 * Get last action for checking
 */
export function getLastAction(userId: number): RecentAction | null {
  const context = getContext(userId);
  return context.lastAction;
}

/**
 * Get companies from last newsflow/search action
 */
export function getLastCompanies(userId: number): string[] {
  const lastAction = getLastAction(userId);
  if (!lastAction) return [];
  
  // Check both newsflow and news_search types
  if (lastAction.type === 'newsflow' || lastAction.type === 'news_search') {
    return lastAction.details.companies || [];
  }
  
  // Also check recentActions
  const context = getContext(userId);
  for (let i = context.recentActions.length - 1; i >= 0; i--) {
    const action = context.recentActions[i];
    if (action.type === 'newsflow' || action.type === 'news_search') {
      return action.details.companies || [];
    }
  }
  
  return [];
}

/**
 * Export context for debugging
 */
export function exportContext(userId: number): string {
  const context = getContext(userId);
  return JSON.stringify(context, null, 2);
}
