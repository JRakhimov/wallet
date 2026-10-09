/** Per-app settings for the shared UI code. Call `configurePlatform` before rendering. */

type PlatformConfig = {
  /** Short app id, used as a prefix for localStorage keys: "wallet", "nutrition". */
  appId: string;
  /** API origin, e.g. "https://api.example.com". Empty: same origin (Vite or nginx proxy). */
  apiBaseUrl: string;
};

let config: PlatformConfig | undefined;

export function configurePlatform(options: { appId: string; apiBaseUrl?: string }) {
  config = {
    appId: options.appId,
    apiBaseUrl: (options.apiBaseUrl || "").replace(/\/$/, ""),
  };
}

export function platform(): PlatformConfig {
  if (!config) {
    throw new Error("configurePlatform() must be called before the app renders");
  }
  return config;
}

/** localStorage key scoped to the current app: "wallet.session". */
export function storageKey(name: string) {
  return `${platform().appId}.${name}`;
}
