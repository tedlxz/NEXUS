export interface ProcessStatus {
  status: "online" | "stopped" | "errored" | "not_found";
  pid: number | null;
  uptime_ms: number | null;
  memory_bytes: number | null;
  restarts: number | null;
}

export type Pm2Action = "start" | "restart" | "stop";

export interface LogEntry {
  id: number;
  timestamp: Date;
  message: string;
}
