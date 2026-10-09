import { useQueryClient } from "@tanstack/react-query";

export function useRefresh() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["summary"] }),
      qc.invalidateQueries({ queryKey: ["insights"] }),
      qc.invalidateQueries({ queryKey: ["accounts"] }),
      qc.invalidateQueries({ queryKey: ["operations"] }),
      qc.invalidateQueries({ queryKey: ["trash"] }),
    ]);
}
