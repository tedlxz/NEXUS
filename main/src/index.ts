import { config, vaultPaths } from './config';
import { createBot } from './bot/telegram';
import { createWebServer } from './web/server';
import { getDb, closeDb } from './db/database';
import { runMigrationIfNeeded } from './db/migrate';
import { startVaultWatcher, stopVaultWatcher } from './db/vault-watcher';
import fs from 'fs/promises';
import path from 'path';
import {
  obsidianPersonTemplate,
  obsidianConversationTemplate,
  obsidianResearchTemplate,
  obsidianCompanyTemplate,
} from './vault/templates';

async function initializeVault(): Promise<void> {
  const dirs = [
    vaultPaths.people,
    vaultPaths.conversations,
    vaultPaths.companies,
    vaultPaths.research,
    vaultPaths.daily,
    vaultPaths.templates,
    vaultPaths.raw,
    vaultPaths.system,
  ];

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }

  // Initialize SQLite database (replaces index.json and action-items.json)
  const db = getDb();
  runMigrationIfNeeded(db);
  console.log('[DB] SQLite database ready');

  // Write Obsidian template files
  const templates: [string, string][] = [
    ['Person Template.md', obsidianPersonTemplate],
    ['Conversation Template.md', obsidianConversationTemplate],
    ['Research Template.md', obsidianResearchTemplate],
    ['Company Template.md', obsidianCompanyTemplate],
  ];

  for (const [name, content] of templates) {
    const filePath = path.join(vaultPaths.templates, name);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  console.log(`[Vault] Initialized at ${config.vault.path}`);
}

// Periodic sync interval (30 minutes)
const SYNC_INTERVAL_MS = 30 * 60 * 1000;

// Daily enrichment time: 11:30 PM
const ENRICH_HOUR = 23;
const ENRICH_MINUTE = 30;

async function main(): Promise<void> {
  console.log('=== NEXUS PE CRM ===');
  console.log(`Vault: ${config.vault.path}`);

  // Initialize vault structure
  await initializeVault();

  // Start Telegram bot (non-blocking — don't let long-polling hang the rest of startup)
  const bot = createBot();
  bot.launch()
    .then(() => console.log('[Bot] Telegram bot started'))
    .catch(err => console.error('[Bot] Launch error:', err));

  // Start web server
  const app = createWebServer();
  app.listen(config.web.port, () => {
    console.log(`[Web] Server running on http://localhost:${config.web.port}`);
  });

  // Periodic sync from Obsidian to SQL (every 30 minutes)
  const startPeriodicSync = async () => {
    console.log(`[Sync] Starting periodic sync (every ${SYNC_INTERVAL_MS / 60000} minutes)`);
    try {
      const { syncFromObsidian } = await import('./db/sync-from-obsidian');
      await syncFromObsidian();
      console.log('[Sync] Periodic sync completed');
    } catch (err) {
      console.error('[Sync] Periodic sync failed:', err);
    }
  };
  
  // Run initial sync on startup
  await startPeriodicSync();

  // Start real-time file watcher for instant Obsidian → SQL sync
  startVaultWatcher();

  // Schedule periodic full sync as backup (catches anything the watcher missed)
  setInterval(startPeriodicSync, SYNC_INTERVAL_MS);

  // Daily profile enrichment at 11:30 PM
  const scheduleEnrichment = () => {
    const now = new Date();
    const targetTime = new Date(now);
    targetTime.setHours(ENRICH_HOUR, ENRICH_MINUTE, 0, 0);
    
    // If we've passed 11:30 today, schedule for tomorrow
    if (now > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1);
    }
    
    const msUntilEnrich = targetTime.getTime() - now.getTime();
    console.log(`[Enrich] Scheduled for ${targetTime.toISOString()} (in ${Math.round(msUntilEnrich / 60000)} minutes)`);
    
    setTimeout(async () => {
      console.log('[Enrich] Running daily profile enrichment...');
      try {
        const { enrichContactProfiles } = await import('./db/enrich-profiles');
        const result = await enrichContactProfiles();
        console.log('[Enrich] Result:', result);
      } catch (err) {
        console.error('[Enrich] Error:', err);
      }
      
      // Schedule next run
      scheduleEnrichment();
    }, msUntilEnrich);
  };
  
  scheduleEnrichment();

  // Daily Newsflow at HKT 09:00
  const NEWSFLOW_HOUR_UTC = 1; // HKT 09:00 = UTC 01:00
  const NEWSFLOW_MINUTE = 0;

  const scheduleNewsflow = () => {
    const now = new Date();
    const targetTime = new Date(now);
    targetTime.setUTCHours(NEWSFLOW_HOUR_UTC, NEWSFLOW_MINUTE, 0, 0);

    // If we've passed 01:00 UTC today, schedule for tomorrow
    if (now > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    const msUntilNewsflow = targetTime.getTime() - now.getTime();
    console.log(`[Newsflow] Scheduled for ${targetTime.toISOString()} (in ${Math.round(msUntilNewsflow / 60000)} minutes)`);

    setTimeout(async () => {
      console.log('[Newsflow] Running daily newsflow...');
      try {
        const { runNewsflow } = await import('./newsflow/index');
        const result = await runNewsflow();
        console.log(`[Newsflow] Done: ${result.success ? '✅' : '❌'} (${result.stats.articlesFound} articles)`);
      } catch (err) {
        console.error('[Newsflow] Error:', err);
      }

      // Schedule next run
      scheduleNewsflow();
    }, msUntilNewsflow);
  };

  scheduleNewsflow();

  // Graceful shutdown
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log('\n[Shutdown] Stopping...');
    stopVaultWatcher();
    closeDb();
    bot.stop('SIGTERM');
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
