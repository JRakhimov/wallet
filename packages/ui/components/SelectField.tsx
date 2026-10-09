import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SelectChoice = {
  value: string;
  label: string;
  detail?: string;
  Icon?: LucideIcon;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: SelectChoice[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const optionsId = useId();
  const labelId = useId();
  const valueId = useId();
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  function focusOption(index: number) {
    requestAnimationFrame(() => optionRefs.current[index]?.focus());
  }
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (event.key === "Tab" && open) {
      setOpen(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !options.length) return;
    event.preventDefault();
    if (!open) setOpen(true);
    const focused = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    const current =
      focused >= 0
        ? focused
        : Math.max(
            0,
            options.findIndex((option) => option.value === value),
          );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : event.key === "ArrowDown"
            ? Math.min(options.length - 1, current + (open ? 1 : 0))
            : Math.max(0, current - (open ? 1 : 0));
    focusOption(next);
  }
  return (
    <div ref={root} className="custom-select" onKeyDown={onKeyDown}>
      <span className="field-label" id={labelId}>
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        className="field custom-select-trigger"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={optionsId}
        disabled={disabled || !options.length}
        onClick={() => setOpen((v) => !v)}
      >
        {selected?.Icon && (
          <span className="select-icon">
            <selected.Icon size={19} />
          </span>
        )}
        <span className="select-value">
          <span id={valueId}>{selected?.label || "Выбрать"}</span>
          {selected?.detail && <small>{selected.detail}</small>}
        </span>
        <ChevronDown className={open ? "chevron-open" : ""} size={18} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="custom-select-options"
          id={optionsId}
          role="listbox"
          aria-labelledby={labelId}
        >
          {options.map((option, index) => (
            <button
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={value === option.value}
              key={option.value}
              className={"custom-select-option " + (value === option.value ? "selected" : "")}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              {option.Icon && (
                <span className="select-icon">
                  <option.Icon size={19} />
                </span>
              )}
              <span className="select-value">
                <span>{option.label}</span>
                {option.detail && <small>{option.detail}</small>}
              </span>
              {value === option.value && <Check size={17} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
