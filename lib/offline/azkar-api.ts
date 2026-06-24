import type { AzkarPeriod } from "@/lib/azkar";
import { getAdhkarForPeriod } from "@/lib/data/azkar-config";
import {
  cacheAzkar,
  enqueueSync,
  getCachedAzkar,
  type CachedAzkarState,
} from "@/lib/offline/store";
import { isOnline } from "@/lib/offline/work-log-api";

function buildOfflineAzkarState(
  period: AzkarPeriod,
  tickedIds: string[] = [],
  secondsSpent = 0
): CachedAzkarState {
  const items = getAdhkarForPeriod(period);
  const read = tickedIds.length;
  const total = items.length;
  const complete = read >= total && total > 0;
  return { items, tickedIds, complete, total, read, secondsSpent };
}

export async function fetchAzkarState(
  dateKey: string,
  period: AzkarPeriod,
  personId: string,
  userId: string
): Promise<{ ok: boolean; state?: CachedAzkarState; fromCache?: boolean; error?: string }> {
  const qs = personId ? `?personId=${encodeURIComponent(personId)}` : "";
  const url = `/api/work-log/${dateKey}/azkar/${period}${qs}`;

  if (isOnline()) {
    try {
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const state: CachedAzkarState = {
          items: (data as CachedAzkarState).items ?? getAdhkarForPeriod(period),
          tickedIds: (data as CachedAzkarState).tickedIds ?? [],
          complete: Boolean((data as CachedAzkarState).complete),
          total: (data as CachedAzkarState).total ?? 0,
          read: (data as CachedAzkarState).read ?? 0,
          secondsSpent: (data as CachedAzkarState).secondsSpent ?? 0,
        };
        await cacheAzkar(userId, personId, dateKey, period, state);
        return { ok: true, state };
      }
    } catch {
      // fall through
    }
  }

  const cached = await getCachedAzkar(userId, personId, dateKey, period);
  if (cached) {
    return { ok: true, state: cached, fromCache: true };
  }

  const fallback = buildOfflineAzkarState(period);
  return { ok: true, state: fallback, fromCache: true };
}

export async function patchAzkar(
  dateKey: string,
  period: AzkarPeriod,
  personId: string,
  userId: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; state?: CachedAzkarState; offline?: boolean }> {
  const qs = personId ? `?personId=${encodeURIComponent(personId)}` : "";
  const url = `/api/work-log/${dateKey}/azkar/${period}${qs}`;

  const cached =
    (await getCachedAzkar(userId, personId, dateKey, period)) ??
    buildOfflineAzkarState(period);

  let next: CachedAzkarState = { ...cached };

  if (body.action === "toggle" && typeof body.adhkarId === "string") {
    const id = body.adhkarId;
    const ticked = new Set(next.tickedIds);
    if (ticked.has(id)) ticked.delete(id);
    else ticked.add(id);
    next.tickedIds = [...ticked];
    next.read = next.tickedIds.length;
    next.complete = next.read >= next.total && next.total > 0;
  } else if (body.action === "addTime" && typeof body.seconds === "number") {
    next.secondsSpent = Math.min(3600, next.secondsSpent + Math.floor(body.seconds));
  }

  await cacheAzkar(userId, personId, dateKey, period, next);

  if (isOnline()) {
    try {
      const res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data) {
          const state: CachedAzkarState = {
            items: (data as CachedAzkarState).items ?? next.items,
            tickedIds: (data as CachedAzkarState).tickedIds ?? next.tickedIds,
            complete: Boolean((data as CachedAzkarState).complete),
            total: (data as CachedAzkarState).total ?? next.total,
            read: (data as CachedAzkarState).read ?? next.read,
            secondsSpent: (data as CachedAzkarState).secondsSpent ?? next.secondsSpent,
          };
          await cacheAzkar(userId, personId, dateKey, period, state);
          return { ok: true, state };
        }
        return { ok: true, state: next };
      }
    } catch {
      // queue
    }
  }

  await enqueueSync({
    url,
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return { ok: true, state: next, offline: true };
}
