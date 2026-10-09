/** Telegram Mini App SDK: loading, window setup and theme colors. */

// Keep in sync with the preload link in vite.config.ts.
export const TELEGRAM_SDK_URL = "https://telegram.org/js/telegram-web-app.js";

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
  };
  colorScheme?: string;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
};

let sdkLoading: Promise<void> | undefined;

/**
 * True when the page was launched by Telegram. Telegram passes launch data in the URL hash
 * and the SDK keeps it in sessionStorage across reloads, so no SDK is needed to check it.
 */
export function openedInTelegram() {
  return (
    location.hash.includes("tgWebAppData") ||
    sessionStorage.getItem("__telegram__initParams") !== null
  );
}

export function loadTelegramSdk() {
  if (window.Telegram?.WebApp) {
    return Promise.resolve();
  }
  sdkLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TELEGRAM_SDK_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkLoading = undefined;
      script.remove();
      reject(new Error("Не удалось загрузить Telegram. Переоткройте приложение"));
    };
    document.head.appendChild(script);
  });
  return sdkLoading;
}

/** Loads the SDK in the background and configures the Telegram window. */
export function initTelegram() {
  if (!openedInTelegram()) {
    return;
  }
  loadTelegramSdk()
    .then(() => {
      const app = window.Telegram?.WebApp;
      app?.ready();
      app?.expand();
      app?.disableVerticalSwipes?.();
      syncTelegramColors();
    })
    .catch(() => {
      // Sign-in reports SDK errors; the window setup is cosmetic.
    });
}

/** Closes the Mini App. Available only inside Telegram. */
export function closeTelegramApp() {
  window.Telegram?.WebApp?.close();
}

export async function telegramInitData() {
  await loadTelegramSdk();
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) {
    throw new Error("Откройте кошелёк через Telegram");
  }
  return initData;
}

/** Paints Telegram's header and background with the app's current theme colors. */
export function syncTelegramColors() {
  const app = window.Telegram?.WebApp;
  if (!app) {
    return;
  }
  const style = getComputedStyle(document.documentElement);
  const background = style.getPropertyValue("--bg").trim();
  const surface = style.getPropertyValue("--surface").trim();
  app.setHeaderColor?.(surface);
  app.setBackgroundColor?.(background);
  app.setBottomBarColor?.(surface);
}
