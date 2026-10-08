import { useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { categoryIconOptions } from "../lib/choices";
import { CategoryIcon } from "./CategoryIcon";

export function IconSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const optionsId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = categoryIconOptions.find(([name]) => name === value)?.[1] || "Общая";
  return (
    <div
      className="icon-select"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span className="field-label">Иконка</span>
      <button
        ref={trigger}
        type="button"
        className="field icon-select-trigger"
        aria-expanded={open}
        aria-controls={optionsId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <CategoryIcon name={value} />
        <span>{selected}</span>
        <ChevronDown className={open ? "chevron-open" : ""} size={18} />
      </button>
      {open && (
        <div className="icon-options" id={optionsId} role="group" aria-label="Выбор иконки">
          {categoryIconOptions.map(([name, label]) => (
            <button
              type="button"
              key={name}
              className={"icon-option " + (name === value ? "selected" : "")}
              aria-pressed={name === value}
              onClick={() => {
                onChange(name);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <CategoryIcon name={name} />
              <span>{label}</span>
              {name === value && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
