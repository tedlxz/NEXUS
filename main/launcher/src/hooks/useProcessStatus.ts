import { useCallback, useEffect, useRef, useState } from "react";
import type { ProcessStatus } from "../types";
import { getProcessStatus } from "../lib/commands";

const DEFAULT_STATUS: ProcessStatus = {
  status: "not_found",
  pid: null,
  uptime_ms: null,
  memory_bytes: null,
  restarts: null,
};

export function useProcessStatus(intervalMs = 2000) {
  const [status, setStatus] = useState<ProcessStatus>(DEFAULT_STATUS);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const poll = useCallback(async () => {
    try {
      const result = await getProcessStatus();
      setStatus(result);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("not found")) {
        setStatus({ ...DEFAULT_STATUS, status: "not_found" });
      }
      setError(msg);
    }
  }, []);

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [poll, intervalMs]);

  return { status, error, refresh: poll };
}
