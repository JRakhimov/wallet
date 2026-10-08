import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Sheet({
  title,
  label = "Параметры",
  onClose,
  children,
}: {
  title: string;
  label?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".main");
    const previous = {
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
      main: main?.style.overflowY,
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (main) main.style.overflowY = "hidden";
    return () => {
      document.documentElement.style.overflow = previous.html;
      document.body.style.overflow = previous.body;
      if (main) main.style.overflowY = previous.main || "";
    };
  }, []);
  useEffect(() => {
    const back = window.Telegram?.WebApp?.BackButton;
    if (!back) return;
    const onBack = () => close.current();
    back.show();
    back.onClick(onBack);
    return () => {
      back.offClick(onBack);
      back.hide();
    };
  }, []);
  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
