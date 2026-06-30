"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Briefcase,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flag,
  Flame,
  Loader2,
  Moon,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
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
import { MilestoneTargetCard } from "@/components/work-log/milestone-target-card";
import type { SerializedWorkLogDay } from "@/lib/admin-work-log";
import {
  achievementTargetsForYear,
  dayOfYear,
  daysInCalendarMonth,
  daysInCalendarYear,
  effectiveYearlyGoalMinutes,
  hasYearlyGoalOverride,
  isMilestoneComplete,
  MILESTONE_CATEGORY_LABELS,
  MONTHLY_MILESTONE_CATEGORIES,
  normalizeMilestoneCategory,
  PRIMARY_PERSON_ID,
  type MonthlyMilestoneCategory,
} from "@/lib/user-work-log-settings";
import type { WorkLogSettings } from "@/components/work-log/work-log-extras";
import { WORK_LOG_AREA_COLORS } from "@/lib/work-log-area-colors";
import {
  deenLiveSeconds,
  fitnessLiveSeconds,
  liveSeconds,
  totalLiveSeconds,
} from "@/lib/work-log-live-seconds";
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

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
          <linearGradient id="yearlyRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={met ? "#34d399" : "#a78bfa"} />
            <stop offset="100%" stopColor={met ? "#6ee7b7" : "var(--accent-cyan)"} />
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
          stroke="url(#yearlyRingGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{
            filter: met
              ? "drop-shadow(0 0 12px rgba(52,211,153,0.5))"
              : "drop-shadow(0 0 12px rgba(167,139,250,0.4))",
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

