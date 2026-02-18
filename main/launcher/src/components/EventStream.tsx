import { useCallback, useEffect, useRef, useState } from "react";
import type { LogEntry } from "../types";
import { LogLine } from "./LogLine";

interface EventStreamProps {
  logs: LogEntry[];
}

export function EventStream({ logs }: EventStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const userScrolledRef = useRef(false);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;

    if (atBottom && userScrolledRef.current) {
      userScrolledRef.current = false;
      setAutoScroll(true);
    } else if (!atBottom && !userScrolledRef.current) {
      userScrolledRef.current = true;
      setAutoScroll(false);
    }
  }, []);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <div className="event-stream" ref={containerRef} onScroll={handleScroll}>
      {logs.map((entry) => (
        <LogLine key={entry.id} entry={entry} />
      ))}
      <span className="event-stream__cursor">&#9612;</span>
    </div>
  );
}
