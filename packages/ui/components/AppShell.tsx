import { ReactNode, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { useScrollEdgeFix } from "../lib/useScrollEdgeFix";

export type ShellTab<T extends string> = { id: T; label: string; Icon: LucideIcon };

/** App layout: header with brand, optional toast, scrollable main and bottom navigation. */
export function AppShell<T extends string>({
  name,
  Icon,
  devMode = false,
  tabs,
  activeTab,
  onTabChange,
  toast,
  floating,
  children,
}: {
  name: string;
  Icon: LucideIcon;
  devMode?: boolean;
  tabs: ShellTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  toast?: string;
  /** Floating control above the bottom navigation, e.g. FloatingActionMenu. */
  floating?: ReactNode;
  children: ReactNode;
}) {
  const main = useRef<HTMLElement>(null);
  useScrollEdgeFix(main);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">
            <Icon size={20} />
          </span>
          <span>{name}</span>
        </div>
        <div className="header-right">{devMode && <span className="dev-badge">[Dev]</span>}</div>
      </header>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <div className={"main-area" + (floating ? " has-floating" : "")}>
        <main ref={main} className={"main main-" + activeTab}>
          {children}
        </main>
        {floating}
      </div>
      <nav className="bottom-nav" aria-label="Основная навигация">
        {tabs.map(({ id, label, Icon: TabIcon }) => (
          <button
            key={id}
            className={activeTab === id ? "active" : ""}
            aria-current={activeTab === id ? "page" : undefined}
            onClick={() => onTabChange(id)}
          >
            <TabIcon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
