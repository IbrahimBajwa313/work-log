import type { SerializedWorkLogDay } from "@/lib/admin-work-log";

export function liveSeconds(day: SerializedWorkLogDay | undefined, nowMs: number): number {
  if (!day) return 0;
  let secs = (day.totalMinutes ?? 0) * 60;
  if (day.timerStartedAt) {
    secs += Math.max(0, (nowMs - new Date(day.timerStartedAt).getTime()) / 1000);
  }
  return Math.floor(secs);
}

export function deenLiveSeconds(day: SerializedWorkLogDay | undefined, nowMs: number): number {
  if (!day) return 0;
  let secs = (day.deenMinutes ?? 0) * 60;
  if (day.deenTimerStartedAt) {
    secs += Math.max(0, (nowMs - new Date(day.deenTimerStartedAt).getTime()) / 1000);
  }
  return Math.floor(secs);
}

export function fitnessLiveSeconds(day: SerializedWorkLogDay | undefined, nowMs: number): number {
  if (!day) return 0;
  let secs = (day.fitnessMinutes ?? 0) * 60;
  if (day.fitnessTimerStartedAt) {
    secs += Math.max(0, (nowMs - new Date(day.fitnessTimerStartedAt).getTime()) / 1000);
  }
  return Math.floor(secs);
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
