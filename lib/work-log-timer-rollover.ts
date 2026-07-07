import type { Collection, Filter, UpdateFilter } from "mongodb";
import type { AdminWorkLogDoc } from "@/lib/admin-work-log";
import type { SerializedWorkLogDay } from "@/lib/admin-work-log";
import { dateKeyAddDays, localDateKey } from "@/lib/date-keys";
import { capDailyMinutes } from "@/lib/work-log-time-guards";

export type TimerList = "work" | "deen" | "fitness";

export type TimerFieldSet = {
  minutes: "totalMinutes" | "deenMinutes" | "fitnessMinutes";
  startedAt: "timerStartedAt" | "deenTimerStartedAt" | "fitnessTimerStartedAt";
};

export const TIMER_FIELD_SETS: Record<TimerList, TimerFieldSet> = {
  work: { minutes: "totalMinutes", startedAt: "timerStartedAt" },
  deen: { minutes: "deenMinutes", startedAt: "deenTimerStartedAt" },
  fitness: { minutes: "fitnessMinutes", startedAt: "fitnessTimerStartedAt" },
};

export const TIMER_LISTS: TimerList[] = ["work", "deen", "fitness"];

export function midnightForDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function elapsedMinutes(startedAt: Date, until: Date): number {
  return Math.max(0, Math.round((until.getTime() - startedAt.getTime()) / 60_000));
}

/** Minutes from segmentStart until the start of the next calendar day. */
export function minutesUntilNextMidnight(segmentStart: Date, dayKey: string): number {
  const nextMidnight = midnightForDateKey(dateKeyAddDays(dayKey, 1));
  return elapsedMinutes(segmentStart, nextMidnight);
}

export function isTimerStale(startedAt: Date | string | null | undefined, todayKey: string): boolean {
  if (!startedAt) return false;
  return localDateKey(new Date(startedAt)) < todayKey;
}

/** Elapsed seconds for a running timer, optionally scoped to a calendar day. */
export function liveTimerElapsedSeconds(
  startedAt: Date | string,
  nowMs: number,
  viewDateKey?: string
): number {
  const startMs = new Date(startedAt).getTime();
  if (!viewDateKey) {
    return Math.max(0, Math.floor((nowMs - startMs) / 1000));
  }
  const startKey = localDateKey(new Date(startedAt));
  if (viewDateKey < startKey) return 0;
  if (viewDateKey > startKey) {
    const dayStart = midnightForDateKey(viewDateKey).getTime();
    return Math.max(0, Math.floor((nowMs - dayStart) / 1000));
  }
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

type DayTimerSlice = {
  dateKey: string;
  totalMinutes?: number;
  timerStartedAt?: string | Date | null;
  deenMinutes?: number;
  deenTimerStartedAt?: string | Date | null;
  fitnessMinutes?: number;
  fitnessTimerStartedAt?: string | Date | null;
};

function readStartedAt(day: DayTimerSlice, fields: TimerFieldSet): Date | null {
  const raw = day[fields.startedAt];
  return raw ? new Date(raw) : null;
}

function readMinutes(day: DayTimerSlice, fields: TimerFieldSet): number {
  return day[fields.minutes] ?? 0;
}

function writeMinutes(day: DayTimerSlice, fields: TimerFieldSet, minutes: number): void {
  day[fields.minutes] = minutes;
}

function writeStartedAt(day: DayTimerSlice, fields: TimerFieldSet, value: Date | null): void {
  day[fields.startedAt] = value ? value.toISOString() : null;
}

function ensureDay(map: Map<string, DayTimerSlice>, dateKey: string): DayTimerSlice {
  const existing = map.get(dateKey);
  if (existing) return existing;
  const created = { dateKey };
  map.set(dateKey, created);
  return created;
}

/**
 * Credit elapsed time through each past day and continue the timer on today from midnight.
 * Returns updated day slices when a stale timer was rolled over.
 */
export function applyTimerRolloverToDays(
  days: SerializedWorkLogDay[],
  now: Date = new Date()
): SerializedWorkLogDay[] {
  const todayKey = localDateKey(now);
  const byKey = new Map<string, SerializedWorkLogDay>(days.map((day) => [day.dateKey, { ...day }]));
  let changed = false;

  for (const list of TIMER_LISTS) {
    const fields = TIMER_FIELD_SETS[list];
    const running = days.find((day) => day[fields.startedAt]);
    if (!running) continue;

    const startedAt = readStartedAt(running, fields);
    if (!startedAt || !isTimerStale(startedAt, todayKey)) continue;

    const working = new Map<string, DayTimerSlice>(
      [...byKey.values()].map((day) => [day.dateKey, { ...day }])
    );

    let currentKey = localDateKey(startedAt);
    let segmentStart = startedAt;

    while (currentKey < todayKey) {
      const mins = minutesUntilNextMidnight(segmentStart, currentKey);
      const day = ensureDay(working, currentKey);
      writeMinutes(day, fields, capDailyMinutes(readMinutes(day, fields) + mins));
      writeStartedAt(day, fields, null);

      const nextKey = dateKeyAddDays(currentKey, 1);
      segmentStart = midnightForDateKey(nextKey);
      currentKey = nextKey;
    }

    const today = ensureDay(working, todayKey);
    writeStartedAt(today, fields, midnightForDateKey(todayKey));

    for (const [dateKey, slice] of working) {
      const prev = byKey.get(dateKey);
      const next = { ...(prev ?? { dateKey }), ...slice } as SerializedWorkLogDay;
      byKey.set(dateKey, next);
    }
    changed = true;
  }

  if (!changed) return days;
  return [...byKey.values()].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
}

async function creditDaySegment<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  scopeFilter: Filter<T>,
  dateKey: string,
  fields: TimerFieldSet,
  segmentStart: Date,
  until: Date,
  now: Date,
  clearTimer: boolean
): Promise<void> {
  const mins = elapsedMinutes(segmentStart, until);
  if (mins <= 0 && !clearTimer) return;

  const $inc = mins > 0 ? { [fields.minutes]: mins } : {};
  const $set: Record<string, unknown> = { updatedAt: now };
  if (clearTimer) {
    $set[fields.startedAt] = null;
  }

  await coll.updateOne(
    { dateKey, ...scopeFilter } as Filter<T>,
    {
      ...(Object.keys($inc).length ? { $inc } : {}),
      $set,
    } as UpdateFilter<T>,
    { upsert: mins > 0 || clearTimer }
  );

  if (mins > 0) {
    const doc = await coll.findOne({ dateKey, ...scopeFilter } as Filter<T>);
    if (doc) {
      const current = (doc[fields.minutes] as number | undefined) ?? 0;
      const capped = capDailyMinutes(current);
      if (capped !== current) {
        await coll.updateOne({ dateKey, ...scopeFilter } as Filter<T>, {
          $set: { [fields.minutes]: capped, updatedAt: now },
        } as UpdateFilter<T>);
      }
    }
  }
}

