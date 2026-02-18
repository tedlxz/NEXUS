import type { ProcessStatus } from "../types";
import { StatusDot } from "./StatusDot";

interface HeaderProps {
  status: ProcessStatus;
  error: string | null;
}

function getStatusLabel(status: ProcessStatus["status"]): string {
  switch (status) {
    case "online":
      return "RUNNING";
    case "stopped":
      return "STOPPED";
    case "errored":
      return "ERRORED";
    case "not_found":
      return "NOT FOUND";
  }
}

export function Header({ status, error }: HeaderProps) {
  const isActive = status.status === "online";
  const isPm2Missing = error?.includes("not found") && status.status === "not_found";

  return (
    <header className="header" data-tauri-drag-region>
      <h1 className="header__title" data-tauri-drag-region>
        NEXUS Bot
      </h1>
      <div className="header__status">
        <StatusDot active={isActive} />
        <span
          className={`header__label ${
            isActive
              ? "header__label--active"
              : isPm2Missing
                ? "header__label--error"
                : "header__label--inactive"
          }`}
        >
          {isPm2Missing ? "PM2 NOT FOUND" : getStatusLabel(status.status)}
        </span>
      </div>
    </header>
  );
}
