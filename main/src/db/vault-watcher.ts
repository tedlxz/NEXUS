import * as chokidar from 'chokidar';
import path from 'path';
import { vaultPaths } from '../config';
import {
  syncSinglePerson,
  removePerson,
  syncSingleCompany,
  removeCompany,
} from './sync-from-obsidian';
import { vaultWriter } from '../vault/writer';

let watcher: ReturnType<typeof chokidar.watch> | null = null;

/**
 * Start watching the Obsidian vault for file changes.
 * Automatically syncs additions, modifications, and deletions to SQL.
 */
export function startVaultWatcher(): void {
  if (watcher) {
    console.log('[Watcher] Already running');
    return;
  }

  const peoplePath = vaultPaths.people;
  const companiesPath = vaultPaths.companies;

  watcher = chokidar.watch(
    [
      path.join(peoplePath, '*.md'),
      path.join(companiesPath, '*.md'),
    ],
    {
      ignoreInitial: true,     // Don't fire events for existing files on startup
      persistent: true,
      awaitWriteFinish: {      // Wait for file writes to complete (iCloud sync)
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    }
  );

  watcher
    .on('add', (filePath: string) => handleFileChange(filePath, 'added'))
    .on('change', (filePath: string) => handleFileChange(filePath, 'changed'))
    .on('unlink', (filePath: string) => handleFileDelete(filePath))
    .on('error', (err: unknown) => console.error('[Watcher] Error:', err))
    .on('ready', () => {
      console.log('[Watcher] Watching People/ and Companies/ for changes');
    });
}

/**
 * Stop the file watcher.
 */
export async function stopVaultWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
    console.log('[Watcher] Stopped');
  }
}

function handleFileChange(filePath: string, event: string): void {
  const normalized = path.normalize(filePath);

  if (normalized.startsWith(path.normalize(vaultPaths.people))) {
    console.log(`[Watcher] Person ${event}: ${path.basename(filePath)}`);
    syncSinglePerson(filePath)
      .then(() => vaultWriter.saveStarredList())
      .catch(err => console.error(`[Watcher] Error syncing person:`, err));
  } else if (normalized.startsWith(path.normalize(vaultPaths.companies))) {
    console.log(`[Watcher] Company ${event}: ${path.basename(filePath)}`);
    syncSingleCompany(filePath)
      .then(() => vaultWriter.saveStarredList())
      .catch(err => console.error(`[Watcher] Error syncing company:`, err));
  }
}

function handleFileDelete(filePath: string): void {
  const normalized = path.normalize(filePath);

  if (normalized.startsWith(path.normalize(vaultPaths.people))) {
    console.log(`[Watcher] Person deleted: ${path.basename(filePath)}`);
    removePerson(filePath);
  } else if (normalized.startsWith(path.normalize(vaultPaths.companies))) {
    console.log(`[Watcher] Company deleted: ${path.basename(filePath)}`);
    removeCompany(filePath);
  }
}
