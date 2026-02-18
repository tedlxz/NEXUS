import { invoke } from "@tauri-apps/api/core";
import type { Pm2Action, ProcessStatus } from "../types";

export async function getProcessStatus(): Promise<ProcessStatus> {
  return invoke<ProcessStatus>("get_process_status");
}

export async function pm2Command(action: Pm2Action): Promise<string> {
  return invoke<string>("pm2_command", { action });
}
