"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Flame,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Loader2,
  LogOut,
  StickyNote,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DailyGoalProgress,
  PersonTabs,
  TaskTemplatesPanel,
  type WorkLogSettings,
} from "@/components/work-log/work-log-extras";
import { DailyPlansSection } from "@/components/work-log/work-log-daily-plans";
import { YearlyContributionChart } from "@/components/work-log/yearly-contribution-chart";
import {
  createDefaultPlans,
  DEFAULT_DEEN_PLAN_ID,
  DEFAULT_FITNESS_PLAN_ID,
  DEFAULT_WORK_PLAN_ID,
  serializePlan,
  type SerializedWorkLogPlan,
} from "@/lib/work-log-plans";
import { PRIMARY_PERSON_ID } from "@/lib/user-work-log-settings";
import { CONTRIBUTION_WEEKS } from "@/lib/yearly-contribution-chart";
import { dateKeyDaysAgo } from "@/lib/date-keys";
import {
  confirmTimeAdjustment,
  loggedTimeLooksImpossible,
  validateTimeAdjustment,
} from "@/lib/work-log-time-guards";
import {
  deenLiveSeconds,
  fitnessLiveSeconds,
  liveSeconds,
  totalLiveSeconds,
} from "@/lib/work-log-live-seconds";
import { liveTimerElapsedSeconds, applyTimerRolloverToDays } from "@/lib/work-log-timer-rollover";
import {
  deleteWorkLogDay,
  fetchWorkLogDays,
  fetchWorkLogSettings,
  patchWorkLogDay,
} from "@/lib/offline/work-log-api";
import { applyClientWorkLogAction } from "@/lib/offline/client-mutations";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { AppSplash } from "@/components/app-splash";
import { WORK_LOG_AREA_COLORS, workLogAreaColorForKind } from "@/lib/work-log-area-colors";

export type WorkLogDashboardProps = {
  apiBase: string;
  authorizedInit: (init?: RequestInit) => RequestInit;
  backHref?: string;
  backLabel?: string;
  title?: string;
  subtitle?: string;
  userEmail?: string;
  userName?: string;
  onLogout?: () => void;
  /** Opens the onboarding tour again. */
  onStartTour?: () => void;
  /** When set, enables people profiles, saved tasks, and daily goals. */
  settingsApiBase?: string;
  /** User id for offline cache (enables offline mode when set). */
  offlineUserId?: string;
};

type WorkLogPriority = "high" | "medium" | "low";

type WorkLogTask = {
  id: string;
  text: string;
  done: boolean;
  priority: WorkLogPriority;
  estimateMinutes: number | null;
  createdAt: string;
};

const PRIORITY_ORDER: Record<WorkLogPriority, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_STYLES: Record<WorkLogPriority, { label: string; className: string }> = {
  high: {
    label: "High",
    className: "border-red-400/40 bg-red-400/10 text-red-400",
  },
  medium: {
    label: "Med",
    className: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  },
  low: {
    label: "Low",
    className: "border-sky-400/40 bg-sky-400/10 text-sky-400",
  },
};

function nextPriority(p: WorkLogPriority): WorkLogPriority {
  return p === "high" ? "medium" : p === "medium" ? "low" : "high";
}

