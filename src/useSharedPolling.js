import { useEffect, useRef } from "react";

export function useSharedPolling(refresh, enabled = true, intervalMs = 10000) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const run = () => {
      if (document.visibilityState === "visible") {
        Promise.resolve(refreshRef.current()).catch(() => null);
      }
    };
    const timer = window.setInterval(run, intervalMs);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
    };
  }, [enabled, intervalMs]);
}
