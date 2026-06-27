"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Flame, TrendingUp, Trophy } from "lucide-react";
import type { SerializedWorkLogDay } from "@/lib/admin-work-log";
import {
  buildYearlyContributionData,
  contributionCellColor,
  type ContributionCell,
  type YearlyContributionData,
} from "@/lib/yearly-contribution-chart";
import { formatDurationShort, totalLiveSeconds } from "@/lib/work-log-live-seconds";

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""] as const;
const CELL_H = "h-[11px] sm:h-3";

function ContributionCellButton({
  cell,
  onHover,
}: {
  cell: ContributionCell;
  onHover: (cell: ContributionCell | null, rect?: DOMRect) => void;
}) {
  if (cell.isFuture || !cell.dateKey) {
    return (
      <span
        className={`${CELL_H} w-full rounded-[2px] bg-white/[0.03]`}
        aria-hidden
      />
    );
  }

  return (
    <button
      type="button"
      title={cell.tooltip}
      className={`${CELL_H} w-full rounded-[2px] border border-transparent transition-transform hover:scale-110 hover:border-white/30 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]`}
      style={{ backgroundColor: contributionCellColor(cell.level) }}
      aria-label={cell.tooltip}
      onMouseEnter={(e) => onHover(cell, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => onHover(null)}
      onFocus={(e) => onHover(cell, e.currentTarget.getBoundingClientRect())}
      onBlur={() => onHover(null)}
    />
  );
}

function StatsStrip({ data }: { data: YearlyContributionData }) {
  const consistencyPct =
    data.totalDaysInRange > 0
      ? Math.round((data.activeDays / data.totalDaysInRange) * 100)
      : 0;
  const avgActiveDay =
    data.activeDays > 0 ? Math.round(data.totalSeconds / data.activeDays) : 0;

  const items = [
    {
      label: "Period",
      value: `${data.rangeStartLabel} – ${data.rangeEndLabel}`,
      accent: false,
    },
    {
      label: "Total logged",
      value: formatDurationShort(data.totalSeconds),
      accent: true,
    },
    {
      label: "Active days",
      value: String(data.activeDays),
      icon: Flame,
      iconClass: "text-orange-400",
    },
    {
      label: "Consistency",
      value: `${consistencyPct}%`,
      icon: TrendingUp,
      iconClass: "text-[var(--accent-cyan)]",
    },
    ...(data.bestDaySeconds > 0
      ? [
          {
            label: "Best day",
            value: `${data.bestDayLabel} · ${formatDurationShort(data.bestDaySeconds)}`,
            icon: Trophy,
            iconClass: "text-amber-300",
          },
        ]
      : []),
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-[var(--card-border)] bg-white/[0.03] px-3 py-2.5"
        >
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            {"icon" in item && item.icon ? (
              <item.icon className={`h-3 w-3 ${item.iconClass}`} />
            ) : null}
            {item.label}
          </p>
          <p
            className={`mt-0.5 truncate text-sm font-bold ${
              item.accent ? "text-gradient-cyan tabular-nums" : "text-white"
            }`}
            title={item.value}
          >
            {item.value}
          </p>
        </div>
      ))}
      {data.activeDays > 0 ? (
        <div className="col-span-2 rounded-xl border border-[var(--card-border)] bg-white/[0.03] px-3 py-2.5 sm:col-span-1 lg:col-span-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Daily average
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-white">
            {formatDurationShort(avgActiveDay)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function YearlyContributionChart({
  days,
  nowMs,
  className = "",
}: {
  days: SerializedWorkLogDay[];
  nowMs: number;
  className?: string;
}) {
  const [hover, setHover] = useState<{
    cell: ContributionCell;
    x: number;
    y: number;
  } | null>(null);

  const data: YearlyContributionData = useMemo(() => {
    const byKey = new Map(days.map((d) => [d.dateKey, d]));
    const secondsByDateKey = new Map<string, number>();
    for (const [key, day] of byKey) {
      secondsByDateKey.set(key, totalLiveSeconds(day, nowMs));
    }
    return buildYearlyContributionData(secondsByDateKey, new Date(nowMs));
  }, [days, nowMs]);

  const handleHover = (cell: ContributionCell | null, rect?: DOMRect) => {
    if (!cell || !rect) {
      setHover(null);
      return;
    }
    setHover({ cell, x: rect.left + rect.width / 2, y: rect.top });
  };

  return (
    <section className={`glass-card rounded-2xl p-4 sm:p-6 ${className}`}>
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-white sm:text-lg">
          <CalendarRange className="h-5 w-5 text-[var(--accent-cyan)]" />
          Year in review
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Each square is one day — brighter squares mean more time logged.
        </p>
      </div>

      <StatsStrip data={data} />

      {/* Month labels + grid */}
      <div className="w-full">
        <div className="mb-1 flex w-full gap-[2px] pl-7 sm:pl-8 sm:gap-[3px]">
          {data.weeks.map((week, wi) => (
            <div
              key={`m-${wi}`}
              className="min-w-0 flex-1 truncate text-center text-[8px] font-medium text-[var(--text-secondary)] sm:text-[9px]"
            >
              {week.monthLabel ?? ""}
            </div>
          ))}
        </div>

        <div className="flex gap-1.5 sm:gap-2">
          <div className={`flex w-6 shrink-0 flex-col gap-[2px] sm:w-7 sm:gap-[3px]`}>
            {WEEKDAY_LABELS.map((label, i) => (
              <span
                key={i}
                className={`flex ${CELL_H} items-center text-[8px] text-[var(--text-secondary)] sm:text-[9px]`}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 gap-[2px] sm:gap-[3px]">
            {data.weeks.map((week, wi) => (
              <div
                key={`w-${wi}`}
                className="flex min-w-0 flex-1 flex-col gap-[2px] sm:gap-[3px]"
              >
                {week.days.map((cell, di) => (
                  <ContributionCellButton
                    key={`${wi}-${di}`}
                    cell={cell}
                    onHover={handleHover}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar — fills space below grid */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] pt-4">
        <p className="text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-white">{data.activeDays}</span> active days in the
          last year
          {data.totalSeconds > 0 ? (
            <>
              {" "}
              ·{" "}
              <span className="font-semibold text-[var(--accent-cyan)]">
                {formatDurationShort(data.totalSeconds)}
              </span>{" "}
              total
            </>
          ) : (
            " — log time today to light up your first square"
          )}
        </p>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] sm:text-xs">
          <span>Less</span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span
              key={level}
              className="inline-block h-2.5 w-2.5 rounded-[2px] sm:h-3 sm:w-3"
              style={{ backgroundColor: contributionCellColor(level) }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {hover ? (
        <div
          className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--card-border)] bg-[#0b1414] px-3 py-2 text-xs font-medium text-white shadow-xl"
          style={{ left: hover.x, top: hover.y - 8 }}
          role="tooltip"
        >
          {hover.cell.tooltip}
        </div>
      ) : null}
    </section>
  );
}
