import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { categoryIcon, categoryIconGroups } from "../lib/category-icons";
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
  const list = useRef<HTMLDivElement>(null);
  const selectedOption = useRef<HTMLButtonElement>(null);

  // Long list: start at the current icon. Scrolls only the list, not the whole sheet.
  useEffect(() => {
    const container = list.current;
    const option = selectedOption.current;
    if (open && container && option) {
      container.scrollTop = option.offsetTop - (container.clientHeight - option.offsetHeight) / 2;
    }
  }, [open]);

  function choose(name: string) {
    onChange(name);
    setOpen(false);
    trigger.current?.focus();
  }

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
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <CategoryIcon name={value} />
        <span>{categoryIcon(value).label}</span>
        <ChevronDown className={open ? "chevron-open" : ""} size={18} />
      </button>
      {open && (
        <div
          ref={list}
          className="icon-options"
          id={optionsId}
          role="group"
          aria-label="Выбор иконки"
        >
          {categoryIconGroups.map((group) => (
            <section key={group.title} className="icon-group">
              <h4 className="icon-group-title">{group.title}</h4>
              {group.icons.map(({ name, label }) => {
                const selected = name === value;
                return (
                  <button
                    key={name}
                    ref={selected ? selectedOption : undefined}
                    type="button"
                    className={"icon-option " + (selected ? "selected" : "")}
                    aria-pressed={selected}
                    onClick={() => choose(name)}
                  >
                    <CategoryIcon name={name} size={16} />
                    <span>{label}</span>
                    {selected && <Check size={15} aria-hidden="true" />}
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
