import { useCallback, useRef, useState } from "react";
import type { Pm2Action, ProcessStatus } from "../types";
import { pm2Command } from "../lib/commands";
import { ActionButton } from "./ActionButton";

interface ActionMatrixProps {
  status: ProcessStatus;
  onActionComplete: () => void;
}

export function ActionMatrix({ status, onActionComplete }: ActionMatrixProps) {
  const [loadingAction, setLoadingAction] = useState<Pm2Action | null>(null);
  const cooldownRef = useRef(false);

  const isOnline = status.status === "online";
  const isBusy = loadingAction !== null || cooldownRef.current;
  const isPm2Missing = status.status === "not_found";

  const handleAction = useCallback(
    async (action: Pm2Action) => {
      if (isBusy) return;
      setLoadingAction(action);
      try {
        await pm2Command(action);
      } catch {
        // Error handling is passive — status poll will reflect state
      } finally {
        setLoadingAction(null);
        cooldownRef.current = true;
        onActionComplete();
        setTimeout(() => {
          cooldownRef.current = false;
        }, 1500);
      }
    },
    [isBusy, onActionComplete]
  );

  return (
    <div className="action-matrix">
      <ActionButton
        label="START"
        disabled={isOnline || isBusy || (isPm2Missing && !isBusy)}
        loading={loadingAction === "start"}
        onClick={() => handleAction("start")}
      />
      <ActionButton
        label="RESTART"
        disabled={!isOnline || isBusy}
        loading={loadingAction === "restart"}
        onClick={() => handleAction("restart")}
      />
      <ActionButton
        label="STOP"
        disabled={!isOnline || isBusy}
        loading={loadingAction === "stop"}
        onClick={() => handleAction("stop")}
      />
    </div>
  );
}
