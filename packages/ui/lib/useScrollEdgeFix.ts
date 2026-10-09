import { RefObject, useEffect } from "react";

/**
 * iOS WebView quirk: when a scroll container sits exactly at its top or bottom edge,
 * a new swipe may go to the (non-scrollable) page instead and the content does not move.
 * Keeping the container 1px away from the edges on touch start makes every swipe scroll it.
 */
export function useScrollEdgeFix(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const onTouchStart = () => {
      const maxScroll = element.scrollHeight - element.clientHeight;
      if (maxScroll <= 1) {
        return; // Nothing to scroll.
      }
      if (element.scrollTop <= 0) {
        element.scrollTop = 1;
      } else if (element.scrollTop >= maxScroll) {
        element.scrollTop = maxScroll - 1;
      }
    };

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => element.removeEventListener("touchstart", onTouchStart);
  }, [ref]);
}
