import { useEffect, useId, useState } from "react";
import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type FloatingAction = { label: string; Icon: LucideIcon; onClick: () => void };

/**
 * Round button in the bottom-right corner. Tapping it reveals the actions above it;
 * tapping outside, Escape or choosing an action closes the menu.
 * Render it through AppShell's `floating` slot so it sits above the bottom navigation.
 */
export function FloatingActionMenu({
  label,
  actions,
}: {
  /** Accessible name of the main button, e.g. "Добавить приём пищи". */
  label: string;
  actions: FloatingAction[];
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function run(action: FloatingAction) {
    setOpen(false);
    action.onClick();
  }

  return (
    <>
      {open && <div className="fab-backdrop" role="presentation" onClick={() => setOpen(false)} />}
      <div className={"fab" + (open ? " open" : "")}>
        <div className="fab-actions" id={menuId} role="menu" aria-hidden={!open}>
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className="fab-action"
              tabIndex={open ? 0 : -1}
              // Items closest to the main button appear first.
              style={{ transitionDelay: open ? `${(actions.length - 1 - index) * 40}ms` : "0ms" }}
              onClick={() => run(action)}
            >
              <span>{action.label}</span>
              <span className="fab-action-icon">
                <action.Icon size={20} />
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="fab-main"
          aria-label={label}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((isOpen) => !isOpen)}
        >
          <Plus size={26} />
        </button>
      </div>
    </>
  );
}
