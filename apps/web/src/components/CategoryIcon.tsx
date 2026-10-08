import { categoryIcon } from "../lib/category-icons";

export function CategoryIcon({ name, size = 20 }: { name: string; size?: number }) {
  const { Icon } = categoryIcon(name);
  return (
    <span className="cat-icon">
      <Icon size={size} />
    </span>
  );
}
