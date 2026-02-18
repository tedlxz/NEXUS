interface StatusDotProps {
  active: boolean;
}

export function StatusDot({ active }: StatusDotProps) {
  return (
    <span
      className={`status-dot ${active ? "status-dot--active" : "status-dot--inactive"}`}
      aria-label={active ? "Running" : "Stopped"}
    />
  );
}
