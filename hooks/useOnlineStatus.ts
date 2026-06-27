"use client";

import { useCallback, useEffect, useState } from "react";

/** navigator.onLine can stay stale; verify with a lightweight same-origin request. */
async function probeConnectivity(): Promise<boolean> {
  try {
    const res = await fetch("/manifest.webmanifest", {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) return true;
  } catch {
    /* network error */
  }
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const verify = useCallback(async () => {
    setOnline(await probeConnectivity());
  }, []);

  useEffect(() => {
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void verify();
    };

    window.addEventListener("online", onVisible);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    void verify();

    return () => {
      window.removeEventListener("online", onVisible);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [verify]);

  return online;
}
