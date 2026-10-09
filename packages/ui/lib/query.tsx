import { ReactNode, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { storageKey } from "./platform";

const DAY_MS = 24 * 60 * 60 * 1000;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 10_000,
        // Must outlive the persisted cache, otherwise restored data is dropped immediately.
        gcTime: DAY_MS,
        refetchOnWindowFocus: true,
      },
    },
  });
}

/**
 * React Query with the cache persisted to localStorage: the last loaded data is shown
 * instantly on the next launch and refreshed in the background.
 *
 * `cacheVersion`: bump it when API response shapes change, so stale cached data is dropped.
 */
export function QueryProvider({
  cacheVersion,
  children,
}: {
  cacheVersion: string;
  children: ReactNode;
}) {
  const [client] = useState(createQueryClient);
  const [persister] = useState(() =>
    createSyncStoragePersister({ storage: window.localStorage, key: storageKey("query-cache") }),
  );
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{ persister, maxAge: DAY_MS, buster: cacheVersion }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
