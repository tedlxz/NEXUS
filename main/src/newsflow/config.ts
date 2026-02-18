import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const newsflowConfig = {
  // Finnhub.io API (US stocks)
  finnhub: {
    apiKey: process.env.FINNHUB_API_KEY || '',
    baseUrl: 'https://finnhub.io/api/v1',
  },

  // AKShare (China & HK stocks) - runs locally with Python
  akshare: {
    enabled: process.env.AKSHARE_ENABLED === 'true',
    pythonPath: process.env.AKSHARE_PYTHON_PATH || 'python3',
  },

  // Google News RSS (private companies & people)
  googleNews: {
    rssBaseUrl: 'https://news.google.com/rss/search',
    delayMs: 1500,
  },

  // MiniMax AI
  minimax: {
    apiKey: requireEnv('MINIMAX_API_KEY'),
    baseUrl: 'https://api.minimax.io/v1',
    model: 'MiniMax-M2.5',
  },

  // Telegram Bot
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    chatId: process.env.NEWSFLOW_CHAT_ID || process.env.AUTHORIZED_USER_IDS || '',
    proxy: process.env.TELEGRAM_PROXY || '',
  },

  // Obsidian Vault
  vault: {
    path: process.env.VAULT_PATH ||
      path.join(
        process.env.HOME || '',
        'Library/Mobile Documents/iCloud~md~obsidian/Documents/Nexus-Vault'
      ),
    newsflowFolder: 'NewsFlow',
  },

  // Scheduler
  scheduler: {
    timezone: 'Asia/Hong_Kong',
    hour: 9,
    minute: 0,
  },
};

// Derived paths
export const newsflowPaths = {
  newsflow: path.join(newsflowConfig.vault.path, newsflowConfig.vault.newsflowFolder),
};

export default newsflowConfig;