function PriorityBadge({
  priority,
  onClick,
}: {
  priority: WorkLogPriority;
  onClick?: () => void;
}) {
  const style = PRIORITY_STYLES[priority];
  const base = `shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${style.className}`;
  if (!onClick) return <span className={base}>{style.label}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} hover:opacity-80`}
      title="Click to change priority"
    >
      {style.label}
    </button>
  );
}

function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function EstimateBadge({ minutes }: { minutes: number | null }) {
  if (!minutes) return null;
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
      <Clock className="w-3 h-3" />
      {formatEstimate(minutes)}
    </span>
  );
}

/** High first, then medium, then low; ties keep insertion order (oldest first). */
function sortByPriority(tasks: WorkLogTask[]): WorkLogTask[] {
  return [...tasks].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority ?? "medium"] - PRIORITY_ORDER[b.priority ?? "medium"]
  );
}

type WorkLogDay = {
  dateKey: string;
  totalMinutes: number;
  timerStartedAt: string | null;
  tasks: WorkLogTask[];
  plans?: SerializedWorkLogPlan[];
  deenTasks: WorkLogTask[];
  deenMinutes: number;
  deenTimerStartedAt: string | null;
  fitnessTasks?: WorkLogTask[];
  fitnessMinutes?: number;
  fitnessTimerStartedAt?: string | null;
  azkarMorningSeconds?: number;
  azkarEveningSeconds?: number;
  notes: string;
};

function resolveClientPlans(day: WorkLogDay): SerializedWorkLogPlan[] {
  if (day.plans?.length) return [...day.plans].sort((a, b) => a.order - b.order);
  const now = new Date().toISOString();
  return [
    {
      id: DEFAULT_WORK_PLAN_ID,
      kind: "work",
      title: "Business",
      priority: "high",
      estimateMinutes: null,
      order: 0,
      subTasks: day.tasks,
      createdAt: now,
    },
    {
      id: DEFAULT_DEEN_PLAN_ID,
      kind: "deen",
      title: "Deen",
      priority: "high",
      estimateMinutes: null,
      order: 1,
      subTasks: day.deenTasks ?? [],
      createdAt: now,
    },
    {
      id: DEFAULT_FITNESS_PLAN_ID,
      kind: "fitness",
      title: "Fitness",
      priority: "high",
      estimateMinutes: null,
      order: 2,
      subTasks: day.fitnessTasks ?? [],
      createdAt: now,
    },
  ];
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyDay(dateKey: string): WorkLogDay {
  return {
    dateKey,
    totalMinutes: 0,
    timerStartedAt: null,
    tasks: [],
    plans: createDefaultPlans().map(serializePlan),
    deenTasks: [],
    deenMinutes: 0,
    deenTimerStartedAt: null,
    fitnessTasks: [],
    fitnessMinutes: 0,
    fitnessTimerStartedAt: null,
    azkarMorningSeconds: 0,
    azkarEveningSeconds: 0,
    notes: "",
  };
}

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDayLabelShort(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const VIEW_TABS = [
  { id: "track" as const, label: "Log my day", mobileLabel: "Today", hint: "Timers & tasks", Icon: ListChecks },
  { id: "insights" as const, label: "My progress", mobileLabel: "Progress", hint: "Charts & history", Icon: BarChart3 },
];

function quickStartStorageKey(userKey?: string) {
  return `worklog_quickstart_dismissed:${userKey ?? "anon"}`;
}

function viewTabClass(active: boolean, variant: "inline" | "bottom") {
  if (variant === "bottom") {
    return `relative flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 min-h-[3.5rem] transition-all ${
      active
        ? "text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/[0.08]"
        : "text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-white"
    }`;
  }
  return `relative flex flex-1 items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all sm:px-4 ${
    active ? "text-white" : "text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-white"
  }`;
}

function viewTabIconClass(active: boolean, variant: "inline" | "bottom") {
  if (variant === "bottom") {
    return active
      ? "text-[var(--accent-cyan)]"
      : "text-[var(--text-secondary)]";
  }
  return `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
    active
      ? "border-[var(--accent-cyan)]/45 bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]"
      : "border-[var(--card-border)] bg-white/[0.04] text-[var(--text-secondary)] group-hover:border-white/15 group-hover:text-white"
  }`;
}

function WorkLogDashboardHeader({
  title,
  subtitle,
  greetingText,
  todayKey,
  activePerson,
  showPersonBadge,
  backHref,
  backLabel,
  onBack,
  onStartTour,
  onLogout,
  showActions,
}: {
  title: string;
  subtitle: string;
  greetingText: string;
  todayKey: string;
  activePerson?: { name: string; color: string };
  showPersonBadge: boolean;
  backHref?: string;
  backLabel?: string;
  onBack: () => void;
  onStartTour?: () => void;
  onLogout?: () => void;
  showActions: boolean;
}) {
  const dateBadge = (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--card-border)] bg-white/5 px-3 py-1 text-xs font-medium text-white/90">
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[var(--accent-cyan)]" />
      <span className="sm:hidden">{formatDayLabelShort(todayKey)}</span>
      <span className="hidden sm:inline">Today · {formatDayLabel(todayKey)}</span>
    </span>
  );

  const personBadge =
    showPersonBadge && activePerson ? (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold"
        style={{
          borderColor: `${activePerson.color}55`,
          color: activePerson.color,
          background: `${activePerson.color}14`,
        }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: activePerson.color }} />
        {activePerson.name}
      </span>
    ) : null;

  const actionButtons = showActions ? (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
      {onStartTour ? (
        <button
          type="button"
          onClick={onStartTour}
          data-tour="tour-btn"
          className="touch-target inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--accent-cyan)]/35 bg-[var(--accent-cyan)]/10 p-2.5 text-sm font-semibold text-[var(--accent-cyan)] transition-all hover:bg-[var(--accent-cyan)]/15 sm:px-4 sm:py-2"
          title="Take a quick tour of the app"
        >
          <HelpCircle className="h-5 w-5" />
          <span className="hidden sm:inline">Take a tour</span>
        </button>
      ) : null}
      {onLogout ? (
        <button
          type="button"
          onClick={onLogout}
          className="touch-target inline-flex items-center justify-center rounded-xl border border-[var(--card-border)] bg-white/5 p-2.5 text-sm font-semibold transition-all hover:border-red-400/40 hover:bg-white/10 sm:px-4 sm:py-2"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-5 w-5 sm:hidden" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {backHref ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{backLabel ?? "Back"}</span>
            </button>
          ) : null}
          <div className="relative shrink-0">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-2 rounded-full bg-[var(--accent-cyan)]/15 blur-2xl sm:-inset-3"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={title} data-tour="logo" className="relative h-10 w-auto sm:h-14" />
          </div>
          <div className="hidden min-w-0 flex-1 space-y-2 sm:block">
            <h1 className="text-2xl font-bold leading-tight text-white">{greetingText}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {dateBadge}
              {personBadge}
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>
          </div>
        </div>
        {actionButtons}
      </div>

      <div className="mt-4 space-y-2.5 sm:hidden">
        <h1 className="text-xl font-bold leading-snug text-white">{greetingText}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {dateBadge}
          {personBadge}
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>
      </div>
    </>
  );
}

type TimeList = "work" | "deen" | "fitness";

function historyTimeKey(dateKey: string, list: TimeList): string {
  return `${dateKey}:${list}`;
}

function HistoryDayTimeEditor({
  day,
  nowMs,
  busy,
  adjustH,
  adjustM,
  onAdjustHChange,
  onAdjustMChange,
  onApply,
}: {
  day: WorkLogDay;
  nowMs: number;
  busy: boolean;
  adjustH: Record<string, string>;
  adjustM: Record<string, string>;
  onAdjustHChange: (key: string, value: string) => void;
  onAdjustMChange: (key: string, value: string) => void;
  onApply: (dateKey: string, list: TimeList, mode: "add" | "set", sign?: 1 | -1) => void;
}) {
  const rows: {
    list: TimeList;
    label: string;
    color: string;
    secs: number;
    running: boolean;
  }[] = [
    {
      list: "work",
      label: "Business",
      color: WORK_LOG_AREA_COLORS.work.color,
      secs: liveSeconds(day, nowMs),
      running: Boolean(day.timerStartedAt),
    },
    {
      list: "deen",
      label: "Deen",
      color: WORK_LOG_AREA_COLORS.deen.color,
      secs: deenLiveSeconds(day, nowMs),
      running: Boolean(day.deenTimerStartedAt),
    },
    {
      list: "fitness",
      label: "Fitness",
      color: WORK_LOG_AREA_COLORS.fitness.color,
      secs: fitnessLiveSeconds(day, nowMs),
      running: Boolean(day.fitnessTimerStartedAt),
    },
  ];

  return (
    <div className="rounded-lg border border-[var(--card-border)] bg-white/[0.03] p-3 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Edit logged time</p>
      {rows.map((row) => {
        const key = historyTimeKey(day.dateKey, row.list);
        return (
          <div key={row.list} className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <span className="w-[4.5rem] text-xs font-semibold shrink-0" style={{ color: row.color }}>
              {row.label}
            </span>
            <span className="text-sm font-bold tabular-nums text-white min-w-[4rem]">
              {formatDuration(row.secs)}
            </span>
            {row.running ? (
              <span className="text-[10px] font-semibold text-amber-300/90">timer running</span>
            ) : null}
            <input
              type="number"
              min={0}
              max={23}
              placeholder="h"
              value={adjustH[key] ?? ""}
              onChange={(e) => onAdjustHChange(key, e.target.value)}
              className="w-14 rounded-md border border-[var(--card-border)] bg-white/5 px-2 py-1.5 text-sm text-white"
            />
            <input
              type="number"
              min={0}
              max={59}
              placeholder="m"
              value={adjustM[key] ?? ""}
              onChange={(e) => onAdjustMChange(key, e.target.value)}
              className="w-14 rounded-md border border-[var(--card-border)] bg-white/5 px-2 py-1.5 text-sm text-white"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => onApply(day.dateKey, row.list, "add", 1)}
              className="rounded-md border border-[var(--card-border)] px-2.5 py-1.5 text-xs font-semibold hover:bg-white/5 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onApply(day.dateKey, row.list, "add", -1)}
              className="rounded-md border border-red-400/40 bg-red-400/10 px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-400/20 disabled:opacity-50"
            >
              −
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onApply(day.dateKey, row.list, "set")}
              className="rounded-md border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 disabled:opacity-50"
            >
              Set
            </button>
          </div>
        );
      })}
      <p className="text-[11px] text-[var(--text-secondary)]">
        <strong className="text-white/80 font-semibold">Set</strong> replaces the total (e.g. enter{" "}
        <strong className="text-white/80 font-semibold">6</strong> hours for Business). Add/Subtract change
        it by the amount entered. Use hours and minutes separately — not 90 in the hours box.
      </p>
    </div>
  );
}

export function WorkLogDashboard({
  apiBase,
  authorizedInit,
  backHref,
  backLabel,
  title = "Work Logging",
  subtitle = "Daily working time & completed tasks",
  userEmail,
  userName,
  onLogout,
  onStartTour,
  settingsApiBase,
  offlineUserId,
}: WorkLogDashboardProps) {
  const router = useRouter();
  const settingsEnabled = Boolean(settingsApiBase);

  const [days, setDays] = useState<WorkLogDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activePersonId, setActivePersonId] = useState(PRIMARY_PERSON_ID);
  const [settings, setSettings] = useState<WorkLogSettings | null>(null);

  const [notesDraft, setNotesDraft] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [historyAdjustH, setHistoryAdjustH] = useState<Record<string, string>>({});
  const [historyAdjustM, setHistoryAdjustM] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [activeView, setActiveView] = useState<"track" | "insights">("track");
  const [showQuickStart, setShowQuickStart] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const dismissed = window.localStorage.getItem(quickStartStorageKey(userEmail)) === "1";
      setShowQuickStart(!dismissed);
    } catch {
      setShowQuickStart(true);
    }
  }, [userEmail]);

  const dismissQuickStart = useCallback(() => {
    setShowQuickStart(false);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(quickStartStorageKey(userEmail), "1");
    } catch {
      /* ignore */
    }
  }, [userEmail]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const todayKey = localDateKey(new Date(nowMs));
  const today = useMemo(
    () => days.find((d) => d.dateKey === todayKey) ?? emptyDay(todayKey),
    [days, todayKey]
  );
  /** A timer may still be running on a previous day (e.g. left on overnight). */
  const runningDay = useMemo(() => days.find((d) => d.timerStartedAt), [days]);
  const timerRunning = Boolean(runningDay);
  const runningDeenDay = useMemo(() => days.find((d) => d.deenTimerStartedAt), [days]);
  const deenTimerRunning = Boolean(runningDeenDay);
  const runningFitnessDay = useMemo(() => days.find((d) => d.fitnessTimerStartedAt), [days]);
  const fitnessTimerRunning = Boolean(runningFitnessDay);

  const mergeDay = useCallback((day: WorkLogDay) => {
    setDays((prev) => {
      const rest = prev.filter((d) => d.dateKey !== day.dateKey);
      return [...rest, day].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
    });
  }, []);

  const load = useCallback(async () => {
    setErrorMsg(null);
    setLoading(true);
    const fromKey = dateKeyDaysAgo(CONTRIBUTION_WEEKS * 7);
    try {
      if (offlineUserId) {
        const result = await fetchWorkLogDays(
          apiBase,
          activePersonId,
          offlineUserId,
          authorizedInit,
          { from: fromKey }
        );
        if (!result.ok) {
          setDays([]);
          setErrorMsg(result.error ?? "Failed to load work log.");
          return;
        }
        setDays(
          applyTimerRolloverToDays(
            (result.data?.days ?? []) as import("@/lib/admin-work-log").SerializedWorkLogDay[]
          ) as WorkLogDay[]
        );
        if (result.fromCache && result.offline) {
          setErrorMsg(null);
        }
        return;
      }

      const personQuery = settingsEnabled
        ? `?personId=${encodeURIComponent(activePersonId)}&from=${encodeURIComponent(fromKey)}`
        : `?from=${encodeURIComponent(fromKey)}`;
      const res = await fetch(`${apiBase}${personQuery}`, authorizedInit());
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : `Request failed (${res.status})`;
        setDays([]);
        setErrorMsg(msg);
        return;
      }
      const rows = Array.isArray((data as { days?: unknown })?.days)
        ? ((data as { days: WorkLogDay[] }).days)
        : [];
      setDays(applyTimerRolloverToDays(rows as import("@/lib/admin-work-log").SerializedWorkLogDay[]) as WorkLogDay[]);
    } catch {
      setDays([]);
      setErrorMsg("Failed to load work log.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authorizedInit, activePersonId, settingsEnabled, offlineUserId]);

  const loadSettings = useCallback(async () => {
    if (!settingsApiBase) return;
    try {
      if (offlineUserId) {
        const result = await fetchWorkLogSettings(
          settingsApiBase,
          offlineUserId,
          authorizedInit
        );
        if (result.ok && result.data?.settings) {
          setSettings(result.data.settings as WorkLogSettings);
        }
        return;
      }

      const res = await fetch(settingsApiBase, authorizedInit());
      const data = await res.json().catch(() => null);
      if (res.ok && data && typeof data === "object" && "settings" in data) {
        setSettings((data as { settings: WorkLogSettings }).settings);
      }
    } catch {
      // Settings are optional enhancement.
    }
  }, [settingsApiBase, authorizedInit, offlineUserId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useOfflineSync({
    authorizedInit,
    onSynced: () => void load(),
  });

  useEffect(() => {
    if (!settingsEnabled) return;
    const qs = `?personId=${encodeURIComponent(activePersonId)}`;
    void Promise.all([
      fetch(`/api/work-log/${todayKey}/azkar/morning${qs}`, { credentials: "include" }),
      fetch(`/api/work-log/${todayKey}/azkar/evening${qs}`, { credentials: "include" }),
    ]).then((results) => {
      if (results.some((r) => r.ok)) void load();
    });
  }, [todayKey, activePersonId, settingsEnabled, load]);

  useEffect(() => {
    if (!settings?.people.length) return;
    if (!settings.people.some((p) => p.id === activePersonId)) {
      setActivePersonId(PRIMARY_PERSON_ID);
    }
  }, [settings?.people, activePersonId]);

  useEffect(() => {
    if (!notesDirty) setNotesDraft(today.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.notes, today.dateKey]);

  const patchDay = useCallback(
    async (dateKey: string, body: Record<string, unknown>) => {
      setErrorMsg(null);
      setBusy(true);
      try {
        if (offlineUserId) {
          const result = await patchWorkLogDay(
            apiBase,
            dateKey,
            activePersonId,
            offlineUserId,
            body,
            authorizedInit,
            days as import("@/lib/admin-work-log").SerializedWorkLogDay[]
          );
          if (!result.ok) {
            setErrorMsg(result.error ?? "Request failed.");
            return false;
          }
          const day = result.data?.day as WorkLogDay | undefined;
          if (day) mergeDay(day);
          if (result.error) {
            setErrorMsg(result.error);
          }
          return Boolean(day);
        }

        const personQuery = settingsEnabled
          ? `?personId=${encodeURIComponent(activePersonId)}`
          : "";
        const res = await fetch(
          `${apiBase}/${encodeURIComponent(dateKey)}${personQuery}`,
          authorizedInit({
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setErrorMsg(
            data && typeof data === "object" && data !== null && "error" in data
              ? String((data as { error: unknown }).error)
              : `Request failed (${res.status})`
          );
          return false;
        }
        const day = (data as { day?: WorkLogDay })?.day;
        if (day) mergeDay(day);
        return true;
      } catch {
        setErrorMsg("Request failed. Check your connection.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apiBase, authorizedInit, mergeDay, activePersonId, settingsEnabled, offlineUserId, days]
  );

  const todayPlans = useMemo(() => resolveClientPlans(today), [today]);

  const patchDayForPlans = useCallback(
    async (body: Record<string, unknown>) => {
      const action = body.action;
      if (action === "stopTimer" || action === "adjustMinutes") {
        const ok = await patchDay(todayKey, body);
        if (ok) void load();
        return ok;
      }
      return patchDay(todayKey, body);
    },
    [patchDay, todayKey, load]
  );

  const saveNotes = async () => {
    setSavingNotes(true);
    const ok = await patchDay(todayKey, { action: "setNotes", notes: notesDraft });
    if (ok) setNotesDirty(false);
    setSavingNotes(false);
  };

  const deleteDay = async (dateKey: string) => {
    if (!confirm(`Delete the entry for ${formatDayLabel(dateKey)}?`)) return;
    try {
      if (offlineUserId) {
        const result = await deleteWorkLogDay(
          apiBase,
          dateKey,
          activePersonId,
          offlineUserId,
          authorizedInit
        );
        if (!result.ok) {
          alert("Could not delete.");
          return;
        }
        setDays((prev) => prev.filter((d) => d.dateKey !== dateKey));
        return;
      }

      const personQuery = settingsEnabled
        ? `?personId=${encodeURIComponent(activePersonId)}`
        : "";
      const res = await fetch(
        `${apiBase}/${encodeURIComponent(dateKey)}${personQuery}`,
        authorizedInit({ method: "DELETE" })
      );
      if (!res.ok) {
        alert("Could not delete.");
        return;
      }
      setDays((prev) => prev.filter((d) => d.dateKey !== dateKey));
    } catch {
      alert("Could not delete.");
    }
  };

  const applyHistoryTimeAdjust = useCallback(
    async (dateKey: string, list: TimeList, mode: "add" | "set", sign: 1 | -1 = 1) => {
      const key = historyTimeKey(dateKey, list);
      const h = Number.parseInt(historyAdjustH[key] || "0", 10);
      const m = Number.parseInt(historyAdjustM[key] || "0", 10);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return;
      const day = days.find((d) => d.dateKey === dateKey);
      const currentMinutes = Math.floor(
        (list === "work"
          ? liveSeconds(day, nowMs)
          : list === "deen"
            ? deenLiveSeconds(day, nowMs)
            : fitnessLiveSeconds(day, nowMs)) / 60
      );
      const validation = validateTimeAdjustment({
        h,
        m,
        sign,
        mode,
        currentMinutes,
        dateKey,
        now: new Date(nowMs),
      });
      const minutes = confirmTimeAdjustment(validation, h, dateKey, new Date(nowMs));
      if (minutes === null) return;
      const ok = await patchDay(dateKey, { action: "adjustMinutes", mode, minutes, list });
      if (ok) {
        setHistoryAdjustH((s) => ({ ...s, [key]: "" }));
        setHistoryAdjustM((s) => ({ ...s, [key]: "" }));
      }
    },
    [patchDay, historyAdjustH, historyAdjustM, days, nowMs]
  );

  const applyTemplate = async (template: {
    text: string;
    priority: WorkLogPriority;
    estimateMinutes: number | null;
    list: "work" | "deen";
  }) => {
    const planId = template.list === "deen" ? DEFAULT_DEEN_PLAN_ID : DEFAULT_WORK_PLAN_ID;
    const body: Record<string, unknown> = {
      action: "addTask",
      planId,
      text: template.text,
      priority: template.priority,
    };
    if (template.estimateMinutes != null && template.estimateMinutes > 0) {
      body.estimateMinutes = template.estimateMinutes;
    }

    const currentDay = days.find((d) => d.dateKey === todayKey) ?? null;
    const optimistic = applyClientWorkLogAction(
      (currentDay ?? null) as import("@/lib/admin-work-log").SerializedWorkLogDay | null,
      todayKey,
      body,
      days as import("@/lib/admin-work-log").SerializedWorkLogDay[]
    );
    mergeDay(optimistic as WorkLogDay);

    const ok = await patchDay(todayKey, body);
    if (!ok) {
      void load();
      return;
    }
    const tab = template.list === "deen" ? "deen" : "work";
    router.replace(`/?tab=${tab}`, { scroll: false });
  };

  const isTemplateAdded = useCallback(
    (template: { text: string; list: "work" | "deen" }) => {
      const planId = template.list === "deen" ? DEFAULT_DEEN_PLAN_ID : DEFAULT_WORK_PLAN_ID;
      const plan = todayPlans.find((p) => p.id === planId);
      if (!plan) return false;
      const key = template.text.trim().toLowerCase();
      return plan.subTasks.some((t) => t.text.trim().toLowerCase() === key);
    },
    [todayPlans]
  );

  const applyAllTemplates = async () => {
    if (!settings?.taskTemplates.length) return;
    for (const t of settings.taskTemplates) {
      if (!isTemplateAdded(t)) {
        await applyTemplate(t);
      }
    }
  };

  const activePerson = settings?.people.find((p) => p.id === activePersonId);

  const stats = useMemo(() => {
    const byKey = new Map(days.map((d) => [d.dateKey, d]));
    const now = new Date(nowMs);

    const todayTotalSecs = totalLiveSeconds(byKey.get(todayKey), nowMs);
    const todayWorkSecs = runningDay?.timerStartedAt
      ? liveSeconds(runningDay, nowMs, todayKey)
      : liveSeconds(byKey.get(todayKey), nowMs);
    const todayDeenSecs = runningDeenDay?.deenTimerStartedAt
      ? deenLiveSeconds(runningDeenDay, nowMs, todayKey)
      : deenLiveSeconds(byKey.get(todayKey), nowMs);
    const todayFitnessSecs = runningFitnessDay?.fitnessTimerStartedAt
      ? fitnessLiveSeconds(runningFitnessDay, nowMs, todayKey)
      : fitnessLiveSeconds(byKey.get(todayKey), nowMs);

    let weekSecs = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      weekSecs += totalLiveSeconds(byKey.get(localDateKey(d)), nowMs);
    }

    const monthPrefix = todayKey.slice(0, 7);
    let monthSecs = 0;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${monthPrefix}-${String(d).padStart(2, "0")}`;
      monthSecs += totalLiveSeconds(byKey.get(key), nowMs);
    }

    let streak = 0;
    const cursor = new Date(now);
    if (totalLiveSeconds(byKey.get(localDateKey(cursor)), nowMs) < 60) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (totalLiveSeconds(byKey.get(localDateKey(cursor)), nowMs) >= 60) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const allTasks = todayPlans.flatMap((p) => p.subTasks);
    const taskCompletion =
      allTasks.length > 0
        ? Math.round((allTasks.filter((t) => t.done).length / allTasks.length) * 100)
        : 0;

    let chartTotal = 0;
    let activeDays = 0;
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = localDateKey(d);
      const totalH =
        Math.round((totalLiveSeconds(byKey.get(key), nowMs) / 3600) * 10) / 10;
      chartTotal += totalH;
      if (totalH > 0) activeDays += 1;
    }
    const avgDaily = activeDays > 0 ? Math.round((chartTotal / activeDays) * 10) / 10 : 0;

    const todayTimeSuspicious =
      loggedTimeLooksImpossible(Math.floor(todayWorkSecs / 60), todayKey, now) ||
      loggedTimeLooksImpossible(Math.floor(todayDeenSecs / 60), todayKey, now) ||
      loggedTimeLooksImpossible(Math.floor(todayFitnessSecs / 60), todayKey, now);

    return {
      todayTotalSecs,
      todayWorkSecs,
      todayDeenSecs,
      todayFitnessSecs,
      weekSecs,
      monthSecs,
      streak,
      taskCompletion,
      avgDaily,
      todayTimeSuspicious,
    };
  }, [days, nowMs, todayKey, todayPlans]);

  const chartData = useMemo(() => {
    const byKey = new Map(days.map((d) => [d.dateKey, d]));
    const now = new Date(nowMs);
    const out: {
      label: string;
      business: number;
      deen: number;
      fitness: number;
      total: number;
    }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = localDateKey(d);
      const day = byKey.get(key);
      const business = Math.round((liveSeconds(day, nowMs) / 3600) * 10) / 10;
      const deen = Math.round((deenLiveSeconds(day, nowMs) / 3600) * 10) / 10;
      const fitness = Math.round((fitnessLiveSeconds(day, nowMs) / 3600) * 10) / 10;
      out.push({
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        business,
        deen,
        fitness,
        total: Math.round((business + deen + fitness) * 10) / 10,
      });
    }
    return out;
  }, [days, nowMs]);

  const history = useMemo(
    () => days.filter((d) => d.dateKey !== todayKey),
    [days, todayKey]
  );

  const runningSessionSecs = runningDay?.timerStartedAt
    ? liveTimerElapsedSeconds(runningDay.timerStartedAt, nowMs, todayKey)
    : 0;

  const deenRunningSessionSecs = runningDeenDay?.deenTimerStartedAt
    ? liveTimerElapsedSeconds(runningDeenDay.deenTimerStartedAt, nowMs, todayKey)
    : 0;

  const fitnessRunningSessionSecs = runningFitnessDay?.fitnessTimerStartedAt
    ? liveTimerElapsedSeconds(runningFitnessDay.fitnessTimerStartedAt, nowMs, todayKey)
    : 0;

  const inputClass =
    "w-full px-4 py-3 bg-white/5 border border-[var(--card-border)] rounded-lg text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35";

  const greetingText = `${greetingForHour(new Date(nowMs).getHours())}${
    userName ? `, ${userName.split(" ")[0]}` : ""
  }! 👋`;

  if (loading && days.length === 0) {
    return <AppSplash />;
  }

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden text-white pt-4 pb-24 safe-top sm:pt-10 sm:pb-16"
      style={{ background: "var(--bg-gradient)" }}
    >
      {/* Ambient glow accents for depth */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-slow absolute -top-40 -left-24 h-96 w-96 rounded-full bg-[var(--accent-cyan)]/10 blur-[130px]" />
        <div className="animate-float-slow absolute top-1/3 -right-28 h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-[140px] [animation-delay:-6s]" />
        <div className="absolute -bottom-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
      </div>
      <div className="relative max-w-7xl mx-auto px-3 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 sm:mb-8"
        >
          <WorkLogDashboardHeader
            title={title}
            subtitle={subtitle}
            greetingText={greetingText}
            todayKey={todayKey}
            activePerson={activePerson}
            showPersonBadge={Boolean(activePerson && !(settingsEnabled && settings))}
            backHref={backHref}
            backLabel={backLabel}
            onBack={() => router.push(backHref ?? "/")}
            onStartTour={onStartTour}
            onLogout={onLogout}
            showActions={Boolean(userEmail || onLogout || onStartTour)}
          />
        </motion.div>

        {errorMsg ? (
          <p className="mb-6 rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            {errorMsg}
          </p>
        ) : null}

        {settingsEnabled && settings ? (
          <div data-tour="person-tabs">
            <PersonTabs
              people={settings.people}
              activePersonId={activePersonId}
              onSelect={setActivePersonId}
            />
          </div>
        ) : null}

        {showQuickStart ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 rounded-2xl border border-[var(--accent-cyan)]/25 bg-gradient-to-r from-[var(--accent-cyan)]/10 to-cyan-400/5 p-4 sm:mb-6 sm:p-6"
          >
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="flex min-w-0 gap-2.5 sm:gap-3">
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/15 sm:inline-flex">
                  <Lightbulb className="h-5 w-5 text-[var(--accent-cyan)]" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-white sm:text-lg">Getting started is easy</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Follow these three steps — no tech skills needed.
                  </p>
                  <ol className="mt-4 space-y-2.5 text-sm text-white/90">
                    <li className="flex items-start gap-2.5">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-cyan)] text-xs font-bold text-[#070d0d]">
                        1
                      </span>
                      <span>
                        Pick <strong className="text-white">Work</strong>, <strong className="text-white">Deen</strong>, or{" "}
                        <strong className="text-white">Fitness</strong> below
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-cyan)] text-xs font-bold text-[#070d0d]">
                        2
                      </span>
                      <span>
                        Tap <strong className="text-white">Start</strong> when you begin, and{" "}
                        <strong className="text-white">Stop</strong> when you finish
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-cyan)] text-xs font-bold text-[#070d0d]">
                        3
                      </span>
                      <span>
                        Add tasks and tap the circle to mark them done ✓
                      </span>
                    </li>
                  </ol>
                  {onStartTour ? (
                    <button
                      type="button"
                      onClick={onStartTour}
                      className="mt-4 text-sm font-semibold text-[var(--accent-cyan)] hover:underline"
                    >
                      Or take the guided tour →
                    </button>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={dismissQuickStart}
                className="touch-target shrink-0 rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Dismiss getting started tips"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </motion.div>
        ) : null}

        {/* View switch — desktop / tablet */}
        <div className="mb-3 hidden justify-center sm:flex">
          <div
            role="tablist"
            aria-label="Dashboard views"
            className="inline-flex w-full max-w-lg gap-1.5 rounded-2xl border border-[var(--card-border)] bg-white/[0.03] p-1.5 backdrop-blur"
          >
            {VIEW_TABS.map((tab) => {
              const active = activeView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-tour={`view-tab-${tab.id}`}
                  onClick={() => setActiveView(tab.id)}
                  className={`group ${viewTabClass(active, "inline")}`}
                >
                  {active ? (
                    <motion.span
                      layoutId="viewTabIndicator"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-xl border border-[var(--accent-cyan)]/35 bg-gradient-to-br from-[var(--accent-cyan)]/16 to-[var(--accent-cyan-2)]/6 shadow-[0_0_28px_-10px_var(--accent-cyan-glow)]"
                    />
                  ) : null}
                  <span className={`relative ${viewTabIconClass(active, "inline")}`}>
                    <tab.Icon className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <span className="relative min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-tight">{tab.label}</span>
                    <span
                      className={`mt-0.5 block text-xs leading-snug ${
                        active ? "text-white/55" : "text-white/35 group-hover:text-white/50"
                      }`}
                    >
                      {tab.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <p className="mb-5 hidden text-center text-xs leading-relaxed text-[var(--text-secondary)] sm:mb-6 sm:block">
          {activeView === "track"
            ? "Record timers, tasks, and notes for today."
            : "Review charts, streaks, and your recent history."}
        </p>

        {activeView === "track" ? (
        <>
        {settingsEnabled && settings ? (
          <div data-tour="daily-goal">
            <DailyGoalProgress
              totalSeconds={stats.todayTotalSecs}
              goalMinutes={settings.dailyGoalMinutes}
            />
          </div>
        ) : null}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-4 flex justify-center sm:mb-5">
            <div className="flex w-full max-w-sm flex-col items-center gap-1 rounded-2xl border border-[var(--card-border)] bg-white/5 px-4 py-3 backdrop-blur sm:w-auto sm:max-w-none sm:flex-row sm:gap-2.5 sm:rounded-full sm:px-5 sm:py-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--accent-cyan)]" />
                <span className="text-sm text-[var(--text-secondary)]">Total today</span>
              </div>
              <span className="text-2xl font-bold tabular-nums text-gradient-cyan sm:text-lg">
                {formatClock(stats.todayTotalSecs)}
              </span>
            </div>
          </div>
          <DailyPlansSection
            plans={todayPlans}
            dateKey={todayKey}
            busy={busy}
            inputClass={inputClass}
            nowMs={nowMs}
            workSeconds={liveSeconds(runningDay ?? today, nowMs, todayKey)}
            deenSeconds={deenLiveSeconds(runningDeenDay ?? today, nowMs, todayKey)}
            fitnessSeconds={fitnessLiveSeconds(runningFitnessDay ?? today, nowMs, todayKey)}
            workTimerRunning={timerRunning}
            deenTimerRunning={deenTimerRunning}
            fitnessTimerRunning={fitnessTimerRunning}
            workSessionSecs={runningSessionSecs}
            deenSessionSecs={deenRunningSessionSecs}
            fitnessSessionSecs={fitnessRunningSessionSecs}
            workSessionDateKey={runningDay?.dateKey}
            deenSessionDateKey={runningDeenDay?.dateKey}
            fitnessSessionDateKey={runningFitnessDay?.dateKey}
            azkarMorningSeconds={today.azkarMorningSeconds ?? 0}
            azkarEveningSeconds={today.azkarEveningSeconds ?? 0}
            personId={activePersonId}
            onPatch={patchDayForPlans}
          />
        </motion.div>

        {settingsEnabled && settings ? (
          <div data-tour="templates">
            <TaskTemplatesPanel
              templates={settings.taskTemplates}
              isTemplateAdded={isTemplateAdded}
              busy={busy}
              onApply={applyTemplate}
              onApplyAll={applyAllTemplates}
            />
          </div>
        ) : null}

        <motion.section
          data-tour="notes"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card rounded-2xl p-4 mb-5 sm:p-6 sm:mb-6"
        >
          <p className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-[var(--accent-cyan)]" />
            Notes for today
          </p>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Write anything you want to remember — wins, reminders, or how the day went.
          </p>
          <textarea
            value={notesDraft}
            onChange={(e) => {
              setNotesDraft(e.target.value);
              setNotesDirty(true);
            }}
            rows={3}
            maxLength={5000}
            placeholder="e.g. Finished the project proposal, need to follow up tomorrow…"
            className={`${inputClass} resize-y text-base`}
          />
          {notesDirty ? (
            <button
              type="button"
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-3 w-full rounded-xl border border-[var(--accent-cyan)]/40 py-3 text-base font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 disabled:opacity-50 sm:mt-2 sm:w-auto sm:rounded-md sm:px-4 sm:py-2 sm:text-sm"
            >
              {savingNotes ? "Saving…" : "Save notes"}
            </button>
          ) : null}
        </motion.section>
        </>
        ) : (
        <>
        {/* Stats row */}
        <div data-tour="stats" className="grid grid-cols-2 gap-3 mb-5 sm:gap-4 sm:mb-6 lg:grid-cols-5">
          {[
            {
              label: "Today",
              value: formatDuration(stats.todayTotalSecs),
              sub: stats.todayTimeSuspicious
                ? `Looks high for today — check hours vs minutes in each area`
                : `${formatDuration(stats.todayWorkSecs)} work · ${formatDuration(stats.todayDeenSecs)} deen · ${formatDuration(stats.todayFitnessSecs)} fitness`,
              Icon: Clock,
              tint: stats.todayTimeSuspicious ? "#fbbf24" : "var(--accent-cyan)",
            },
            { label: "This week", value: formatDuration(stats.weekSecs), Icon: CalendarDays, tint: "#22d3ee" },
            {
              label: "This month",
              value: formatDuration(stats.monthSecs),
              sub: "View monthly target →",
              Icon: ListChecks,
              tint: "#a78bfa",
              href: "/monthly-targets",
            },
            {
              label: "Streak",
              value: `${stats.streak} ${stats.streak === 1 ? "day" : "days"}`,
              sub: stats.streak > 0 ? "Keep it going! 🔥" : "Log time today to start",
              Icon: Flame,
              tint: "#fb923c",
            },
            {
              label: "Tasks completed",
              value: `${stats.taskCompletion}%`,
              sub: stats.avgDaily > 0 ? `~${stats.avgDaily}h on active days` : "Add tasks to track progress",
              Icon: TrendingUp,
              tint: "#34d399",
            },
          ].map((s, i) => {
            const card = (
              <>
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px opacity-60"
                  style={{ background: `linear-gradient(90deg, transparent, ${s.tint}, transparent)` }}
                />
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-transform group-hover:scale-110"
                    style={{
                      color: s.tint,
                      borderColor: `${s.tint}40`,
                      background: `${s.tint}1a`,
                    }}
                  >
                    <s.Icon className="h-4 w-4" />
                  </span>
                  <p className="text-xs font-medium text-[var(--text-secondary)]">{s.label}</p>
                </div>
                <p className="mt-2 text-xl font-bold tabular-nums text-white sm:text-2xl">{s.value}</p>
                {"sub" in s && s.sub ? (
                  <p className="mt-1 text-[10px] leading-snug text-[var(--text-secondary)] sm:text-[11px]">{s.sub}</p>
                ) : null}
              </>
            );

            const className = `group glass-card relative overflow-hidden rounded-2xl p-4 sm:p-5 min-w-0 ${
              i === 4 ? "col-span-2 lg:col-span-1" : ""
            }${"href" in s && s.href ? " cursor-pointer transition-shadow hover:shadow-[0_0_30px_-8px_rgba(167,139,250,0.35)]" : ""}`;

            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                whileHover={{ y: -4 }}
                className={className}
              >
                {"href" in s && s.href ? (
                  <Link
                    href={s.href}
                    className="absolute inset-0 z-10 rounded-2xl"
                    aria-label={`${s.label}: ${s.value}`}
                  />
                ) : null}
                {card}
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="mb-5 grid gap-3 sm:mb-6 sm:grid-cols-2 sm:gap-4"
        >
          <Link
            href="/monthly-targets"
            className="group flex items-center gap-4 rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-500/10 via-[var(--accent-cyan)]/5 to-transparent p-4 transition-all hover:border-violet-400/45 hover:shadow-[0_0_40px_-12px_rgba(167,139,250,0.4)] sm:p-5"
          >
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-400/35 bg-violet-400/10 text-violet-300 transition-transform group-hover:scale-105">
              <Target className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white sm:text-base">Monthly targets</p>
              <p className="text-xs text-[var(--text-secondary)] sm:text-sm">
                Set a goal, track your pace, and see your activity heatmap
              </p>
            </div>
            <span className="hidden text-sm font-semibold text-[var(--accent-cyan)] sm:inline group-hover:underline">
              Open →
            </span>
          </Link>
          <Link
            href="/yearly-targets"
            className="group flex items-center gap-4 rounded-2xl border border-violet-400/25 bg-gradient-to-r from-violet-500/10 via-[var(--accent-cyan)]/5 to-transparent p-4 transition-all hover:border-violet-400/45 hover:shadow-[0_0_40px_-12px_rgba(167,139,250,0.4)] sm:p-5"
          >
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-400/35 bg-violet-400/10 text-violet-300 transition-transform group-hover:scale-105">
              <CalendarRange className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white sm:text-base">Yearly plans</p>
              <p className="text-xs text-[var(--text-secondary)] sm:text-sm">
                Annual goals, quarterly breakdown, and month-by-month progress
              </p>
            </div>
            <span className="hidden text-sm font-semibold text-[var(--accent-cyan)] sm:inline group-hover:underline">
              Open →
            </span>
          </Link>
        </motion.div>

        <YearlyContributionChart
          days={days as import("@/lib/admin-work-log").SerializedWorkLogDay[]}
          nowMs={nowMs}
          className="mb-5 sm:mb-6"
        />

        {/* Chart */}
        <motion.section
          data-tour="chart"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-2xl p-4 mb-5 sm:p-6 sm:mb-6"
        >
          <h2 className="flex items-center gap-2 text-base font-bold text-white mb-1 sm:text-lg">
            <BarChart3 className="h-5 w-5 text-[var(--accent-cyan)]" />
            Your last 14 days
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Each bar shows how many hours you logged — split by Work, Deen, and Fitness.
          </p>
          <div className="h-56 sm:h-64 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.06)" }}
                  contentStyle={{
                    background: "#0b1414",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    color: "#fff",
                  }}
                  formatter={(value: number | string, name: string) => {
                    const labels: Record<string, string> = {
                      business: "Business",
                      deen: "Deen",
                      fitness: "Fitness",
                      total: "Total",
                    };
                    return [`${value} h`, labels[name] ?? name];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.7)", paddingTop: 8 }}
                  iconSize={10}
                  formatter={(value) =>
                    value === "business"
                      ? "Business"
                      : value === "deen"
                        ? "Deen"
                        : value === "fitness"
                          ? "Fitness"
                          : "Total"
                  }
                />
                <Bar
                  dataKey="business"
                  stackId="time"
                  fill={WORK_LOG_AREA_COLORS.work.color}
                  radius={[0, 0, 0, 0]}
                  name="business"
                />
                <Bar
                  dataKey="deen"
                  stackId="time"
                  fill={WORK_LOG_AREA_COLORS.deen.color}
                  radius={[0, 0, 0, 0]}
                  name="deen"
                />
                <Bar
                  dataKey="fitness"
                  stackId="time"
                  fill={WORK_LOG_AREA_COLORS.fitness.color}
                  radius={[4, 4, 0, 0]}
                  name="fitness"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
            <span>
              14-day total:{" "}
              <strong className="text-white">
                {chartData.reduce((s, d) => s + d.total, 0).toFixed(1)}h
              </strong>
            </span>
            <span>
              Best day:{" "}
              <strong className="text-white">
                {chartData.length
                  ? `${Math.max(...chartData.map((d) => d.total)).toFixed(1)}h`
                  : "—"}
              </strong>
            </span>
            <span>
              Avg active day:{" "}
              <strong className="text-white">{stats.avgDaily > 0 ? `${stats.avgDaily}h` : "—"}</strong>
            </span>
          </div>
        </motion.section>

        {/* History */}
        <motion.section
          data-tour="history"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card rounded-2xl p-4 sm:p-6"
        >
          <h2 className="flex items-center gap-2 text-base font-bold text-white mb-1 sm:text-lg">
            <CalendarDays className="h-5 w-5 text-[var(--accent-cyan)]" />
            Past days
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Tap any day to see what you logged and which tasks you completed.
          </p>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-cyan)]" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] py-6 text-center">
              No previous days yet — your history will appear here.
            </p>
          ) : (
            <ul className="space-y-3">
              {history.map((day) => {
                const expanded = expandedDay === day.dateKey;
                const dayPlans = resolveClientPlans(day);
                const allSubs = dayPlans.flatMap((p) => p.subTasks);
                const doneCount = allSubs.filter((t) => t.done).length;
                return (
                  <li
                    key={day.dateKey}
                    className="rounded-xl border border-[var(--card-border)] bg-white/5 transition-colors hover:border-[var(--accent-cyan)]/30 hover:bg-white/[0.07]"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedDay(expanded ? null : day.dateKey)}
                      className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left"
                    >
                      <span className="font-semibold text-white">{formatDayLabel(day.dateKey)}</span>
                      <span className="text-sm text-[var(--accent-cyan)] font-bold tabular-nums">
                        {formatDuration(totalLiveSeconds(day, nowMs))}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        ({formatDuration(liveSeconds(day, nowMs))} +{" "}
                        {formatDuration(deenLiveSeconds(day, nowMs))} +{" "}
                        {formatDuration(fitnessLiveSeconds(day, nowMs))})
                      </span>
                      {day.timerStartedAt ? (
                        <span className="text-xs rounded-full border border-[var(--accent-cyan)]/35 bg-[var(--accent-cyan)]/10 px-2 py-0.5 font-semibold text-[var(--accent-cyan)]">
                          timer running
                        </span>
                      ) : null}
                      <span className="text-xs text-[var(--text-secondary)]">
                        {doneCount}/{allSubs.length} sub-tasks done · {dayPlans.length} plans
                      </span>
                      <span className="ml-auto text-[var(--text-secondary)]">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>

                    {expanded ? (
                      <div className="border-t border-[var(--card-border)] px-4 py-3 space-y-4">
                        <HistoryDayTimeEditor
                          day={day}
                          nowMs={nowMs}
                          busy={busy}
                          adjustH={historyAdjustH}
                          adjustM={historyAdjustM}
                          onAdjustHChange={(key, value) =>
                            setHistoryAdjustH((s) => ({ ...s, [key]: value }))
                          }
                          onAdjustMChange={(key, value) =>
                            setHistoryAdjustM((s) => ({ ...s, [key]: value }))
                          }
                          onApply={applyHistoryTimeAdjust}
                        />
                        {dayPlans.map((plan) => (
                          <div key={plan.id}>
                            <p
                              className="text-xs uppercase tracking-wider mb-1.5 font-semibold"
                              style={{ color: workLogAreaColorForKind(plan.kind) }}
                            >
                              {plan.title}
                            </p>
                            {plan.subTasks.length === 0 ? (
                              <p className="text-sm text-[var(--text-secondary)]">No sub-tasks.</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {sortByPriority(plan.subTasks).map((t) => (
                                  <li key={t.id} className="flex items-center gap-2 text-sm">
                                    {t.done ? (
                                      <CheckCircle2
                                        className="w-4 h-4 shrink-0"
                                        style={{ color: workLogAreaColorForKind(plan.kind) }}
                                      />
                                    ) : (
                                      <Circle className="w-4 h-4 shrink-0 text-[var(--text-secondary)]" />
                                    )}
                                    <span
                                      className={
                                        t.done ? "text-[var(--text-secondary)] line-through" : "text-white/90"
                                      }
                                    >
                                      {t.text}
                                    </span>
                                    <EstimateBadge minutes={t.estimateMinutes} />
                                    <PriorityBadge priority={t.priority ?? "medium"} />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                        {day.notes ? (
                          <p className="mt-3 text-sm text-[var(--text-secondary)] border-t border-[var(--card-border)] pt-3">
                            <span className="text-white/70 font-medium">Notes: </span>
                            {day.notes}
                          </p>
                        ) : null}
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => deleteDay(day.dateKey)}
                            className="inline-flex items-center gap-1.5 rounded border border-red-400/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-400/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete day
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </motion.section>
        </>
        )}
      </div>

      {/* Mobile bottom navigation — thumb-friendly view switch */}
      <nav
        aria-label="Main sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--card-border)] bg-[var(--card-bg)]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom,0px)] sm:hidden"
      >
        <div role="tablist" className="grid grid-cols-2 gap-1 p-2">
          {VIEW_TABS.map((tab) => {
            const active = activeView === tab.id;
            return (
              <button
                key={`mobile-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                data-tour={tab.id === "track" ? "view-tab-track" : tab.id === "insights" ? "view-tab-insights" : undefined}
                onClick={() => setActiveView(tab.id)}
                className={viewTabClass(active, "bottom")}
              >
                {active ? (
                  <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-[var(--accent-cyan)] shadow-[0_0_8px_var(--accent-cyan-glow)]" />
                ) : null}
                <tab.Icon className={`h-5 w-5 ${viewTabIconClass(active, "bottom")}`} strokeWidth={2.25} />
                <span className="text-xs font-semibold">{tab.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
