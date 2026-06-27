"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flag,
  Flame,
  Loader2,
  Minus,
  Moon,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppSplash } from "@/components/app-splash";
import type { SerializedWorkLogDay } from "@/lib/admin-work-log";
import {
  achievementTargetsForMonth,
  effectiveMonthlyGoalMinutes,
  isMilestoneComplete,
  MILESTONE_CATEGORY_LABELS,
  MONTHLY_MILESTONE_CATEGORIES,
  normalizeMilestoneCategory,
  PRIMARY_PERSON_ID,
  type MonthlyMilestoneCategory,
  type SerializedMonthlyAchievementTarget,
} from "@/lib/user-work-log-settings";
import type { WorkLogSettings } from "@/components/work-log/work-log-extras";
import { WORK_LOG_AREA_COLORS, workLogAreaColorsForKind } from "@/lib/work-log-area-colors";
import {
  fetchWorkLogDays,
  fetchWorkLogSettings,
  patchWorkLogSettings,
} from "@/lib/offline/work-log-api";
import {
  useWorkLogSessionGate,
  workLogAuthorizedInit,
} from "@/hooks/useWorkLogSessionGate";
import { useOfflineSync } from "@/hooks/useOfflineSync";

type WorkLogDay = SerializedWorkLogDay;

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function liveSeconds(day: WorkLogDay | undefined, nowMs: number): number {
  if (!day) return 0;
  let secs = day.totalMinutes * 60;
  if (day.timerStartedAt) {
    secs += Math.max(0, (nowMs - new Date(day.timerStartedAt).getTime()) / 1000);
  }
  return Math.floor(secs);
}

function deenLiveSeconds(day: WorkLogDay | undefined, nowMs: number): number {
  if (!day) return 0;
  let secs = (day.deenMinutes ?? 0) * 60;
  if (day.deenTimerStartedAt) {
    secs += Math.max(0, (nowMs - new Date(day.deenTimerStartedAt).getTime()) / 1000);
  }
  return Math.floor(secs);
}

function fitnessLiveSeconds(day: WorkLogDay | undefined, nowMs: number): number {
  if (!day) return 0;
  let secs = (day.fitnessMinutes ?? 0) * 60;
  if (day.fitnessTimerStartedAt) {
    secs += Math.max(0, (nowMs - new Date(day.fitnessTimerStartedAt).getTime()) / 1000);
  }
  return Math.floor(secs);
}

function totalLiveSeconds(day: WorkLogDay | undefined, nowMs: number): number {
  return liveSeconds(day, nowMs) + deenLiveSeconds(day, nowMs) + fitnessLiveSeconds(day, nowMs);
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function monthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function ProgressRing({
  pct,
  size = 200,
  stroke = 14,
  met,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  met: boolean;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, pct) / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="monthlyRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={met ? "#34d399" : "var(--accent-cyan)"} />
            <stop offset="100%" stopColor={met ? "#6ee7b7" : "var(--accent-cyan-2)"} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#monthlyRingGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{
            filter: met
              ? "drop-shadow(0 0 12px rgba(52,211,153,0.5))"
              : "drop-shadow(0 0 12px var(--accent-cyan-glow))",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold tabular-nums text-white sm:text-5xl">{pct}%</span>
        <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          complete
        </span>
      </div>
    </div>
  );
}

