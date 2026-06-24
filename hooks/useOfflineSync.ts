"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSyncQueue } from "@/lib/offline/store";
import { flushSyncQueue } from "@/lib/offline/work-log-api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

type UseOfflineSyncOptions = {
  authorizedInit: (init?: RequestInit) => RequestInit;
  onSynced?: () => void;
};

/** Flushes the offline mutation queue when connectivity returns. */
export function useOfflineSync({ authorizedInit, onSynced }: UseOfflineSyncOptions) {
  const online = useOnlineStatus();
  const syncingRef = useRef(false);

  const sync = useCallback(async () => {
    if (!online || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const queue = await getSyncQueue();
      if (queue.length === 0) return;
      const result = await flushSyncQueue(authorizedInit);
      if (result.synced > 0) onSynced?.();
    } finally {
      syncingRef.current = false;
    }
  }, [online, authorizedInit, onSynced]);

  useEffect(() => {
    if (online) void sync();
  }, [online, sync]);

  return { sync, online };
}
