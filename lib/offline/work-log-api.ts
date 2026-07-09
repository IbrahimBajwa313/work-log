import type { SerializedWorkLogDay } from "@/lib/admin-work-log";
import { applyClientWorkLogAction } from "@/lib/offline/client-mutations";
import { applyCarryOverToDays } from "@/lib/work-log-carry-over";
import { applyTimerRolloverToDays } from "@/lib/work-log-timer-rollover";
import { localDateKey } from "@/lib/date-keys";
import {
  enqueueSync,
  getCachedDays,
  getCachedSettings,
  getSyncQueue,
  removeSyncEntry,
  upsertCachedDay,
  cacheDays,
  cacheSettings,
  removeCachedDay,
} from "@/lib/offline/store";

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

type FetchResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  fromCache?: boolean;
  offline?: boolean;
};

export async function fetchWorkLogDays(
  apiBase: string,
  personId: string,
  userId: string,
  authorizedInit: (init?: RequestInit) => RequestInit,
  options?: { from?: string }
): Promise<FetchResult<{ days: SerializedWorkLogDay[] }>> {
  const params = new URLSearchParams();
  params.set("personId", personId);
  if (options?.from) params.set("from", options.from);
  const personQuery = `?${params.toString()}`;

  if (isOnline()) {
    try {
      const res = await fetch(`${apiBase}${personQuery}`, authorizedInit());
      const data = await res.json().catch(() => null);
      if (res.ok && data && Array.isArray(data.days)) {
        let days = data.days as SerializedWorkLogDay[];
        const cachedSettings = await getCachedSettings(userId);
        if (cachedSettings && typeof cachedSettings === "object" && "carryOverIncompleteTasks" in cachedSettings) {
          days = applyCarryOverToDays(
            days,
            Boolean((cachedSettings as { carryOverIncompleteTasks?: boolean }).carryOverIncompleteTasks)
          );
        }
        days = applyTimerRolloverToDays(days);
        await cacheDays(userId, personId, days);
        return { ok: true, data: { days }, fromCache: false };
      }
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : `Request failed (${res.status})`;
        const cached = await getCachedDays(userId, personId);
        if (cached) {
          let days = cached;
          const cachedSettings = await getCachedSettings(userId);
          if (
            cachedSettings &&
            typeof cachedSettings === "object" &&
            "carryOverIncompleteTasks" in cachedSettings
          ) {
            days = applyCarryOverToDays(
              days,
              Boolean((cachedSettings as { carryOverIncompleteTasks?: boolean }).carryOverIncompleteTasks)
            );
            days = applyTimerRolloverToDays(days);
            await cacheDays(userId, personId, days);
          }
          return { ok: true, data: { days }, fromCache: true, offline: !isOnline() };
        }
        return { ok: false, error: msg };
      }
    } catch {
      // fall through to cache
    }
  }

  const cached = await getCachedDays(userId, personId);
  if (cached) {
    const cachedSettings = await getCachedSettings(userId);
    let days = cached;
    if (cachedSettings && typeof cachedSettings === "object" && "carryOverIncompleteTasks" in cachedSettings) {
      days = applyCarryOverToDays(
        days,
        Boolean((cachedSettings as { carryOverIncompleteTasks?: boolean }).carryOverIncompleteTasks)
      );
      days = applyTimerRolloverToDays(days);
      await cacheDays(userId, personId, days);
    }
    return { ok: true, data: { days }, fromCache: true, offline: true };
  }
  return { ok: false, error: "Failed to load work log.", offline: !isOnline() };
}

export async function fetchWorkLogSettings(
  settingsApiBase: string,
  userId: string,
  authorizedInit: (init?: RequestInit) => RequestInit
): Promise<FetchResult<{ settings: unknown }>> {
  if (isOnline()) {
    try {
      const res = await fetch(settingsApiBase, authorizedInit());
      const data = await res.json().catch(() => null);
      if (res.ok && data && typeof data === "object" && "settings" in data) {
        await cacheSettings(userId, (data as { settings: unknown }).settings);
        return { ok: true, data: { settings: (data as { settings: unknown }).settings } };
      }
    } catch {
      // fall through
    }
  }

  const cached = await getCachedSettings(userId);
  if (cached) {
    return { ok: true, data: { settings: cached }, fromCache: true, offline: !isOnline() };
  }
  return { ok: false, error: "Settings unavailable offline." };
}

