import { icon } from "../lib/choices";

export function CategoryIcon({ name }: { name: string }) {
  const Icon = icon(name);
  return (
    <span className="cat-icon">
      <Icon size={20} />
    </span>
  );
}
