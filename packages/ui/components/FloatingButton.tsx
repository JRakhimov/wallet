import type { LucideIcon } from "lucide-react";

/**
 * Single round button in the bottom-right corner, styled like FloatingActionMenu.
 * Render it through AppShell's `floating` slot so it sits above the bottom navigation.
 */
export function FloatingButton({
  label,
  Icon,
  onClick,
}: {
  /** Accessible name and tooltip: the button shows only an icon. */
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <div className="fab">
      <button type="button" className="fab-main" aria-label={label} title={label} onClick={onClick}>
        <Icon size={24} />
      </button>
    </div>
  );
}
