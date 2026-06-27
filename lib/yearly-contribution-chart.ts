import { localDateKey } from "@/lib/date-keys";
import { formatDurationShort } from "@/lib/work-log-live-seconds";

/** GitHub uses 53 week-columns on profile contribution graphs. */
export const CONTRIBUTION_WEEKS = 53;

export type ContributionLevel = 0 | 1 | 2 | 3 | 4;

export type ContributionCell = {
  dateKey: string | null;
  totalSeconds: number;
  level: ContributionLevel;
  tooltip: string;
  /** Future day — render as empty space, not a dark square. */
  isFuture: boolean;
};

export type ContributionWeek = {
  monthLabel: string | null;
  days: ContributionCell[];
};

export type YearlyContributionData = {
  weeks: ContributionWeek[];
  totalSeconds: number;
  activeDays: number;
  year: number;
  rangeStartLabel: string;
  rangeEndLabel: string;
  totalDaysInRange: number;
  bestDaySeconds: number;
  bestDayLabel: string;
};

const LEVEL_COLORS: Record<ContributionLevel, string> = {
  0: "rgba(255,255,255,0.06)",
  1: "rgba(0,255,204,0.22)",
  2: "rgba(0,255,204,0.42)",
  3: "rgba(0,255,204,0.62)",
  4: "rgba(0,255,204,0.92)",
};

export function contributionLevelFromSeconds(totalSeconds: number): ContributionLevel {
  if (totalSeconds < 60) return 0;
  if (totalSeconds < 3600) return 1;
  if (totalSeconds < 3 * 3600) return 2;
  if (totalSeconds < 6 * 3600) return 3;
  return 4;
}

export function contributionCellColor(level: ContributionLevel): string {
  return LEVEL_COLORS[level];
}

function formatCellTooltip(date: Date, totalSeconds: number): string {
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (totalSeconds < 60) return `No time logged on ${dateLabel}`;
  return `${formatDurationShort(totalSeconds)} logged on ${dateLabel}`;
}

/**
 * GitHub-style grid: exactly 53 week columns, oldest left, current week right.
 * Every past day is a visible cell; only future days in the current week are blank.
 */
export function buildYearlyContributionData(
  secondsByDateKey: Map<string, number>,
  endDate = new Date()
): YearlyContributionData {
  const today = new Date(endDate);
  today.setHours(0, 0, 0, 0);

  const currentWeekSunday = new Date(today);
  currentWeekSunday.setDate(today.getDate() - today.getDay());

  const gridStart = new Date(currentWeekSunday);
  gridStart.setDate(currentWeekSunday.getDate() - (CONTRIBUTION_WEEKS - 1) * 7);

  const msDay = 86_400_000;
  let totalSeconds = 0;
  let activeDays = 0;
  let bestDaySeconds = 0;
  let bestDayDate: Date | null = null;
  const weeks: ContributionWeek[] = [];

  for (let w = 0; w < CONTRIBUTION_WEEKS; w++) {
    const days: ContributionCell[] = [];
    let monthLabel: string | null = null;

    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(gridStart.getTime() + (w * 7 + d) * msDay);
      const isFuture = cellDate > today;
      const dateKey = isFuture ? null : localDateKey(cellDate);
      const secs = isFuture ? 0 : (secondsByDateKey.get(localDateKey(cellDate)) ?? 0);
      const level = isFuture ? 0 : contributionLevelFromSeconds(secs);

      if (!isFuture && secs >= 60) {
        totalSeconds += secs;
        activeDays += 1;
        if (secs > bestDaySeconds) {
          bestDaySeconds = secs;
          bestDayDate = cellDate;
        }
      }

      if (!isFuture && cellDate.getDate() === 1) {
        monthLabel = cellDate.toLocaleDateString(undefined, { month: "short" });
      }

      days.push({
        dateKey,
        totalSeconds: isFuture ? 0 : secs,
        level,
        isFuture,
        tooltip: isFuture ? "" : formatCellTooltip(cellDate, secs),
      });
    }

    weeks.push({ monthLabel, days });
  }

  const rangeStartLabel = gridStart.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
  const rangeEndLabel = today.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const totalDaysInRange = weeks.reduce(
    (n, w) => n + w.days.filter((d) => d.dateKey).length,
    0
  );
  const bestDayLabel = bestDayDate
    ? bestDayDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "—";

  return {
    weeks,
    totalSeconds,
    activeDays,
    year: today.getFullYear(),
    rangeStartLabel,
    rangeEndLabel,
    totalDaysInRange,
    bestDaySeconds,
    bestDayLabel,
  };
}
