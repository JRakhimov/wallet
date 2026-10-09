import { useQueryClient } from "@tanstack/react-query";
import { OWNER_QUERY_KEY, saveTheme } from "../lib/owner";
import { ThemePreference } from "../lib/useThemeSync";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Система" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
];

/** Theme switch. The theme is an owner setting, so it applies to every mini app. */
export function ThemeSelect({
  value,
  onError,
}: {
  value: ThemePreference;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();

  async function choose(theme: ThemePreference) {
    try {
      await saveTheme(theme);
      await queryClient.invalidateQueries({ queryKey: OWNER_QUERY_KEY });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Не удалось сменить тему");
    }
  }

  return (
    <div className="appearance">
      <span>Тема</span>
      <div className="segmented">
        {THEMES.map((theme) => (
          <button
            key={theme.value}
            className={value === theme.value ? "active" : ""}
            onClick={() => void choose(theme.value)}
          >
            {theme.label}
          </button>
        ))}
      </div>
    </div>
  );
}
