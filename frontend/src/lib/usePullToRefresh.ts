import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const THRESHOLD = 72;
const MOBILE = "(max-width: 768px)";

export function usePullToRefresh() {
  const qc = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(MOBILE).matches,
  );
  const startY = useRef(0);
  const active = useRef(false);
  const pullRef = useRef(0);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
    setPull(0);
    pullRef.current = 0;
  }, [qc]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!mobile || (!("ontouchstart" in window) && navigator.maxTouchPoints === 0)) return;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      active.current = true;
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!active.current) return;
      if (window.scrollY > 0) {
        active.current = false;
        setPull(0);
        pullRef.current = 0;
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        e.preventDefault();
        pullRef.current = Math.min(dy * 0.5, 100);
        setPull(pullRef.current);
      }
    };
    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      if (pullRef.current >= THRESHOLD) void refresh();
      else {
        setPull(0);
        pullRef.current = 0;
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
  }, [mobile, refresh]);

  const label = refreshing
    ? "Обновление…"
    : pull >= THRESHOLD
      ? "Отпустите"
      : "Потяните вниз";

  return { mobile, pull, refreshing, label, threshold: THRESHOLD };
}
