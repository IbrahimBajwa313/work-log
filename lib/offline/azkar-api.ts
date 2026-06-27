import type { AdhkarItem, AzkarPeriod } from "@/lib/azkar";
import {
  applyAdhkarCountUpdate,
  computeAzkarProgress,
  getAdhkarCount,
  resolveAzkarCounts,
} from "@/lib/azkar";
import { getAdhkarForPeriod } from "@/lib/data/azkar-config";
import {
  cacheAzkar,
  enqueueSync,
  getCachedAzkar,
  type CachedAzkarState,
} from "@/lib/offline/store";
import { canSyncAzkarProgress, resolveAzkarUserId } from "@/lib/offline/azkar-local";
import { isOnline } from "@/lib/offline/work-log-api";

function buildOfflineAzkarState(
  period: AzkarPeriod,
  counts: Record<string, number> = {},
  secondsSpent = 0
): CachedAzkarState {
  const items = getAdhkarForPeriod(period);
  const { total, read, complete } = computeAzkarProgress(counts, items);
  return { items, counts, complete, total, read, secondsSpent };
}

function applyLocalAzkarPatch(
  cached: CachedAzkarState,
  body: Record<string, unknown>
): CachedAzkarState {
  const items = cached.items as AdhkarItem[];
  const counts = resolveAzkarCounts({ counts: cached.counts, tickedIds: cached.tickedIds }, items);
  let nextCounts = counts;

  if (body.action === "toggle" && typeof body.adhkarId === "string") {
    const item = items.find((entry) => entry.id === body.adhkarId);
    if (item) {
      const mode = getAdhkarCount(counts, item) >= item.repeatCount ? "reset" : "complete";
      nextCounts = applyAdhkarCountUpdate(counts, item, mode);
    }
  } else if (body.action === "increment" && typeof body.adhkarId === "string") {
    const item = items.find((entry) => entry.id === body.adhkarId);
    if (item) nextCounts = applyAdhkarCountUpdate(counts, item, "increment");
  } else if (body.action === "complete" && typeof body.adhkarId === "string") {
    const item = items.find((entry) => entry.id === body.adhkarId);
    if (item) nextCounts = applyAdhkarCountUpdate(counts, item, "complete");
  } else if (body.action === "reset" && typeof body.adhkarId === "string") {
    const item = items.find((entry) => entry.id === body.adhkarId);
    if (item) nextCounts = applyAdhkarCountUpdate(counts, item, "reset");
  } else if (
    body.action === "setCount" &&
    typeof body.adhkarId === "string" &&
    typeof body.count === "number"
  ) {
    const item = items.find((entry) => entry.id === body.adhkarId);
    if (item) nextCounts = applyAdhkarCountUpdate(counts, item, "set", body.count);
  } else if (body.action === "addTime" && typeof body.seconds === "number") {
    const secondsSpent = Math.min(3600, cached.secondsSpent + Math.floor(body.seconds));
    const { total, read, complete } = computeAzkarProgress(counts, items);
    return { ...cached, counts, total, read, complete, secondsSpent };
  }

  const { total, read, complete } = computeAzkarProgress(nextCounts, items);
  return { ...cached, counts: nextCounts, total, read, complete };
}

function normalizeAzkarState(data: Record<string, unknown>, period: AzkarPeriod): CachedAzkarState {
  const items = (data.items as AdhkarItem[]) ?? getAdhkarForPeriod(period);
  const counts = resolveAzkarCounts(
    {
      counts: data.counts as Record<string, number> | undefined,
      tickedIds: data.tickedIds as string[] | undefined,
    },
    items
  );
  const { total, read, complete } = computeAzkarProgress(counts, items);
  return {
    items,
    counts,
    tickedIds: data.tickedIds as string[] | undefined,
    complete,
    total: typeof data.total === "number" ? data.total : total,
    read: typeof data.read === "number" ? data.read : read,
    secondsSpent: typeof data.secondsSpent === "number" ? data.secondsSpent : 0,
  };
}

const patchQueues = new Map<string, Promise<{ ok: boolean; state?: CachedAzkarState; offline?: boolean }>>();

function queueAzkarPatch(
  key: string,
  fn: () => Promise<{ ok: boolean; state?: CachedAzkarState; offline?: boolean }>
) {
  const prev = patchQueues.get(key) ?? Promise.resolve({ ok: true });
  const next = prev.then(fn, fn);
  patchQueues.set(
    key,
    next.finally(() => {
      if (patchQueues.get(key) === next) patchQueues.delete(key);
    })
  );
  return next;
}

export async function fetchAzkarState(
  dateKey: string,
  period: AzkarPeriod,
  personId: string,
  userId?: string | null
): Promise<{ ok: boolean; state?: CachedAzkarState; fromCache?: boolean; error?: string }> {
  const resolvedUserId = resolveAzkarUserId(userId);
  const qs = personId ? `?personId=${encodeURIComponent(personId)}` : "";
  const url = `/api/work-log/${dateKey}/azkar/${period}${qs}`;

  if (isOnline() && canSyncAzkarProgress(resolvedUserId)) {
    try {
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const state = normalizeAzkarState(data as Record<string, unknown>, period);
        await cacheAzkar(resolvedUserId, personId, dateKey, period, state);
        return { ok: true, state };
      }
    } catch {
      // fall through to cache / bundled content
    }
  }

  const cached = await getCachedAzkar(resolvedUserId, personId, dateKey, period);
  if (cached) {
    const state = normalizeAzkarState(cached as unknown as Record<string, unknown>, period);
    return { ok: true, state, fromCache: true };
  }

  const fallback = buildOfflineAzkarState(period);
  await cacheAzkar(resolvedUserId, personId, dateKey, period, fallback);
  return { ok: true, state: fallback, fromCache: true };
}

export async function patchAzkar(
  dateKey: string,
  period: AzkarPeriod,
  personId: string,
  userId?: string | null,
  body: Record<string, unknown> = {}
): Promise<{ ok: boolean; state?: CachedAzkarState; offline?: boolean }> {
  const resolvedUserId = resolveAzkarUserId(userId);
  const queueKey = `${resolvedUserId}:${personId}:${dateKey}:${period}`;

  return queueAzkarPatch(queueKey, () =>
    patchAzkarInner(dateKey, period, personId, resolvedUserId, body)
  );
}

async function patchAzkarInner(
  dateKey: string,
  period: AzkarPeriod,
  personId: string,
  resolvedUserId: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; state?: CachedAzkarState; offline?: boolean }> {
  const qs = personId ? `?personId=${encodeURIComponent(personId)}` : "";
  const url = `/api/work-log/${dateKey}/azkar/${period}${qs}`;

  const cachedRaw =
    (await getCachedAzkar(resolvedUserId, personId, dateKey, period)) ??
    buildOfflineAzkarState(period);
  const cached = normalizeAzkarState(cachedRaw as unknown as Record<string, unknown>, period);
  const next = applyLocalAzkarPatch(cached, body);

  await cacheAzkar(resolvedUserId, personId, dateKey, period, next);

  if (isOnline() && canSyncAzkarProgress(resolvedUserId)) {
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
          const state = normalizeAzkarState(data as Record<string, unknown>, period);
          await cacheAzkar(resolvedUserId, personId, dateKey, period, state);
          return { ok: true, state };
        }
        return { ok: true, state: next };
      }
    } catch {
      // queue when logged in but request failed
    }

    await enqueueSync({
      url,
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    return { ok: true, state: next, offline: true };
  }

  return { ok: true, state: next, offline: !isOnline() };
}
