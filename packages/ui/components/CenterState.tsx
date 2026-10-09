import type { LucideIcon } from "lucide-react";

/** Full-screen state: loading, sign-in error, expired session and so on. */
export function CenterState({
  loading = false,
  Icon,
  title,
  message,
  action,
}: {
  loading?: boolean;
  Icon?: LucideIcon;
  title?: string;
  message?: string;
  action?: { label: string; onClick: () => void; quiet?: boolean };
}) {
  return (
    <div className="center-state">
      {loading && <div className="loader" />}
      {Icon && <Icon size={42} />}
      {title && <h1>{title}</h1>}
      {message && <p>{message}</p>}
      {action && (
        <button className={action.quiet ? "quiet" : "primary"} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
