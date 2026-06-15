"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Flame,
  ListChecks,
  Loader2,
  StickyNote,
  Trash2,
  TrendingUp,
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
  WorkLogSettingsModal,
  type WorkLogSettings,
} from "@/components/work-log/work-log-extras";
import { DailyPlansSection } from "@/components/work-log/work-log-daily-plans";
import {
  createDefaultPlans,
  DEFAULT_DEEN_PLAN_ID,
  DEFAULT_WORK_PLAN_ID,
  serializePlan,
  type SerializedWorkLogPlan,
} from "@/lib/work-log-plans";
import { PRIMARY_PERSON_ID } from "@/lib/user-work-log-settings";

export type WorkLogDashboardProps = {
  apiBase: string;
  authorizedInit: (init?: RequestInit) => RequestInit;
  backHref: string;
  backLabel: string;
  title?: string;
  subtitle?: string;
  userEmail?: string;
  userName?: string;
  onLogout?: () => void;
  /** When set, enables people profiles, saved tasks, and daily goals. */
  settingsApiBase?: string;
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
      title: "Ilme Deen",
      priority: "high",
      estimateMinutes: null,
      order: 1,
      subTasks: day.deenTasks ?? [],
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
    notes: "",
  };
}

/** Live worked seconds for a day, including the running timer if any. */
function liveSeconds(day: WorkLogDay | undefined, nowMs: number): number {
  if (!day) return 0;
  let secs = (day.totalMinutes ?? 0) * 60;
  if (day.timerStartedAt) {
    secs += Math.max(0, (nowMs - new Date(day.timerStartedAt).getTime()) / 1000);
  }
  return Math.floor(secs);
}

/** Live Ilme Deen seconds for a day, including the running deen timer if any. */
function deenLiveSeconds(day: WorkLogDay | undefined, nowMs: number): number {
  if (!day) return 0;
  let secs = (day.deenMinutes ?? 0) * 60;
  if (day.deenTimerStartedAt) {
    secs += Math.max(0, (nowMs - new Date(day.deenTimerStartedAt).getTime()) / 1000);
  }
  return Math.floor(secs);
}

