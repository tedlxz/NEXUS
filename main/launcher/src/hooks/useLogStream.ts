import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LogEntry } from "../types";

const MAX_LINES = 500;
let nextId = 0;

export function useLogStream() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    listen<string>("log-line", (event) => {
      if (cancelled) return;
      const entry: LogEntry = {
        id: nextId++,
        timestamp: new Date(),
        message: event.payload,
      };
      setLogs((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        unlistenRef.current = unlisten;
      }
    });

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs, clearLogs };
}
