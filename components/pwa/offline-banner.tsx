"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { getSyncQueue } from "@/lib/offline/store";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const queue = await getSyncQueue();
      if (!cancelled) setPending(queue.length);
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [online]);

  if (online && pending === 0) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[60] safe-top"
      role="status"
      aria-live="polite"
    >
      <div
        className={`mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 py-2 text-xs font-medium ${
          online
            ? "bg-amber-500/90 text-[#1a1200]"
            : "bg-slate-800/95 text-white border-b border-[var(--card-border)]"
        }`}
      >
        {online ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
            Syncing {pending} offline change{pending === 1 ? "" : "s"}…
          </>
        ) : (
          <>
            <CloudOff className="h-3.5 w-3.5 shrink-0" />
            Offline — your changes are saved locally and will sync when you&apos;re back online
          </>
        )}
      </div>
    </div>
  );
}
