import { useEffect, useRef } from "react";

/** Shows Telegram's native back button while the calling screen is mounted. */
export function useTelegramBack(onBack: () => void) {
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    const back = window.Telegram?.WebApp?.BackButton;
    if (!back) {
      return;
    }
    const handler = () => latest.current();
    back.show();
    back.onClick(handler);
    return () => {
      back.offClick(handler);
      back.hide();
    };
  }, []);
}
