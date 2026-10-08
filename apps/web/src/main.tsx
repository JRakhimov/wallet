import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { App } from "./App";
import "./styles.css";

const DAY_MS = 24 * 60 * 60 * 1000;
// Bump when API response shapes change, so stale cached data is discarded.
const CACHE_VERSION = "1";

const queryClient = new QueryClient({
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

// Last loaded data is shown instantly on the next launch and refreshed in the background.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "wallet.query-cache",
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: DAY_MS, buster: CACHE_VERSION }}
    >
      <App />
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