/** Combined business + Ilme Deen time for a day. */
function totalLiveSeconds(day: WorkLogDay | undefined, nowMs: number): number {
  return liveSeconds(day, nowMs) + deenLiveSeconds(day, nowMs);
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

export function WorkLogDashboard({
  apiBase,
  authorizedInit,
  backHref,
  backLabel,
  title = "Work Log",
  subtitle = "Daily working time & completed tasks",
  userEmail,
  userName,
  onLogout,
  settingsApiBase,
}: WorkLogDashboardProps) {
  const router = useRouter();
  const settingsEnabled = Boolean(settingsApiBase);

  const [days, setDays] = useState<WorkLogDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activePersonId, setActivePersonId] = useState(PRIMARY_PERSON_ID);
  const [settings, setSettings] = useState<WorkLogSettings | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [notesDraft, setNotesDraft] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const mergeDay = useCallback((day: WorkLogDay) => {
    setDays((prev) => {
      const rest = prev.filter((d) => d.dateKey !== day.dateKey);
      return [...rest, day].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
    });
  }, []);

  const load = useCallback(async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const personQuery = settingsEnabled
        ? `?personId=${encodeURIComponent(activePersonId)}`
        : "";
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
      setDays(rows);
    } catch {
      setDays([]);
      setErrorMsg("Failed to load work log.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authorizedInit, activePersonId, settingsEnabled]);

  const loadSettings = useCallback(async () => {
    if (!settingsApiBase) return;
    try {
      const res = await fetch(settingsApiBase, authorizedInit());
      const data = await res.json().catch(() => null);
      if (res.ok && data && typeof data === "object" && "settings" in data) {
        setSettings((data as { settings: WorkLogSettings }).settings);
      }
    } catch {
      // Settings are optional enhancement.
    }
  }, [settingsApiBase, authorizedInit]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
    [apiBase, authorizedInit, mergeDay, activePersonId, settingsEnabled]
  );

  const todayPlans = useMemo(() => resolveClientPlans(today), [today]);

  const patchDayForPlans = useCallback(
    (body: Record<string, unknown>) => patchDay(todayKey, body),
    [patchDay, todayKey]
  );

  const patchSettings = useCallback(
    async (body: Record<string, unknown>) => {
      if (!settingsApiBase) return false;
      setBusy(true);
      try {
        const res = await fetch(
          settingsApiBase,
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
              : "Settings update failed"
          );
          return false;
        }
        if (data && typeof data === "object" && "settings" in data) {
          setSettings((data as { settings: WorkLogSettings }).settings);
        }
        return true;
      } catch {
        setErrorMsg("Settings update failed.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [settingsApiBase, authorizedInit]
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

  const applyTemplate = async (template: {
    text: string;
    priority: WorkLogPriority;
    estimateMinutes: number | null;
    list: "work" | "deen";
  }) => {
    await patchDay(todayKey, {
      action: "addTask",
      text: template.text,
      priority: template.priority,
      estimateMinutes: template.estimateMinutes,
      list: template.list === "deen" ? "deen" : undefined,
    });
  };

  const applyAllTemplates = async () => {
    if (!settings?.taskTemplates.length) return;
    for (const t of settings.taskTemplates) {
      if (!todayTaskTexts.has(t.text.trim().toLowerCase())) {
        await applyTemplate(t);
      }
    }
  };

  const todayTaskTexts = useMemo(() => {
    const texts = new Set<string>();
    for (const plan of todayPlans) {
      for (const t of plan.subTasks) texts.add(t.text.trim().toLowerCase());
    }
    return texts;
  }, [todayPlans]);

  const activePerson = settings?.people.find((p) => p.id === activePersonId);

  const stats = useMemo(() => {
    const byKey = new Map(days.map((d) => [d.dateKey, d]));
    const now = new Date(nowMs);

    const todayTotalSecs = totalLiveSeconds(byKey.get(todayKey), nowMs);
    const todayWorkSecs = liveSeconds(byKey.get(todayKey), nowMs);
    const todayDeenSecs = deenLiveSeconds(byKey.get(todayKey), nowMs);

    let weekSecs = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      weekSecs += totalLiveSeconds(byKey.get(localDateKey(d)), nowMs);
    }

    const monthPrefix = todayKey.slice(0, 7);
    let monthSecs = 0;
    for (const d of days) {
      if (d.dateKey.startsWith(monthPrefix)) monthSecs += totalLiveSeconds(d, nowMs);
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

    return {
      todayTotalSecs,
      todayWorkSecs,
      todayDeenSecs,
      weekSecs,
      monthSecs,
      streak,
      taskCompletion,
      avgDaily,
    };
  }, [days, nowMs, todayKey, todayPlans]);

  const chartData = useMemo(() => {
    const byKey = new Map(days.map((d) => [d.dateKey, d]));
    const now = new Date(nowMs);
    const out: {
      label: string;
      business: number;
      deen: number;
      total: number;
    }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = localDateKey(d);
      const day = byKey.get(key);
      const business = Math.round((liveSeconds(day, nowMs) / 3600) * 10) / 10;
      const deen = Math.round((deenLiveSeconds(day, nowMs) / 3600) * 10) / 10;
      out.push({
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        business,
        deen,
        total: Math.round((business + deen) * 10) / 10,
      });
    }
    return out;
  }, [days, nowMs]);

  const history = useMemo(
    () => days.filter((d) => d.dateKey !== todayKey),
    [days, todayKey]
  );

  const runningSessionSecs = runningDay?.timerStartedAt
    ? Math.max(0, Math.floor((nowMs - new Date(runningDay.timerStartedAt).getTime()) / 1000))
    : 0;

  const deenRunningSessionSecs = runningDeenDay?.deenTimerStartedAt
    ? Math.max(
        0,
        Math.floor((nowMs - new Date(runningDeenDay.deenTimerStartedAt).getTime()) / 1000)
      )
    : 0;

  const inputClass =
    "w-full px-4 py-2.5 bg-white/5 border border-[var(--card-border)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35";

  if (loading && days.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-gradient)" }}>
        <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-cyan)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white pt-24 pb-16" style={{ background: "var(--bg-gradient)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8"
        >
          <div>
            <button
              type="button"
              onClick={() => router.push(backHref)}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-white mb-3"
            >
              <ArrowLeft className="w-4 h-4" />
              {backLabel}
            </button>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-[var(--accent-cyan)] to-teal-300 bg-clip-text text-transparent">
              {title}
            </h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">
              {formatDayLabel(todayKey)} · {subtitle}
              {activePerson ? (
                <span className="text-white/80"> · tracking {activePerson.name}</span>
              ) : null}
            </p>
          </div>
          {userEmail || onLogout ? (
            <div className="flex items-center gap-3">
              {userEmail ? (
                <p className="text-sm text-[var(--text-secondary)]">{userEmail}</p>
              ) : null}
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-md border border-[var(--card-border)] bg-white/5 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
                >
                  Sign out
                </button>
              ) : null}
            </div>
          ) : null}
        </motion.div>

        {errorMsg ? (
          <p className="mb-6 rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            {errorMsg}
          </p>
        ) : null}

        {settingsEnabled && settings ? (
          <PersonTabs
            people={settings.people}
            activePersonId={activePersonId}
            onSelect={setActivePersonId}
            onManage={() => setShowSettingsModal(true)}
          />
        ) : null}

        {settingsEnabled && settings ? (
          <DailyGoalProgress
            totalSeconds={stats.todayTotalSecs}
            goalMinutes={settings.dailyGoalMinutes}
            onEditGoal={() => setShowSettingsModal(true)}
          />
        ) : null}

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            {
              label: "Today (total)",
              value: formatDuration(stats.todayTotalSecs),
              sub: `${formatDuration(stats.todayWorkSecs)} work · ${formatDuration(stats.todayDeenSecs)} deen`,
              Icon: Clock,
            },
            { label: "Last 7 days", value: formatDuration(stats.weekSecs), Icon: CalendarDays },
            { label: "This month", value: formatDuration(stats.monthSecs), Icon: ListChecks },
            {
              label: "Day streak",
              value: `${stats.streak} ${stats.streak === 1 ? "day" : "days"}`,
              Icon: Flame,
            },
            {
              label: "Tasks done",
              value: `${stats.taskCompletion}%`,
              sub: stats.avgDaily > 0 ? `~${stats.avgDaily}h avg active day` : undefined,
              Icon: TrendingUp,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-[var(--card-bg)]/80 border border-[var(--card-border)] rounded-xl p-5"
            >
              <div className="flex items-center gap-2">
                <s.Icon className="w-4 h-4 text-[var(--accent-cyan)]" />
                <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">{s.label}</p>
              </div>
              <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
              {"sub" in s && s.sub ? (
                <p className="text-[11px] text-[var(--text-secondary)] mt-1">{s.sub}</p>
              ) : null}
            </div>
          ))}
        </div>

        {settingsEnabled && settings ? (
          <TaskTemplatesPanel
            templates={settings.taskTemplates}
            todayTaskTexts={todayTaskTexts}
            busy={busy}
            onApply={applyTemplate}
            onApplyAll={applyAllTemplates}
            onManage={() => setShowSettingsModal(true)}
          />
        ) : null}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-center text-sm text-[var(--text-secondary)] mb-4">
            Combined time today:{" "}
            <span className="font-bold text-white tabular-nums">
              {formatClock(stats.todayTotalSecs)}
            </span>
          </p>
          <DailyPlansSection
            plans={todayPlans}
            dateKey={todayKey}
            busy={busy}
            inputClass={inputClass}
            nowMs={nowMs}
            workSeconds={liveSeconds(today, nowMs)}
            deenSeconds={deenLiveSeconds(today, nowMs)}
            workTimerRunning={timerRunning}
            deenTimerRunning={deenTimerRunning}
            workSessionSecs={runningSessionSecs}
            deenSessionSecs={deenRunningSessionSecs}
            onPatch={patchDayForPlans}
          />
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-[var(--card-bg)]/90 border border-[var(--card-border)] rounded-xl p-6 mb-6"
        >
          <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" />
            Day notes
          </p>
          <textarea
            value={notesDraft}
            onChange={(e) => {
              setNotesDraft(e.target.value);
              setNotesDirty(true);
            }}
            rows={3}
            maxLength={5000}
            placeholder="Anything worth remembering about today…"
            className={`${inputClass} resize-y`}
          />
          {notesDirty ? (
            <button
              type="button"
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-2 rounded-md border border-[var(--accent-cyan)]/40 px-4 py-2 text-sm font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 disabled:opacity-50"
            >
              {savingNotes ? "Saving…" : "Save notes"}
            </button>
          ) : null}
        </motion.section>

        {/* Chart */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[var(--card-bg)]/90 border border-[var(--card-border)] rounded-xl p-6 mb-6"
        >
          <h2 className="text-lg font-bold text-white mb-1">Hours per day — last 14 days</h2>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Stacked bars show business + Ilme Deen combined — your full logged time each day.
          </p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={false}
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
                      deen: "Ilme Deen",
                      total: "Total",
                    };
                    return [`${value} h`, labels[name] ?? name];
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}
                  formatter={(value) =>
                    value === "business" ? "Business" : value === "deen" ? "Ilme Deen" : "Total"
                  }
                />
                <Bar
                  dataKey="business"
                  stackId="time"
                  fill="var(--accent-cyan)"
                  radius={[0, 0, 0, 0]}
                  name="business"
                />
                <Bar
                  dataKey="deen"
                  stackId="time"
                  fill="#34d399"
                  radius={[4, 4, 0, 0]}
                  name="deen"
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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-[var(--card-bg)]/90 border border-[var(--card-border)] rounded-xl p-6"
        >
          <h2 className="text-lg font-bold text-white mb-4">History</h2>

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
                    className="rounded-lg border border-[var(--card-border)] bg-white/5"
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
                        {formatDuration(deenLiveSeconds(day, nowMs))})
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
                        {dayPlans.map((plan) => (
                          <div key={plan.id}>
                            <p
                              className={`text-xs uppercase tracking-wider mb-1.5 font-semibold ${
                                plan.kind === "deen" ? "text-emerald-300" : "text-[var(--accent-cyan)]"
                              }`}
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
                                        className={`w-4 h-4 shrink-0 ${
                                          plan.kind === "deen" ? "text-emerald-300" : "text-[var(--accent-cyan)]"
                                        }`}
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
      </div>

      {showSettingsModal && settings ? (
        <WorkLogSettingsModal
          settings={settings}
          busy={busy}
          onClose={() => setShowSettingsModal(false)}
          onPatch={patchSettings}
        />
      ) : null}
    </div>
  );
}