export async function patchWorkLogDay(
  apiBase: string,
  dateKey: string,
  personId: string,
  userId: string,
  body: Record<string, unknown>,
  authorizedInit: (init?: RequestInit) => RequestInit,
  allDays: SerializedWorkLogDay[] = []
): Promise<FetchResult<{ day: SerializedWorkLogDay }>> {
  const personQuery = `?personId=${encodeURIComponent(personId)}`;
  const url = `${apiBase}/${encodeURIComponent(dateKey)}${personQuery}`;

  const todayKey = localDateKey(new Date());
  const shouldRollover =
    body.action !== "adjustMinutes" || dateKey === todayKey;
  const rolledDays = shouldRollover ? applyTimerRolloverToDays(allDays) : allDays;
  const currentDay = rolledDays.find((d) => d.dateKey === dateKey) ?? null;
  const optimistic = applyClientWorkLogAction(currentDay, dateKey, body, rolledDays);
  const nextDays = rolledDays.map((d) => (d.dateKey === optimistic.dateKey ? optimistic : d));
  await cacheDays(userId, personId, nextDays);

  if (isOnline()) {
    try {
      const res = await fetch(
        url,
        authorizedInit({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data && typeof data === "object" && "day" in data) {
        const day = (data as { day: SerializedWorkLogDay }).day;
        await upsertCachedDay(userId, personId, day);
        return { ok: true, data: { day } };
      }
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : `Request failed (${res.status})`;
        await enqueueSync({
          url,
          method: "PATCH",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        });
        return { ok: true, data: { day: optimistic }, offline: true, error: msg };
      }
    } catch {
      await enqueueSync({
        url,
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      return { ok: true, data: { day: optimistic }, offline: true };
    }
  }

  await enqueueSync({
    url,
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return { ok: true, data: { day: optimistic }, offline: true };
}

export async function deleteWorkLogDay(
  apiBase: string,
  dateKey: string,
  personId: string,
  userId: string,
  authorizedInit: (init?: RequestInit) => RequestInit
): Promise<FetchResult<Record<string, never>>> {
  const personQuery = `?personId=${encodeURIComponent(personId)}`;
  const url = `${apiBase}/${encodeURIComponent(dateKey)}${personQuery}`;

  await removeCachedDay(userId, personId, dateKey);

  if (isOnline()) {
    try {
      const res = await fetch(url, authorizedInit({ method: "DELETE" }));
      if (res.ok) return { ok: true };
      await enqueueSync({ url, method: "DELETE" });
      return { ok: true, offline: true };
    } catch {
      await enqueueSync({ url, method: "DELETE" });
      return { ok: true, offline: true };
    }
  }

  await enqueueSync({ url, method: "DELETE" });
  return { ok: true, offline: true };
}

export async function patchWorkLogSettings(
  settingsApiBase: string,
  userId: string,
  body: Record<string, unknown>,
  authorizedInit: (init?: RequestInit) => RequestInit
): Promise<FetchResult<{ settings: unknown }>> {
  if (isOnline()) {
    try {
      const res = await fetch(
        settingsApiBase,
        authorizedInit({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data && typeof data === "object" && "settings" in data) {
        await cacheSettings(userId, (data as { settings: unknown }).settings);
        return { ok: true, data: { settings: (data as { settings: unknown }).settings } };
      }
    } catch {
      // fall through
    }
  }

  await enqueueSync({
    url: settingsApiBase,
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const cached = await getCachedSettings(userId);
  return { ok: true, data: { settings: cached }, offline: true };
}

/** Replay queued mutations when back online. */
export async function flushSyncQueue(
  authorizedInit: (init?: RequestInit) => RequestInit
): Promise<{ synced: number; failed: number }> {
  if (!isOnline()) return { synced: 0, failed: 0 };

  const queue = await getSyncQueue();
  let synced = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      const res = await fetch(
        entry.url,
        authorizedInit({
          method: entry.method,
          headers: entry.headers,
          body: entry.body,
        })
      );
      if (res.ok) {
        await removeSyncEntry(entry.id);
        synced += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { synced, failed };
}