function MonthCell({
  monthIndex,
  year,
  totalSecs,
  goalMonthSecs,
  isCurrentMonth,
  isFuture,
  onSelect,
}: {
  monthIndex: number;
  year: number;
  totalSecs: number;
  goalMonthSecs: number;
  isCurrentMonth: boolean;
  isFuture: boolean;
  onSelect?: () => void;
}) {
  const intensity =
    goalMonthSecs > 0 ? Math.min(1, totalSecs / goalMonthSecs) : totalSecs > 0 ? 0.5 : 0;
  const hours = totalSecs / 3600;

  let bg = "rgba(255,255,255,0.03)";
  if (!isFuture && totalSecs > 0) {
    if (intensity >= 1) bg = "rgba(52,211,153,0.45)";
    else if (intensity >= 0.6) bg = "rgba(167,139,250,0.35)";
    else if (intensity >= 0.25) bg = "rgba(0,255,204,0.22)";
    else bg = "rgba(34,211,238,0.18)";
  }

  const label = MONTH_SHORT[monthIndex];

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isFuture}
      title={
        isFuture
          ? `${label} ${year}`
          : `${label}: ${formatDuration(totalSecs)} logged`
      }
      className={`group relative flex flex-col items-center justify-center rounded-2xl border p-3 transition-all duration-300 sm:p-4 ${
        isCurrentMonth
          ? "border-[var(--accent-cyan)]/60 ring-2 ring-[var(--accent-cyan)]/25"
          : "border-[var(--card-border)]/60"
      } ${isFuture ? "cursor-default opacity-35" : "hover:scale-[1.03] hover:border-violet-400/40"}`}
      style={{ background: bg }}
    >
      <span
        className={`text-xs font-bold uppercase tracking-wide ${
          isCurrentMonth ? "text-[var(--accent-cyan)]" : "text-white/70"
        }`}
      >
        {label}
      </span>
      {!isFuture && hours > 0 ? (
        <span className="mt-1 text-sm font-extrabold tabular-nums text-white">
          {hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`}
        </span>
      ) : !isFuture ? (
        <span className="mt-1 text-[10px] text-white/40">—</span>
      ) : null}
    </button>
  );
}

export function YearlyTargetsView() {
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
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [goalHours, setGoalHours] = useState("2112");
  const [goalMins, setGoalMins] = useState("0");
  const [editingGoal, setEditingGoal] = useState(false);
  const [newTargetTitle, setNewTargetTitle] = useState("");
  const [newTargetCount, setNewTargetCount] = useState("");
  const [newTargetUnit, setNewTargetUnit] = useState("");
  const [newTargetCategory, setNewTargetCategory] = useState<MonthlyMilestoneCategory>("work");
  const [showAddTarget, setShowAddTarget] = useState(false);

  const currentYear = new Date(nowMs).getFullYear();
  const isCurrentYear = viewYear === currentYear;
  const yearKey = String(viewYear);
  const daysInYear = daysInCalendarYear(viewYear);

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
          yearlyAchievementTargets: (raw.yearlyAchievementTargets ?? []).map((t) => ({
            ...t,
            category: normalizeMilestoneCategory(t.category),
            targetCount: Math.max(0, t.targetCount ?? 0),
          })),
          monthlyGoalOverrides: raw.monthlyGoalOverrides ?? [],
          yearlyGoalOverrides: raw.yearlyGoalOverrides ?? [],
        };
        setSettings(s);
        const effective = effectiveYearlyGoalMinutes(s, viewYear);
        setGoalHours(String(Math.floor(effective / 60)));
        setGoalMins(String(effective % 60));
      }
    } catch {
      setErrorMsg("Failed to load yearly data.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, activePersonId, authorizedInit, viewYear]);

  useEffect(() => {
    if (user?.id) void load();
  }, [load, user?.id]);

  useOfflineSync({ authorizedInit, onSynced: () => void load() });

  useEffect(() => {
    if (!settings) return;
    const effective = effectiveYearlyGoalMinutes(settings, viewYear);
    setGoalHours(String(Math.floor(effective / 60)));
    setGoalMins(String(effective % 60));
  }, [settings, viewYear]);

  const yearStats = useMemo(() => {
    const yearPrefix = `${viewYear}-`;
    const yearDays = days.filter((d) => d.dateKey.startsWith(yearPrefix));
    const byKey = new Map(yearDays.map((d) => [d.dateKey, d]));

    let totalSecs = 0;
    let workSecs = 0;
    let deenSecs = 0;
    let fitnessSecs = 0;
    let activeDays = 0;

    const monthlyData: {
      month: string;
      monthIndex: number;
      total: number;
      work: number;
      deen: number;
      fitness: number;
      totalSecs: number;
    }[] = [];

    const quarterlySecs = [0, 0, 0, 0];

    for (let m = 0; m < 12; m++) {
      const monthPrefix = `${viewYear}-${String(m + 1).padStart(2, "0")}`;
      const dim = daysInCalendarMonth(viewYear, m);
      let monthTotal = 0;
      let monthWork = 0;
      let monthDeen = 0;
      let monthFitness = 0;

      for (let d = 1; d <= dim; d++) {
        const key = `${monthPrefix}-${String(d).padStart(2, "0")}`;
        const day = byKey.get(key);
        const w = liveSeconds(day, nowMs);
        const de = deenLiveSeconds(day, nowMs);
        const f = fitnessLiveSeconds(day, nowMs);
        const t = w + de + f;
        monthTotal += t;
        monthWork += w;
        monthDeen += de;
        monthFitness += f;
        if (t >= 60) activeDays += 1;
      }

      totalSecs += monthTotal;
      workSecs += monthWork;
      deenSecs += monthDeen;
      fitnessSecs += monthFitness;
      quarterlySecs[Math.floor(m / 3)] += monthTotal;

      monthlyData.push({
        month: MONTH_SHORT[m],
        monthIndex: m,
        total: Math.round((monthTotal / 3600) * 10) / 10,
        work: Math.round((monthWork / 3600) * 10) / 10,
        deen: Math.round((monthDeen / 3600) * 10) / 10,
        fitness: Math.round((monthFitness / 3600) * 10) / 10,
        totalSecs: monthTotal,
      });
    }

    const goalMinutes = settings ? effectiveYearlyGoalMinutes(settings, viewYear) : 0;
    const goalSecs = goalMinutes * 60;
    const pct = goalSecs > 0 ? Math.min(100, Math.round((totalSecs / goalSecs) * 100)) : 0;
    const met = goalSecs > 0 && totalSecs >= goalSecs;
    const remainingSecs = Math.max(0, goalSecs - totalSecs);

    const today = new Date(nowMs);
    const currentDayOfYear = isCurrentYear ? dayOfYear(today) : daysInYear;
    const daysLeft = isCurrentYear ? Math.max(0, daysInYear - currentDayOfYear) : 0;
    const expectedSecs =
      goalSecs > 0 && isCurrentYear ? (goalSecs * currentDayOfYear) / daysInYear : goalSecs;
    const paceRatio = expectedSecs > 0 ? totalSecs / expectedSecs : 1;
    const paceLabel =
      !isCurrentYear || goalSecs <= 0
        ? met
          ? "Target reached"
          : "Year complete"
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

    const goalMonthSecs = goalSecs > 0 ? goalSecs / 12 : 0;
    const consistencyPct =
      isCurrentYear
        ? Math.round((activeDays / Math.max(1, currentDayOfYear)) * 100)
        : Math.round((activeDays / daysInYear) * 100);

    const bestMonth = monthlyData.reduce(
      (best, m) => (m.totalSecs > best.totalSecs ? m : best),
      monthlyData[0]
    );

    const quarterlyData = [
      { label: "Q1", months: "Jan – Mar", secs: quarterlySecs[0] },
      { label: "Q2", months: "Apr – Jun", secs: quarterlySecs[1] },
      { label: "Q3", months: "Jul – Sep", secs: quarterlySecs[2] },
      { label: "Q4", months: "Oct – Dec", secs: quarterlySecs[3] },
    ];

    const avgActiveDaySecs = activeDays > 0 ? totalSecs / activeDays : 0;

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
      goalMonthSecs,
      monthlyData,
      quarterlyData,
      consistencyPct,
      bestMonth,
      avgActiveDaySecs,
      currentMonthIndex: isCurrentYear ? today.getMonth() : -1,
    };
  }, [days, nowMs, settings, viewYear, isCurrentYear, daysInYear]);

  const yearAchievementTargets = useMemo(() => {
    if (!settings) return [];
    return achievementTargetsForYear(settings, yearKey);
  }, [settings, yearKey]);

  const achievementSummary = useMemo(() => {
    const total = yearAchievementTargets.length;
    const completed = yearAchievementTargets.filter(isMilestoneComplete).length;
    return { total, completed };
  }, [yearAchievementTargets]);

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
    const ok = await patchSettings({
      action: "setYearlyGoal",
      minutes: h * 60 + m,
      yearKey,
    });
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
      action: "addYearlyAchievementTarget",
      yearKey,
      title,
      targetCount,
      unit: newTargetUnit.trim() || undefined,
      category: newTargetCategory,
    });
    if (ok) {
      setNewTargetTitle("");
      setNewTargetCount("");
      setNewTargetUnit("");
      setNewTargetCategory("work");
      setShowAddTarget(false);
    }
  };

  const updateAchievementCount = async (targetId: string, currentCount: number) => {
    await patchSettings({
      action: "updateYearlyAchievementTarget",
      targetId,
      currentCount,
    });
  };

  const updateAchievementDetails = async (
    targetId: string,
    details: {
      title: string;
      targetCount: number;
      unit: string;
      category: MonthlyMilestoneCategory;
    }
  ) => {
    await patchSettings({
      action: "updateYearlyAchievementTarget",
      targetId,
      title: details.title,
      targetCount: details.targetCount,
      unit: details.unit,
      category: details.category,
    });
  };

  const deleteAchievementTarget = async (targetId: string) => {
    await patchSettings({ action: "deleteYearlyAchievementTarget", targetId });
  };

  const shiftYear = (delta: number) => {
    setViewYear((prev) => prev + delta);
  };

  const hasPeriodGoalOverride = settings ? hasYearlyGoalOverride(settings, yearKey) : false;

  if (!ready || !isAuthenticated) return <AppSplash />;

  const inputClass =
    "w-full px-3 py-2.5 bg-white/5 border border-[var(--card-border)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/35";

  return (
    <main
      className="relative min-h-[100dvh] overflow-x-hidden pb-10 safe-top safe-bottom"
      style={{ background: "var(--bg-gradient)" }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-slow absolute -top-32 right-1/4 h-[22rem] w-[22rem] rounded-full bg-violet-500/12 blur-[120px]" />
        <div className="animate-float-slow absolute top-1/3 -left-20 h-96 w-96 rounded-full bg-[var(--accent-cyan)]/10 blur-[130px] [animation-delay:-4s]" />
        <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-500/10 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 pt-2 sm:mb-8 sm:pt-4"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-violet-300">
                <Sparkles className="h-3.5 w-3.5" />
                Yearly plans
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gradient-cyan sm:text-4xl">
                Your year at a glance
              </h1>
              <p className="mt-2 max-w-lg text-sm text-[var(--text-secondary)] sm:text-base">
                Set annual goals, track milestones, and see how each month contributes to your
                yearly vision.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]/70 p-1.5 backdrop-blur sm:self-auto">
              <button
                type="button"
                onClick={() => shiftYear(-1)}
                className="touch-target rounded-xl p-2 text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Previous year"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="min-w-[5rem] text-center text-sm font-bold text-white">
                {viewYear}
              </span>
              <button
                type="button"
                onClick={() => shiftYear(1)}
                disabled={isCurrentYear}
                className="touch-target rounded-xl p-2 text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                aria-label="Next year"
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
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
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
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl"
              />
              <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col items-center lg:items-start">
                  <ProgressRing pct={yearStats.pct} met={yearStats.met} />
                  <p className="mt-4 text-center text-sm text-[var(--text-secondary)] lg:text-left">
                    {yearStats.met
                      ? "🎉 Yearly target achieved — incredible dedication!"
                      : yearStats.goalSecs > 0
                        ? `${formatDuration(yearStats.remainingSecs)} left to reach your goal`
                        : "Set a yearly goal below to start tracking"}
                  </p>
                </div>

                <div className="w-full max-w-md space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--card-border)] bg-white/[0.03] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Logged
                      </p>
                      <p className="mt-1 text-xl font-extrabold tabular-nums text-white sm:text-2xl">
                        {formatDuration(yearStats.totalSecs)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--card-border)] bg-white/[0.03] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Target
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditingGoal(true)}
                        className="mt-1 block text-left text-xl font-extrabold tabular-nums text-white transition-colors hover:text-violet-300 sm:text-2xl"
                        title="Edit yearly target"
                      >
                        {yearStats.goalMinutes > 0
                          ? formatEstimate(yearStats.goalMinutes)
                          : "—"}
                      </button>
                    </div>
                    <div className="rounded-2xl border border-[var(--card-border)] bg-white/[0.03] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Active days
                      </p>
                      <p className="mt-1 text-xl font-extrabold tabular-nums text-white sm:text-2xl">
                        {yearStats.activeDays}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--card-border)] bg-white/[0.03] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Consistency
                      </p>
                      <p className="mt-1 text-xl font-extrabold tabular-nums text-white sm:text-2xl">
                        {yearStats.consistencyPct}%
                      </p>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-3 rounded-2xl border p-4"
                    style={{
                      borderColor: `${yearStats.paceTint}40`,
                      background: `${yearStats.paceTint}0d`,
                    }}
                  >
                    <span
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border"
                      style={{
                        color: yearStats.paceTint,
                        borderColor: `${yearStats.paceTint}40`,
                        background: `${yearStats.paceTint}14`,
                      }}
                    >
                      {yearStats.paceLabel === "Ahead of pace" ? (
                        <Zap className="h-5 w-5" />
                      ) : yearStats.paceLabel === "On track" ? (
                        <TrendingUp className="h-5 w-5" />
                      ) : (
                        <Flame className="h-5 w-5" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{yearStats.paceLabel}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {yearStats.avgActiveDaySecs > 0
                          ? `~${formatDuration(yearStats.avgActiveDaySecs)} per active day`
                          : "Log time to build your streak"}
                        {isCurrentYear && yearStats.daysLeft > 0
                          ? ` · ${yearStats.daysLeft} day${yearStats.daysLeft === 1 ? "" : "s"} left`
                          : ""}
                      </p>
                    </div>
                  </div>

                  {yearStats.bestMonth.totalSecs > 0 ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/35 bg-amber-400/10 text-amber-300">
                        <Trophy className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-white">
                          Best month: {yearStats.bestMonth.month}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {formatDuration(yearStats.bestMonth.totalSecs)} logged
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.section>

            {/* Yearly milestones */}
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
                    Yearly milestones
                  </h2>
                  <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
                    Big goals for {viewYear} — launches, revenue targets, fitness achievements, or
                    spiritual milestones.
                  </p>
                </div>
                {achievementSummary.total > 0 ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-violet-400/35 bg-violet-400/10 px-3 py-1 text-xs font-bold text-violet-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {achievementSummary.completed} of {achievementSummary.total} done
                  </span>
                ) : null}
              </div>

              {yearAchievementTargets.length > 0 ? (
                <ul className="mb-5 space-y-3">
                  {yearAchievementTargets.map((target) => (
                    <li key={target.id}>
                      <MilestoneTargetCard
                        target={target}
                        busy={busy}
                        periodLabel="this year"
                        accent="violet"
                        extraBumpValues={[50]}
                        onUpdateCount={(count) => void updateAchievementCount(target.id, count)}
                        onUpdateDetails={(details) =>
                          void updateAchievementDetails(target.id, details)
                        }
                        onDelete={() => void deleteAchievementTarget(target.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mb-5 rounded-2xl border border-dashed border-[var(--card-border)] bg-white/[0.02] px-4 py-8 text-center">
                  <Flag className="mx-auto mb-3 h-8 w-8 text-violet-400/60" />
                  <p className="text-sm font-semibold text-white">No yearly milestones yet</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Add a target like &ldquo;Launch 2 products&rdquo; or &ldquo;Read Quran cover to
                    cover&rdquo;
                  </p>
                </div>
              )}

              {showAddTarget ? (
                <div className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-4 sm:p-5">
                  <p className="mb-3 text-sm font-bold text-white">New yearly milestone</p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newTargetTitle}
                      onChange={(e) => setNewTargetTitle(e.target.value)}
                      placeholder="e.g. Reach 500 client meetings"
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
                                  ? { background: colors.color, borderColor: colors.border }
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
                          placeholder="500"
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
                          placeholder="meetings"
                          maxLength={40}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Leave target number empty for one-off goals — use &ldquo;Mark complete&rdquo;
                      when finished.
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
                  Add a milestone for {viewYear}
                </button>
              )}
            </motion.section>

            {/* Area breakdown */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6 grid gap-4 sm:grid-cols-3"
            >
              {[
                {
                  label: "Work",
                  secs: yearStats.workSecs,
                  Icon: Briefcase,
                  tint: WORK_LOG_AREA_COLORS.work.color,
                },
                {
                  label: "Deen",
                  secs: yearStats.deenSecs,
                  Icon: Moon,
                  tint: WORK_LOG_AREA_COLORS.deen.color,
                },
                {
                  label: "Fitness",
                  secs: yearStats.fitnessSecs,
                  Icon: Dumbbell,
                  tint: WORK_LOG_AREA_COLORS.fitness.color,
                },
              ].map(({ label, secs, Icon, tint }, i) => {
                const share =
                  yearStats.totalSecs > 0
                    ? Math.round((secs / yearStats.totalSecs) * 100)
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
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">{share}% of year</p>
                  </motion.div>
                );
              })}
            </motion.section>

            {/* Quarterly breakdown */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="glass-card mb-6 rounded-2xl p-5 sm:p-6"
            >
              <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-white">
                <CalendarRange className="h-4 w-4 text-violet-400" />
                Quarterly breakdown
              </h2>
              <p className="mb-4 text-xs text-[var(--text-secondary)]">
                How each quarter contributes to your yearly total
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {yearStats.quarterlyData.map((q, i) => {
                  const share =
                    yearStats.totalSecs > 0
                      ? Math.round((q.secs / yearStats.totalSecs) * 100)
                      : 0;
                  const qGoal = yearStats.goalSecs > 0 ? yearStats.goalSecs / 4 : 0;
                  const qPct = qGoal > 0 ? Math.min(100, Math.round((q.secs / qGoal) * 100)) : 0;
                  return (
                    <div
                      key={q.label}
                      className="rounded-2xl border border-[var(--card-border)] bg-white/[0.03] p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-bold text-white">{q.label}</span>
                        <span className="text-[10px] text-[var(--text-secondary)]">{q.months}</span>
                      </div>
                      <p className="text-xl font-extrabold tabular-nums text-white">
                        {formatDuration(q.secs)}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${qPct}%` }}
                          transition={{ delay: 0.15 + i * 0.05, duration: 0.8 }}
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-[var(--accent-cyan)]"
                        />
                      </div>
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">
                        {share}% of year{qGoal > 0 ? ` · ${qPct}% of quarter goal` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </motion.section>

            {/* Monthly chart + grid */}
            <div className="mb-6 grid gap-6 lg:grid-cols-5">
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-card rounded-2xl p-5 lg:col-span-2"
              >
                <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-white">
                  <TrendingUp className="h-4 w-4 text-violet-400" />
                  Monthly activity
                </h2>
                <p className="mb-4 text-xs text-[var(--text-secondary)]">
                  Hours logged each month in {viewYear}
                </p>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={yearStats.monthlyData}
                      margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.06)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: "#888", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
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
                        formatter={(v: number) => [`${v}h`, "Total"]}
                      />
                      <Bar
                        dataKey="total"
                        fill="url(#yearBarGrad)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                      />
                      <defs>
                        <linearGradient id="yearBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a78bfa" />
                          <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity={0.6} />
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
                  <Target className="h-4 w-4 text-violet-400" />
                  Month overview
                </h2>
                <p className="mb-4 text-xs text-[var(--text-secondary)]">
                  Brighter months mean more time logged — current month is highlighted
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
                  {yearStats.monthlyData.map((m) => {
                    const isFuture =
                      isCurrentYear && m.monthIndex > yearStats.currentMonthIndex;
                    const isCurrentMonth =
                      isCurrentYear && m.monthIndex === yearStats.currentMonthIndex;
                    return (
                      <MonthCell
                        key={m.month}
                        monthIndex={m.monthIndex}
                        year={viewYear}
                        totalSecs={m.totalSecs}
                        goalMonthSecs={yearStats.goalMonthSecs}
                        isCurrentMonth={isCurrentMonth}
                        isFuture={isFuture}
                      />
                    );
                  })}
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
                    <Target className="h-4 w-4 text-violet-400" />
                    Yearly time target
                  </h2>
                  <p className="mt-1 max-w-md text-xs text-[var(--text-secondary)]">
                    Work, deen, and fitness combined for {viewYear}. Saved per year — other years
                    keep their own targets.
                    {!hasPeriodGoalOverride && yearStats.goalMinutes > 0
                      ? " Currently using your default yearly goal."
                      : ""}
                  </p>
                </div>
                {!editingGoal ? (
                  <button
                    type="button"
                    onClick={() => setEditingGoal(true)}
                    className="shrink-0 rounded-xl border border-violet-400/40 px-4 py-2.5 text-sm font-semibold text-violet-300 transition-colors hover:bg-violet-400/10"
                  >
                    Edit target
                  </button>
                ) : null}
              </div>

              {editingGoal ? (
                <div className="mt-5 flex flex-wrap items-end gap-3">
                  <div className="w-24">
                    <label className="text-xs text-[var(--text-secondary)]">Hours</label>
                    <input
                      type="number"
                      min={0}
                      max={8784}
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
                    className="rounded-xl bg-gradient-to-r from-violet-500 to-[var(--accent-cyan)] px-5 py-2.5 text-sm font-bold text-[#070d0d] shadow-[0_0_20px_-4px_rgba(167,139,250,0.4)] disabled:opacity-50"
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
                  {yearStats.goalMinutes > 0
                    ? formatEstimate(yearStats.goalMinutes)
                    : "Not set"}
                  <span className="ml-2 text-base font-medium text-[var(--text-secondary)]">
                    in {viewYear}
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
