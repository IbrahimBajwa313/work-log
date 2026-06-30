import type { SerializedWorkLogDay } from "@/lib/admin-work-log";
import { azkarKey, daysKey, offlineIdb } from "@/lib/offline/idb";

export type OfflineUser = {
  id: string;
  email: string;
  name: string;
  picture?: string;
};

export type SyncQueueEntry = {
  id: string;
  url: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
  createdAt: number;
};

export type CachedAzkarState = {
  items: unknown[];
  counts: Record<string, number>;
  /** Legacy field kept for cache migration. */
  tickedIds?: string[];
  complete: boolean;
  total: number;
  read: number;
  secondsSpent: number;
};

const USER_KEY = "user";

export async function cacheUser(user: OfflineUser): Promise<void> {
  await offlineIdb.set("meta", USER_KEY, user);
}

export async function getCachedUser(): Promise<OfflineUser | null> {
  return offlineIdb.get<OfflineUser>("meta", USER_KEY);
}

export async function clearCachedUser(): Promise<void> {
  await offlineIdb.delete("meta", USER_KEY);
}

export async function cacheDays(
  userId: string,
  personId: string,
  days: SerializedWorkLogDay[]
): Promise<void> {
  await offlineIdb.set("days", daysKey(userId, personId), days);
}

export async function getCachedDays(
  userId: string,
  personId: string
): Promise<SerializedWorkLogDay[] | null> {
  return offlineIdb.get<SerializedWorkLogDay[]>("days", daysKey(userId, personId));
}

export async function upsertCachedDay(
  userId: string,
  personId: string,
  day: SerializedWorkLogDay
): Promise<void> {
  const existing = (await getCachedDays(userId, personId)) ?? [];
  const rest = existing.filter((d) => d.dateKey !== day.dateKey);
  await cacheDays(userId, personId, [...rest, day].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1)));
}

export async function removeCachedDay(
  userId: string,
  personId: string,
  dateKey: string
): Promise<void> {
  const existing = (await getCachedDays(userId, personId)) ?? [];
  await cacheDays(userId, personId, existing.filter((d) => d.dateKey !== dateKey));
}

export async function cacheSettings(userId: string, settings: unknown): Promise<void> {
  await offlineIdb.set("settings", userId, settings);
}

export async function getCachedSettings(userId: string): Promise<unknown | null> {
  return offlineIdb.get("settings", userId);
}

export async function cacheAzkar(
  userId: string,
  personId: string,
  dateKey: string,
  period: string,
  state: CachedAzkarState
): Promise<void> {
  await offlineIdb.set("azkar", azkarKey(userId, personId, dateKey, period), state);
}

export async function getCachedAzkar(
  userId: string,
  personId: string,
  dateKey: string,
  period: string
): Promise<CachedAzkarState | null> {
  return offlineIdb.get<CachedAzkarState>(
    "azkar",
    azkarKey(userId, personId, dateKey, period)
  );
}

export async function enqueueSync(entry: Omit<SyncQueueEntry, "id" | "createdAt">): Promise<void> {
  const id = crypto.randomUUID();
  const row: SyncQueueEntry = { ...entry, id, createdAt: Date.now() };
  await offlineIdb.set("syncQueue", id, row);
}

export async function getSyncQueue(): Promise<SyncQueueEntry[]> {
  const rows = await offlineIdb.getAll<SyncQueueEntry>("syncQueue");
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeSyncEntry(id: string): Promise<void> {
  await offlineIdb.delete("syncQueue", id);
}

export async function clearSyncQueue(): Promise<void> {
  const rows = await getSyncQueue();
  for (const row of rows) {
    await removeSyncEntry(row.id);
  }
}
