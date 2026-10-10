import "@ui/styles/themes/blue.css";
import "@ui/styles/base.css";
import "./styles.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { configurePlatform } from "@ui/lib/platform";
import { QueryProvider } from "@ui/lib/query";
import { App } from "./App";

configurePlatform({
  appId: "nutrition",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
});

// Bump when API response shapes change, so stale cached data is discarded.
const CACHE_VERSION = "2";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryProvider cacheVersion={CACHE_VERSION}>
      <App />
    </QueryProvider>
  </React.StrictMode>,
);
