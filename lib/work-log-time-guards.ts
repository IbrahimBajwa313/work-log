import { localDateKey } from "@/lib/date-keys";

export const MAX_DAILY_MINUTES = 24 * 60;

export function formatMinutesLabel(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m} minute${m === 1 ? "" : "s"}`;
  if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${h}h ${m}m`;
}

export function minutesSinceMidnight(dateKey: string, now: Date = new Date()): number {
  const midnight = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(midnight.getTime())) return MAX_DAILY_MINUTES;
  return Math.max(0, Math.floor((now.getTime() - midnight.getTime()) / 60_000));
}

export function isDateKeyToday(dateKey: string, now: Date = new Date()): boolean {
  return dateKey === localDateKey(now);
}

export function capDailyMinutes(minutes: number): number {
  return Math.min(MAX_DAILY_MINUTES, Math.max(0, minutes));
}

export function parseAdjustmentParts(h: number, m: number, sign: 1 | -1 = 1): number {
  return (Math.abs(h) * 60 + Math.abs(m)) * sign;
}

export function projectedTotalMinutes(opts: {
  mode: "add" | "set";
  currentMinutes: number;
  h: number;
  m: number;
  sign: 1 | -1;
  /** Treat the hours field as minutes when minutes is zero. */
  asMinutesOnly?: boolean;
}): number {
  const { mode, currentMinutes, h, m, sign, asMinutesOnly } = opts;
  if (mode === "set") {
    if (asMinutesOnly && h >= 1 && m === 0) return Math.abs(h);
    return Math.abs(h) * 60 + Math.abs(m);
  }
  const delta =
    asMinutesOnly && h >= 1 && m === 0
      ? Math.abs(h) * sign
      : (Math.abs(h) * 60 + Math.abs(m)) * sign;
  return Math.max(0, currentMinutes + delta);
}

export type TimeAdjustValidation = {
  ok: boolean;
  error?: string;
  minutes: number;
  suggestMinutesInstead?: boolean;
  minutesIfCorrected?: number;
  warnExceedsDay?: boolean;
  projectedTotal?: number;
};

export function validateTimeAdjustment(opts: {
  h: number;
  m: number;
  sign: 1 | -1;
  mode: "add" | "set";
  currentMinutes: number;
  dateKey: string;
  now?: Date;
}): TimeAdjustValidation {
  const { h, m, sign, mode, currentMinutes, dateKey, now = new Date() } = opts;

  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) {
    return { ok: false, error: "Enter valid hours and minutes.", minutes: 0 };
  }

  const minutes = parseAdjustmentParts(h, m, sign);
  if (mode === "add" && minutes === 0) {
    return { ok: false, error: "Enter a duration to add or remove.", minutes: 0 };
  }

  const projectedTotal = projectedTotalMinutes({ mode, currentMinutes, h, m, sign });
  if (projectedTotal > MAX_DAILY_MINUTES) {
    return {
      ok: false,
      error: `Daily total cannot exceed 24 hours (would be ${formatMinutesLabel(projectedTotal)}).`,
      minutes,
      projectedTotal,
    };
  }

  const today = isDateKeyToday(dateKey, now);
  const elapsed = today ? minutesSinceMidnight(dateKey, now) : MAX_DAILY_MINUTES;

  if (sign > 0 && h >= 1 && m === 0 && h <= 59) {
    const correctedTotal = projectedTotalMinutes({
      mode,
      currentMinutes,
      h,
      m,
      sign,
      asMinutesOnly: true,
    });
    if (projectedTotal > elapsed && correctedTotal <= MAX_DAILY_MINUTES) {
      const minutesIfCorrected =
        mode === "set" ? h : parseAdjustmentParts(h, 0, sign);
      return {
        ok: true,
        minutes,
        suggestMinutesInstead: true,
        minutesIfCorrected,
        projectedTotal,
      };
    }
  }

  if (today && sign > 0 && projectedTotal > elapsed) {
    return {
      ok: true,
      minutes,
      warnExceedsDay: true,
      projectedTotal,
    };
  }

  return { ok: true, minutes, projectedTotal };
}

/** Returns API minutes to send, or null if the user cancelled. */
export function confirmTimeAdjustment(
  validation: TimeAdjustValidation,
  h: number,
  dateKey: string,
  now: Date = new Date()
): number | null {
  if (!validation.ok) {
    window.alert(validation.error ?? "Invalid time entry.");
    return null;
  }

  if (validation.suggestMinutesInstead && validation.minutesIfCorrected !== undefined) {
    const elapsed = minutesSinceMidnight(dateKey, now);
    const useMinutes = window.confirm(
      `You entered ${h} hour${h === 1 ? "" : "s"} with 0 minutes.\n\n` +
        `That is more than the ${formatMinutesLabel(elapsed)} elapsed since midnight today.\n\n` +
        `Did you mean ${h} minute${h === 1 ? "" : "s"} instead?\n\n` +
        `OK = use ${h} minutes\nCancel = keep ${h} hours`
    );
    return useMinutes ? validation.minutesIfCorrected : validation.minutes;
  }

  if (validation.warnExceedsDay) {
    const elapsed = minutesSinceMidnight(dateKey, now);
    const ok = window.confirm(
      `This would log ${formatMinutesLabel(validation.projectedTotal ?? 0)}, but only ` +
        `${formatMinutesLabel(elapsed)} have passed since midnight today.\n\nAre you sure?`
    );
    return ok ? validation.minutes : null;
  }

  return validation.minutes;
}

export function loggedTimeLooksImpossible(
  loggedMinutes: number,
  dateKey: string,
  now: Date = new Date()
): boolean {
  if (!isDateKeyToday(dateKey, now)) return loggedMinutes > MAX_DAILY_MINUTES;
  return loggedMinutes > minutesSinceMidnight(dateKey, now);
}
