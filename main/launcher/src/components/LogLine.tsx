import type { LogEntry } from "../types";

interface LogLineProps {
  entry: LogEntry;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function LogLine({ entry }: LogLineProps) {
  return (
    <div className="log-line">
      <span className="log-line__time">[{formatTime(entry.timestamp)}]</span>
      <span className="log-line__separator"> &gt; </span>
      <span className="log-line__message">{entry.message}</span>
    </div>
  );
}