function HeatCell({
  day,
  totalSecs,
  goalDaySecs,
  isToday,
  isFuture,
}: {
  day: number;
  totalSecs: number;
  goalDaySecs: number;
  isToday: boolean;
  isFuture: boolean;
}) {
  const intensity =
    goalDaySecs > 0 ? Math.min(1, totalSecs / goalDaySecs) : totalSecs > 0 ? 0.5 : 0;
  const hours = totalSecs / 3600;

  let bg = "rgba(255,255,255,0.03)";
  if (!isFuture && totalSecs > 0) {
    if (intensity >= 1) bg = "rgba(52,211,153,0.45)";
    else if (intensity >= 0.6) bg = "rgba(0,255,204,0.35)";
    else if (intensity >= 0.25) bg = "rgba(34,211,238,0.22)";
    else bg = "rgba(167,139,250,0.18)";
  }

  return (
    <div
      title={isFuture ? `Day ${day}` : `${formatDuration(totalSecs)} logged`}
      className={`group relative flex aspect-square flex-col items-center justify-center rounded-xl border transition-all duration-300 ${
        isToday
          ? "border-[var(--accent-cyan)]/60 ring-2 ring-[var(--accent-cyan)]/25"
          : "border-[var(--card-border)]/60"
      } ${isFuture ? "opacity-35" : "hover:scale-[1.04] hover:border-[var(--accent-cyan)]/40"}`}
      style={{ background: bg }}
    >
      <span
        className={`text-xs font-bold tabular-nums ${
          isToday ? "text-[var(--accent-cyan)]" : "text-white/70"
        }`}
      >
        {day}
      </span>
      {!isFuture && hours > 0 ? (
        <span className="mt-0.5 text-[9px] font-semibold tabular-nums text-white/50 group-hover:text-white/80">
          {hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(totalSecs / 60)}m`}
        </span>
      ) : null}
    </div>
  );
}

function CategoryBadge({ category }: { category: MonthlyMilestoneCategory }) {
  const colors = workLogAreaColorsForKind(category);
  return (
    <span
      className="inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{
        color: colors.color,
        borderColor: colors.border,
        background: colors.softBg,
      }}
    >
      {MILESTONE_CATEGORY_LABELS[category]}
    </span>
  );
}

function AchievementTargetCard({
  target,
  busy,
  onUpdateCount,
  onDelete,
}: {
  target: SerializedMonthlyAchievementTarget;
  busy: boolean;
  onUpdateCount: (count: number) => void;
  onDelete: () => void;
}) {
  const hasNumericTarget = target.targetCount > 0;
  const met = isMilestoneComplete(target);
  const colors = workLogAreaColorsForKind(target.category);
  const tint = colors.color;
  const pct = hasNumericTarget
    ? Math.min(100, Math.round((target.currentCount / target.targetCount) * 100))
    : met
      ? 100
      : 0;
  const unitSuffix = target.unit ? ` ${target.unit}` : "";
  const [countDraft, setCountDraft] = useState(String(target.currentCount));

  useEffect(() => {
    setCountDraft(String(target.currentCount));
  }, [target.currentCount]);

  const bump = (delta: number) => {
    onUpdateCount(Math.max(0, target.currentCount + delta));
  };

  const commitDraft = () => {
    const v = Number.parseInt(countDraft || "0", 10);
    if (Number.isFinite(v) && v !== target.currentCount) {
      onUpdateCount(Math.max(0, v));
    } else {
      setCountDraft(String(target.currentCount));
    }
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group relative overflow-hidden rounded-2xl border p-4 sm:p-5 ${
        met
          ? "border-emerald-400/35 bg-emerald-400/[0.06]"
          : "border-[var(--card-border)] bg-white/[0.02]"
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${tint}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
              style={{
                color: met ? "#34d399" : tint,
                borderColor: `${met ? "#34d399" : tint}40`,
                background: `${met ? "#34d399" : tint}14`,
              }}
            >
              {met ? <CheckCircle2 className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
            </span>
            <CategoryBadge category={target.category} />
            <h3 className="text-sm font-bold leading-snug text-white sm:text-base">{target.title}</h3>
          </div>

          {hasNumericTarget ? (
            <>
              <p className="mb-3 text-2xl font-extrabold tabular-nums text-white">
                {target.currentCount.toLocaleString()}
                <span className="text-base font-semibold text-[var(--text-secondary)]">
                  {" "}
                  / {target.targetCount.toLocaleString()}
                  {unitSuffix}
                </span>
              </p>
              <div className="mb-1 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: met
                      ? "linear-gradient(90deg, #34d399, #6ee7b7)"
                      : `linear-gradient(90deg, ${tint}, ${tint}99)`,
                    boxShadow: met ? "0 0 12px rgba(52,211,153,0.4)" : undefined,
                  }}
                />
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                {met
                  ? "Target achieved — great work!"
                  : `${(target.targetCount - target.currentCount).toLocaleString()} to go · ${pct}%`}
              </p>
            </>
          ) : (
            <p className="mb-1 text-sm text-[var(--text-secondary)]">
              {met ? "Completed this month" : "No numeric target — mark done when finished"}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="shrink-0 rounded-lg p-2 text-red-400/50 opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-30"
          aria-label="Delete target"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {hasNumericTarget ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || target.currentCount <= 0}
            onClick={() => bump(-1)}
            className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--card-border)] bg-white/5 text-white transition-colors hover:border-[var(--accent-cyan)]/40 disabled:opacity-40"
            aria-label="Decrease by 1"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number"
            min={0}
            max={target.targetCount * 10}
            value={countDraft}
            disabled={busy}
            onChange={(e) => setCountDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="h-9 w-20 rounded-lg border border-[var(--card-border)] bg-white/5 px-2 text-center text-sm font-bold tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => bump(1)}
            className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--card-border)] bg-white/5 text-white transition-colors hover:border-[var(--accent-cyan)]/40 disabled:opacity-40"
            aria-label="Increase by 1"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => bump(5)}
            className="rounded-lg border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 px-3 py-1.5 text-xs font-bold text-[var(--accent-cyan)] transition-colors hover:bg-[var(--accent-cyan)]/20 disabled:opacity-40"
          >
            +5
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => bump(10)}
            className="rounded-lg border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 px-3 py-1.5 text-xs font-bold text-[var(--accent-cyan)] transition-colors hover:bg-[var(--accent-cyan)]/20 disabled:opacity-40"
          >
            +10
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => onUpdateCount(met ? 0 : 1)}
          className={`mt-4 w-full rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 sm:w-auto ${
            met
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              : "border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20"
          }`}
        >
          {met ? "Mark as not done" : "Mark complete"}
        </button>
      )}
    </motion.article>
  );
}

export function MonthlyTargetsView() {
  const router = useRouter();
  const { ready, isAuthenticated, user } = useWorkLogSessionGate();
  const authorizedInit = useCallback(
    (init?: RequestInit) => workLogAuthorizedInit(init),
    []
  );

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [days, setDays] = useState<WorkLogDay[]>([]);
  const [settings, setSettings] = useState<WorkLogSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activePersonId] = useState(PRIMARY_PERSON_ID);
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  const [goalHours, setGoalHours] = useState("176");
  const [goalMins, setGoalMins] = useState("0");
  const [editingGoal, setEditingGoal] = useState(false);
  const [newTargetTitle, setNewTargetTitle] = useState("");
  const [newTargetCount, setNewTargetCount] = useState("");
  const [newTargetUnit, setNewTargetUnit] = useState("");
  const [newTargetCategory, setNewTargetCategory] = useState<MonthlyMilestoneCategory>("deen");
  const [showAddTarget, setShowAddTarget] = useState(false);

  const todayKey = localDateKey(new Date(nowMs));
  const { year, monthIndex } = viewMonth;
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const dim = daysInMonth(year, monthIndex);
  const isCurrentMonth =
    year === new Date(nowMs).getFullYear() && monthIndex === new Date(nowMs).getMonth();

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/");
  }, [ready, isAuthenticated, router]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      const [daysResult, settingsResult] = await Promise.all([
        fetchWorkLogDays("/api/work-log", activePersonId, user.id, authorizedInit),
        fetchWorkLogSettings("/api/work-log/settings", user.id, authorizedInit),
      ]);
      if (!daysResult.ok) {
        setDays([]);
        setErrorMsg(daysResult.error ?? "Failed to load work log.");
      } else {
        setDays((daysResult.data?.days ?? []) as WorkLogDay[]);
      }
      if (settingsResult.ok && settingsResult.data?.settings) {
        const raw = settingsResult.data.settings as WorkLogSettings;
        const s: WorkLogSettings = {
          ...raw,
          monthlyAchievementTargets: (raw.monthlyAchievementTargets ?? []).map((t) => ({
            ...t,
            category: normalizeMilestoneCategory(t.category),
            targetCount: Math.max(0, t.targetCount ?? 0),
          })),
        };
        setSettings(s);
        const effective = effectiveMonthlyGoalMinutes(s, year, monthIndex);
        setGoalHours(String(Math.floor(effective / 60)));
        setGoalMins(String(effective % 60));
      }
    } catch {
      setErrorMsg("Failed to load monthly data.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, activePersonId, authorizedInit, year, monthIndex]);

  useEffect(() => {
    if (user?.id) void load();
  }, [load, user?.id]);

  useOfflineSync({ authorizedInit, onSynced: () => void load() });

  useEffect(() => {
    if (!settings) return;
    const effective = effectiveMonthlyGoalMinutes(settings, year, monthIndex);
    setGoalHours(String(Math.floor(effective / 60)));
    setGoalMins(String(effective % 60));
  }, [settings, year, monthIndex]);

  const monthStats = useMemo(() => {
    const byKey = new Map(days.map((d) => [d.dateKey, d]));
    let totalSecs = 0;
    let workSecs = 0;
    let deenSecs = 0;
    let fitnessSecs = 0;
    let activeDays = 0;

    const dailyData: { day: number; total: number; work: number; deen: number; fitness: number }[] =
      [];

    for (let d = 1; d <= dim; d++) {
      const key = `${monthPrefix}-${String(d).padStart(2, "0")}`;
      const day = byKey.get(key);
      const w = liveSeconds(day, nowMs);
      const de = deenLiveSeconds(day, nowMs);
      const f = fitnessLiveSeconds(day, nowMs);
      const t = w + de + f;
      totalSecs += t;
      workSecs += w;
      deenSecs += de;
      fitnessSecs += f;
      if (t >= 60) activeDays += 1;
      dailyData.push({
        day: d,
        total: Math.round((t / 3600) * 10) / 10,
        work: Math.round((w / 3600) * 10) / 10,
        deen: Math.round((de / 3600) * 10) / 10,
        fitness: Math.round((f / 3600) * 10) / 10,
      });
    }

    const goalMinutes = settings
      ? effectiveMonthlyGoalMinutes(settings, year, monthIndex)
      : 0;
    const goalSecs = goalMinutes * 60;
    const pct = goalSecs > 0 ? Math.min(100, Math.round((totalSecs / goalSecs) * 100)) : 0;
    const met = goalSecs > 0 && totalSecs >= goalSecs;
    const remainingSecs = Math.max(0, goalSecs - totalSecs);

    const today = new Date(nowMs);
    const dayOfMonth = isCurrentMonth ? today.getDate() : dim;
    const daysLeft = isCurrentMonth ? Math.max(0, dim - dayOfMonth) : 0;
    const expectedSecs =
      goalSecs > 0 && isCurrentMonth ? (goalSecs * dayOfMonth) / dim : goalSecs;
    const paceRatio = expectedSecs > 0 ? totalSecs / expectedSecs : 1;
    const paceLabel =
      !isCurrentMonth || goalSecs <= 0
        ? met
          ? "Target reached"
          : "Month complete"
        : paceRatio >= 1.05
          ? "Ahead of pace"
          : paceRatio >= 0.9
            ? "On track"
            : "Pick up the pace";
    const paceTint =
      paceLabel === "Ahead of pace" || paceLabel === "Target reached"
        ? "#34d399"
        : paceLabel === "On track"
          ? "var(--accent-cyan)"
          : "#fb923c";

    const dailyGoalSecs = goalSecs > 0 ? goalSecs / dim : 0;

    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const calendarCells: (
      | { type: "pad" }
      | { type: "day"; day: number; totalSecs: number; isToday: boolean; isFuture: boolean }
    )[] = [];
    for (let i = 0; i < firstWeekday; i++) calendarCells.push({ type: "pad" });
    for (let d = 1; d <= dim; d++) {
      const key = `${monthPrefix}-${String(d).padStart(2, "0")}`;
      const day = byKey.get(key);
      const t = totalLiveSeconds(day, nowMs);
      const isToday = key === todayKey;
      const isFuture = isCurrentMonth && d > today.getDate();
      calendarCells.push({ type: "day", day: d, totalSecs: t, isToday, isFuture });
    }

    return {
      totalSecs,
      workSecs,
      deenSecs,
      fitnessSecs,
      activeDays,
      goalMinutes,
      goalSecs,
      pct,
      met,
      remainingSecs,
      daysLeft,
      paceLabel,
      paceTint,
      dailyGoalSecs,
      dailyData,
      calendarCells,
    };
  }, [days, nowMs, dim, monthPrefix, settings, year, monthIndex, isCurrentMonth, todayKey]);

  const monthAchievementTargets = useMemo(() => {
    if (!settings) return [];
    return achievementTargetsForMonth(settings, monthPrefix);
  }, [settings, monthPrefix]);

  const achievementSummary = useMemo(() => {
    const total = monthAchievementTargets.length;
    const completed = monthAchievementTargets.filter(isMilestoneComplete).length;
    return { total, completed };
  }, [monthAchievementTargets]);

  const patchSettings = async (body: Record<string, unknown>) => {
    if (!user?.id) return false;
    setBusy(true);
    try {
      const result = await patchWorkLogSettings(
        "/api/work-log/settings",
        user.id,
        body,
        authorizedInit
      );
      if (!result.ok) {
        setErrorMsg(result.error ?? "Could not save.");
        return false;
      }
      if (result.data?.settings) {
        setSettings(result.data.settings as WorkLogSettings);
      }
      return true;
    } catch {
      setErrorMsg("Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const patchGoal = async () => {
    const h = Number.parseInt(goalHours || "0", 10);
    const m = Number.parseInt(goalMins || "0", 10);
    const ok = await patchSettings({ action: "setMonthlyGoal", minutes: h * 60 + m });
    if (ok) setEditingGoal(false);
  };

  const addAchievementTarget = async () => {
    const title = newTargetTitle.trim();
    if (!title) return;
    const parsedTarget = newTargetCount.trim()
      ? Number.parseInt(newTargetCount, 10)
      : 0;
    const targetCount =
      Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : 0;
    const ok = await patchSettings({
      action: "addMonthlyAchievementTarget",
      monthKey: monthPrefix,
      title,
      targetCount,
      unit: newTargetUnit.trim() || undefined,
      category: newTargetCategory,
    });
    if (ok) {
      setNewTargetTitle("");
      setNewTargetCount("");
      setNewTargetUnit("");
      setNewTargetCategory("deen");
      setShowAddTarget(false);
    }
  };

  const updateAchievementCount = async (targetId: string, currentCount: number) => {
    await patchSettings({
      action: "updateMonthlyAchievementTarget",
      targetId,
      currentCount,
    });
  };

  const deleteAchievementTarget = async (targetId: string) => {
    await patchSettings({ action: "deleteMonthlyAchievementTarget", targetId });
  };

  const shiftMonth = (delta: number) => {
    setViewMonth((prev) => {
      const d = new Date(prev.year, prev.monthIndex + delta, 1);
      return { year: d.getFullYear(), monthIndex: d.getMonth() };
    });
  };

  if (!ready || !isAuthenticated) return <AppSplash />;

  const inputClass =
    "w-full px-3 py-2.5 bg-white/5 border border-[var(--card-border)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35";

  return (
    <main
      className="relative min-h-[100dvh] overflow-x-hidden pb-10 safe-top safe-bottom"
      style={{ background: "var(--bg-gradient)" }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-slow absolute -top-32 left-1/4 h-[22rem] w-[22rem] rounded-full bg-violet-500/12 blur-[120px]" />
        <div className="animate-float-slow absolute top-1/4 -right-20 h-96 w-96 rounded-full bg-[var(--accent-cyan)]/10 blur-[130px] [animation-delay:-4s]" />
        <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 pt-2 sm:mb-8 sm:pt-4"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent-cyan)]">
                <Sparkles className="h-3.5 w-3.5" />
                Monthly targets
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gradient-cyan sm:text-4xl">
                Your month at a glance
              </h1>
              <p className="mt-2 max-w-lg text-sm text-[var(--text-secondary)] sm:text-base">
                Track your time goals and monthly milestones — like connecting with 100 doctors
                for ZindagiCare.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]/70 p-1.5 backdrop-blur sm:self-auto">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="touch-target rounded-xl p-2 text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="min-w-[9rem] text-center text-sm font-bold text-white">
                {monthLabel(year, monthIndex)}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={isCurrentMonth}
                className="touch-target rounded-xl p-2 text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </motion.header>

        {errorMsg ? (
          <p className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            {errorMsg}
          </p>
        ) : null}

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-cyan)]" />
          </div>
        ) : (
          <>
            {/* Hero progress */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass-card relative mb-6 overflow-hidden rounded-3xl p-6 sm:p-8"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--accent-cyan)]/10 blur-3xl"
              />
              <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col items-center lg:items-start">
                  <ProgressRing pct={monthStats.pct} met={monthStats.met} />
                  <p className="mt-4 text-center text-sm text-[var(--text-secondary)] lg:text-left">
                    {monthStats.met
                      ? "🎉 Monthly target achieved — outstanding work!"
                      : monthStats.goalSecs > 0
                        ? `${formatDuration(monthStats.remainingSecs)} left to reach your goal`
                        : "Set a monthly goal below to start tracking"}
                  </p>
                </div>

                <div className="w-full max-w-md space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[var(--card-border)] bg-white/[0.03] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Logged
                      </p>
                      <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">
                        {formatDuration(monthStats.totalSecs)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--card-border)] bg-white/[0.03] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Target
                      </p>
                      <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">
                        {monthStats.goalMinutes > 0
                          ? formatEstimate(monthStats.goalMinutes)
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-3 rounded-2xl border p-4"
                    style={{
                      borderColor: `${monthStats.paceTint}40`,
                      background: `${monthStats.paceTint}0d`,
                    }}
                  >
                    <span
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
                      style={{
                        color: monthStats.paceTint,
                        borderColor: `${monthStats.paceTint}40`,
                        background: `${monthStats.paceTint}14`,
                      }}
                    >
                      {monthStats.paceLabel === "Ahead of pace" ? (
                        <Zap className="h-5 w-5" />
                      ) : monthStats.paceLabel === "On track" ? (
                        <TrendingUp className="h-5 w-5" />
                      ) : (
                        <Flame className="h-5 w-5" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{monthStats.paceLabel}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {monthStats.activeDays} active day
                        {monthStats.activeDays === 1 ? "" : "s"}
                        {isCurrentMonth && monthStats.daysLeft > 0
                          ? ` · ${monthStats.daysLeft} day${monthStats.daysLeft === 1 ? "" : "s"} left`
                          : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Achievement milestones */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="glass-card mb-6 rounded-3xl p-5 sm:p-6"
            >
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-bold text-white sm:text-lg">
                    <Flag className="h-5 w-5 text-violet-400" />
                    Monthly milestones
                  </h2>
                  <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
                    Goals to hit this month — outreach, sales, content, or anything measurable.
                  </p>
                </div>
                {achievementSummary.total > 0 ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-violet-400/35 bg-violet-400/10 px-3 py-1 text-xs font-bold text-violet-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {achievementSummary.completed} of {achievementSummary.total} done
                  </span>
                ) : null}
              </div>

              {monthAchievementTargets.length > 0 ? (
                <ul className="mb-5 space-y-3">
                  {monthAchievementTargets.map((target) => (
                    <li key={target.id}>
                      <AchievementTargetCard
                        target={target}
                        busy={busy}
                        onUpdateCount={(count) => void updateAchievementCount(target.id, count)}
                        onDelete={() => void deleteAchievementTarget(target.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mb-5 rounded-2xl border border-dashed border-[var(--card-border)] bg-white/[0.02] px-4 py-8 text-center">
                  <Flag className="mx-auto mb-3 h-8 w-8 text-violet-400/60" />
                  <p className="text-sm font-semibold text-white">No milestones yet</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Add a target like &ldquo;Connect with 100 doctors for ZindagiCare&rdquo;
                  </p>
                </div>
              )}

              {showAddTarget ? (
                <div className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-4 sm:p-5">
                  <p className="mb-3 text-sm font-bold text-white">New milestone</p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newTargetTitle}
                      onChange={(e) => setNewTargetTitle(e.target.value)}
                      placeholder="e.g. Surat Al Baqara complete"
                      maxLength={200}
                      className={inputClass}
                    />
                    <div>
                      <label className="mb-2 block text-xs text-[var(--text-secondary)]">
                        Category
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {MONTHLY_MILESTONE_CATEGORIES.map((cat) => {
                          const colors = WORK_LOG_AREA_COLORS[cat];
                          const active = newTargetCategory === cat;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setNewTargetCategory(cat)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                                active ? "text-[#070d0d]" : "text-[var(--text-secondary)] hover:text-white"
                              }`}
                              style={
                                active
                                  ? {
                                      background: colors.color,
                                      borderColor: colors.border,
                                    }
                                  : {
                                      borderColor: colors.border,
                                      background: colors.softBg,
                                      color: colors.color,
                                    }
                              }
                            >
                              {MILESTONE_CATEGORY_LABELS[cat]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <div className="min-w-[7rem] flex-1">
                        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                          Target number (optional)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newTargetCount}
                          onChange={(e) => setNewTargetCount(e.target.value)}
                          placeholder="100"
                          className={inputClass}
                        />
                      </div>
                      <div className="min-w-[7rem] flex-1">
                        <label className="mb-1 block text-xs text-[var(--text-secondary)]">
                          Unit (optional)
                        </label>
                        <input
                          type="text"
                          value={newTargetUnit}
                          onChange={(e) => setNewTargetUnit(e.target.value)}
                          placeholder="doctors"
                          maxLength={40}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Leave target number empty for one-off goals — use &ldquo;Mark complete&rdquo; when
                      finished.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || !newTargetTitle.trim()}
                        onClick={() => void addAchievementTarget()}
                        className="rounded-xl bg-gradient-to-r from-violet-500 to-[var(--accent-cyan)] px-5 py-2.5 text-sm font-bold text-[#070d0d] disabled:opacity-50"
                      >
                        {busy ? "Adding…" : "Add milestone"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddTarget(false)}
                        className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddTarget(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-400/35 bg-violet-400/[0.04] py-4 text-sm font-bold text-violet-300 transition-colors hover:border-violet-400/55 hover:bg-violet-400/[0.08]"
                >
                  <Plus className="h-4 w-4" />
                  Add a milestone for {monthLabel(year, monthIndex)}
                </button>
              )}
            </motion.section>

            {/* Breakdown */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6 grid gap-4 sm:grid-cols-3"
            >
              {[
                {
                  label: "Work",
                  secs: monthStats.workSecs,
                  Icon: Briefcase,
                  tint: WORK_LOG_AREA_COLORS.work.color,
                },
                {
                  label: "Deen",
                  secs: monthStats.deenSecs,
                  Icon: Moon,
                  tint: WORK_LOG_AREA_COLORS.deen.color,
                },
                {
                  label: "Fitness",
                  secs: monthStats.fitnessSecs,
                  Icon: Dumbbell,
                  tint: WORK_LOG_AREA_COLORS.fitness.color,
                },
              ].map(({ label, secs, Icon, tint }, i) => {
                const share =
                  monthStats.totalSecs > 0
                    ? Math.round((secs / monthStats.totalSecs) * 100)
                    : 0;
                return (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + i * 0.05 }}
                    className="glass-card rounded-2xl p-5"
                  >
                    <div className="mb-3 flex items-center gap-2.5">
                      <span
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
                        style={{
                          color: tint,
                          borderColor: `${tint}40`,
                          background: `${tint}14`,
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-bold text-white">{label}</span>
                    </div>
                    <p className="text-2xl font-extrabold tabular-nums text-white">
                      {formatDuration(secs)}
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${share}%`,
                          background: `linear-gradient(90deg, ${tint}, ${tint}aa)`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">{share}% of month</p>
                  </motion.div>
                );
              })}
            </motion.section>

            {/* Daily chart + calendar */}
            <div className="mb-6 grid gap-6 lg:grid-cols-5">
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card rounded-2xl p-5 lg:col-span-2"
              >
                <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-white">
                  <CalendarDays className="h-4 w-4 text-[var(--accent-cyan)]" />
                  Daily activity
                </h2>
                <p className="mb-4 text-xs text-[var(--text-secondary)]">
                  Hours logged each day this month
                </p>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthStats.dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="day"
                        tick={{ fill: "#888", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: "#888", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={28}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0b1414",
                          border: "1px solid var(--card-border)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        labelFormatter={(d) => `Day ${d}`}
                        formatter={(v: number) => [`${v}h`, "Total"]}
                      />
                      <Bar
                        dataKey="total"
                        fill="url(#barGrad)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={18}
                      />
                      <defs>
                        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent-cyan)" />
                          <stop offset="100%" stopColor="var(--accent-cyan-2)" stopOpacity={0.6} />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="glass-card rounded-2xl p-5 lg:col-span-3"
              >
                <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-white">
                  <Target className="h-4 w-4 text-[var(--accent-cyan)]" />
                  Activity heatmap
                </h2>
                <p className="mb-4 text-xs text-[var(--text-secondary)]">
                  Brighter cells mean more time logged — today is highlighted
                </p>
                <div className="mb-2 grid grid-cols-7 gap-1 text-center">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((wd) => (
                    <span
                      key={wd}
                      className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]"
                    >
                      {wd}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {monthStats.calendarCells.map((cell, i) =>
                    cell.type === "pad" ? (
                      <div key={`pad-${i}`} className="aspect-square" />
                    ) : (
                      <HeatCell
                        key={cell.day}
                        day={cell.day}
                        totalSecs={cell.totalSecs}
                        goalDaySecs={monthStats.dailyGoalSecs}
                        isToday={cell.isToday}
                        isFuture={cell.isFuture}
                      />
                    )
                  )}
                </div>
              </motion.section>
            </div>

            {/* Goal editor */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="glass-card rounded-2xl p-5 sm:p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                    <Target className="h-4 w-4 text-[var(--accent-cyan)]" />
                    Monthly time target
                  </h2>
                  <p className="mt-1 max-w-md text-xs text-[var(--text-secondary)]">
                    Work, deen, and fitness combined. Leave at 0 to auto-calculate from your daily
                    goal × days in the month.
                  </p>
                </div>
                {!editingGoal ? (
                  <button
                    type="button"
                    onClick={() => setEditingGoal(true)}
                    className="shrink-0 rounded-xl border border-[var(--accent-cyan)]/40 px-4 py-2.5 text-sm font-semibold text-[var(--accent-cyan)] transition-colors hover:bg-[var(--accent-cyan)]/10"
                  >
                    Edit target
                  </button>
                ) : null}
              </div>

              {editingGoal ? (
                <div className="mt-5 flex flex-wrap items-end gap-3">
                  <div className="w-20">
                    <label className="text-xs text-[var(--text-secondary)]">Hours</label>
                    <input
                      type="number"
                      min={0}
                      max={744}
                      value={goalHours}
                      onChange={(e) => setGoalHours(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="w-20">
                    <label className="text-xs text-[var(--text-secondary)]">Mins</label>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={goalMins}
                      onChange={(e) => setGoalMins(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void patchGoal()}
                    className="rounded-xl bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-cyan-2)] px-5 py-2.5 text-sm font-bold text-[#070d0d] shadow-[0_0_20px_-4px_var(--accent-cyan-glow)] disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save target"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingGoal(false)}
                    className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-3xl font-extrabold tabular-nums text-gradient-cyan">
                  {monthStats.goalMinutes > 0
                    ? formatEstimate(monthStats.goalMinutes)
                    : "Not set"}
                  <span className="ml-2 text-base font-medium text-[var(--text-secondary)]">
                    this month
                  </span>
                </p>
              )}
            </motion.section>
          </>
        )}
      </div>
    </main>
  );
}
