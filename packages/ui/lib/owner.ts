import { useQuery } from "@tanstack/react-query";
import { request } from "./api-client";
import { ThemePreference } from "./useThemeSync";

/** The signed-in owner, shared by all mini apps (GET /api/me). */
export type Owner = {
  id: string;
  name: string;
  timezone: string;
  theme: ThemePreference;
  currency: string;
};

export const OWNER_QUERY_KEY = ["owner"];

export function useOwner(enabled: boolean) {
  return useQuery({
    queryKey: OWNER_QUERY_KEY,
    queryFn: () => request<Owner>("/me"),
    enabled,
  });
}

/** Saves the owner's theme; applies to every mini app. */
export function saveTheme(theme: ThemePreference) {
  return request<Owner>("/settings", { method: "PATCH", body: JSON.stringify({ theme }) });
}