/** Split a cross-day running timer across calendar days and stop it. */
export async function stopCrossDayTimer<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  scopeFilter: Filter<T>,
  fields: TimerFieldSet,
  startedAt: Date,
  now: Date
): Promise<string> {
  const todayKey = localDateKey(now);
  let currentKey = localDateKey(startedAt);
  let segmentStart = startedAt;

  while (currentKey < todayKey) {
    const nextKey = dateKeyAddDays(currentKey, 1);
    await creditDaySegment(
      coll,
      scopeFilter,
      currentKey,
      fields,
      segmentStart,
      midnightForDateKey(nextKey),
      now,
      true
    );
    segmentStart = midnightForDateKey(nextKey);
    currentKey = nextKey;
  }

  await creditDaySegment(coll, scopeFilter, todayKey, fields, segmentStart, now, now, true);
  return todayKey;
}

/** Move a stale running timer onto today, crediting each past day up to midnight. */
export async function rolloverStaleTimer<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  scopeFilter: Filter<T>,
  fields: TimerFieldSet,
  startedAt: Date,
  now: Date
): Promise<string> {
  const todayKey = localDateKey(now);
  let currentKey = localDateKey(startedAt);
  let segmentStart = startedAt;

  while (currentKey < todayKey) {
    const nextKey = dateKeyAddDays(currentKey, 1);
    await creditDaySegment(
      coll,
      scopeFilter,
      currentKey,
      fields,
      segmentStart,
      midnightForDateKey(nextKey),
      now,
      true
    );
    segmentStart = midnightForDateKey(nextKey);
    currentKey = nextKey;
  }

  await coll.updateOne(
    { dateKey: todayKey, ...scopeFilter } as Filter<T>,
    {
      $set: {
        [fields.startedAt]: midnightForDateKey(todayKey),
        updatedAt: now,
      },
    } as UpdateFilter<T>,
    { upsert: true }
  );

  return todayKey;
}

export async function runTimerRolloverIfNeeded<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  scopeFilter: Filter<T>,
  now: Date = new Date()
): Promise<boolean> {
  const todayKey = localDateKey(now);
  let changed = false;

  for (const list of TIMER_LISTS) {
    const fields = TIMER_FIELD_SETS[list];
    const running = await coll.findOne({
      ...scopeFilter,
      [fields.startedAt]: { $ne: null },
    } as Filter<T>);
    if (!running) continue;

    const startedAt = running[fields.startedAt];
    if (!startedAt || !isTimerStale(startedAt, todayKey)) continue;

    await rolloverStaleTimer(coll, scopeFilter, fields, new Date(startedAt), now);
    changed = true;
  }

  return changed;
}
