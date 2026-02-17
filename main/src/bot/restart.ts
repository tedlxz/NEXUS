import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Restart the Nexus bot via pm2
 */
export async function restartBot(): Promise<void> {
  console.log('[Restart] Restarting Nexus bot...');
  try {
    await execAsync('pm2 restart nexus');
    console.log('[Restart] Bot restarted successfully');
  } catch (err) {
    console.error('[Restart] Failed to restart bot:', err);
    throw err;
  }
}

/**
 * Check if pm2 is running the nexus bot
 */
export async function isBotRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const processes = JSON.parse(stdout);
    return processes.some((p: any) => p.name === 'nexus' && p.pm2_env?.status === 'online');
  } catch {
    return false;
  }
}
