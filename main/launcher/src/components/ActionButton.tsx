interface ActionButtonProps {
  label: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}

export function ActionButton({ label, disabled, loading, onClick }: ActionButtonProps) {
  return (
    <button
      className={`action-btn ${loading ? "action-btn--loading" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {loading ? (
        <span className="action-btn__spinner" />
      ) : (
        label
      )}
    </button>
  );
}
