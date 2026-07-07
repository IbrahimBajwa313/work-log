import type { SerializedWorkLogDay } from "@/lib/admin-work-log";
import { liveTimerElapsedSeconds } from "@/lib/work-log-timer-rollover";

function liveSecondsForField(
  day: SerializedWorkLogDay | undefined,
  nowMs: number,
  minutesKey: "totalMinutes" | "deenMinutes" | "fitnessMinutes",
  startedAtKey: "timerStartedAt" | "deenTimerStartedAt" | "fitnessTimerStartedAt",
  viewDateKey?: string
): number {
  if (!day) return 0;
  const dayKey = day.dateKey;
  const viewKey = viewDateKey ?? dayKey;
  const startedAt = day[startedAtKey];

  if (startedAt && viewKey !== dayKey) {
    if (viewKey > dayKey) {
      return liveTimerElapsedSeconds(startedAt, nowMs, viewKey);
    }
    return Math.floor((day[minutesKey] ?? 0) * 60);
  }

  let secs = (day[minutesKey] ?? 0) * 60;
  if (startedAt) {
    secs += liveTimerElapsedSeconds(startedAt, nowMs, viewKey);
  }
  return Math.floor(secs);
}

export function liveSeconds(
  day: SerializedWorkLogDay | undefined,
  nowMs: number,
  viewDateKey?: string
): number {
  return liveSecondsForField(day, nowMs, "totalMinutes", "timerStartedAt", viewDateKey);
}

export function deenLiveSeconds(
  day: SerializedWorkLogDay | undefined,
  nowMs: number,
  viewDateKey?: string
): number {
  return liveSecondsForField(day, nowMs, "deenMinutes", "deenTimerStartedAt", viewDateKey);
}

export function fitnessLiveSeconds(
  day: SerializedWorkLogDay | undefined,
  nowMs: number,
  viewDateKey?: string
): number {
  return liveSecondsForField(day, nowMs, "fitnessMinutes", "fitnessTimerStartedAt", viewDateKey);
}

export function totalLiveSeconds(day: SerializedWorkLogDay | undefined, nowMs: number): number {
  return liveSeconds(day, nowMs) + deenLiveSeconds(day, nowMs) + fitnessLiveSeconds(day, nowMs);
}

export function formatDurationShort(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
