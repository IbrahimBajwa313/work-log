"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CheckCircle2,
  Circle,
  Clock,
  Dumbbell,
  Moon,
  Pause,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { AZKAR_EVENING_TASK_ID, AZKAR_MORNING_TASK_ID } from "@/lib/azkar";
import {
  DEFAULT_DEEN_PLAN_ID,
  DEFAULT_FITNESS_PLAN_ID,
  DEFAULT_WORK_PLAN_ID,
  type SerializedWorkLogPlan,
} from "@/lib/work-log-plans";
import {
  confirmTimeAdjustment,
  formatMinutesLabel,
  loggedTimeLooksImpossible,
  minutesSinceMidnight,
  validateTimeAdjustment,
} from "@/lib/work-log-time-guards";

type WorkLogPriority = "high" | "medium" | "low";

type WorkLogSubTask = SerializedWorkLogPlan["subTasks"][number];

const PRIORITY_ORDER: Record<WorkLogPriority, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_STYLES: Record<WorkLogPriority, { label: string; className: string }> = {
  high: { label: "High", className: "border-red-400/40 bg-red-400/10 text-red-400" },
  medium: { label: "Med", className: "border-amber-400/40 bg-amber-400/10 text-amber-400" },
  low: { label: "Low", className: "border-sky-400/40 bg-sky-400/10 text-sky-400" },
};

function nextPriority(p: WorkLogPriority): WorkLogPriority {
  return p === "high" ? "medium" : p === "medium" ? "low" : "high";
}

function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatSpent(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe < 60) return `${safe}s`;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function sortByPriority<T extends { priority: WorkLogPriority }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => PRIORITY_ORDER[a.priority ?? "medium"] - PRIORITY_ORDER[b.priority ?? "medium"]
  );
}

const PRIORITY_ACCENT: Record<WorkLogPriority, string> = {
  high: "#f87171",
  medium: "#fbbf24",
  low: "#38bdf8",
};

function PriorityBadge({
  priority,
  onClick,
  compact = false,
}: {
  priority: WorkLogPriority;
  onClick?: () => void;
  compact?: boolean;
}) {
  const style = PRIORITY_STYLES[priority];
  const base = `shrink-0 rounded-full border font-bold uppercase tracking-wide ${style.className} ${
    compact ? "px-1.5 py-0 text-[9px] leading-5" : "px-2 py-0.5 text-[10px]"
  }`;
  if (!onClick) return <span className={base}>{style.label}</span>;
  return (
    <button type="button" onClick={onClick} className={`${base} hover:opacity-80`} title="Change priority">
      {style.label}
    </button>
  );
}

function EstimateBadge({ minutes, compact = false }: { minutes: number | null; compact?: boolean }) {
  if (!minutes) return null;
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-white/5 font-semibold text-[var(--text-secondary)] ${
        compact ? "px-1.5 py-0 text-[10px] leading-5" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      <Clock className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {formatEstimate(minutes)}
    </span>
  );
}

function SubTaskRow({
  task,
  accentColor,
  busy,
  editing,
  editText,
  onEditTextChange,
  onToggle,
  onSaveEdit,
  onStartEdit,
  onCyclePriority,
  onDelete,
}: {
  task: WorkLogSubTask;
  accentColor: string;
  busy: boolean;
  editing: boolean;
  editText: string;
  onEditTextChange: (value: string) => void;
  onToggle: () => void;
  onSaveEdit: () => void;
  onStartEdit: () => void;
  onCyclePriority: () => void;
  onDelete: () => void;
}) {
  const priorityColor = PRIORITY_ACCENT[task.priority ?? "medium"];

  return (
    <li
      className={`group rounded-xl border transition-colors ${
        task.done
          ? "border-[var(--card-border)]/60 bg-white/[0.02]"
          : "border-[var(--card-border)] bg-white/[0.04] hover:border-white/10 hover:bg-white/[0.06]"
      }`}
      style={{ borderLeftWidth: "3px", borderLeftColor: task.done ? "transparent" : priorityColor }}
    >
      <div className="flex items-start gap-3 p-3.5 sm:p-3">
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className="touch-target shrink-0 -m-1.5 flex items-center justify-center rounded-full p-1.5 transition-colors hover:bg-white/5"
          aria-label={task.done ? "Mark task incomplete" : "Mark task complete"}
        >
          {task.done ? (
            <CheckCircle2 className="h-6 w-6 sm:h-5 sm:w-5" style={{ color: accentColor }} />
          ) : (
            <Circle className="h-6 w-6 text-white/35 transition-colors group-hover:text-white/55 sm:h-5 sm:w-5" />
          )}
        </button>

        <div className="min-w-0 flex-1 pt-0.5">
          {editing ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={editText}
                onChange={(e) => onEditTextChange(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm text-white"
                autoFocus
              />
              <button
                type="button"
                onClick={onSaveEdit}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold"
                style={{ color: accentColor }}
              >
                Save
              </button>
            </div>
          ) : (
            <p
              className={`text-[15px] leading-snug sm:text-sm ${
                task.done ? "text-[var(--text-secondary)] line-through decoration-white/20" : "text-white"
              }`}
            >
              {task.text}
            </p>
          )}

          {!editing ? (
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <EstimateBadge minutes={task.estimateMinutes} compact />
                <PriorityBadge priority={task.priority} onClick={onCyclePriority} compact />
              </div>
              <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-[var(--card-border)]/80 bg-black/20 p-0.5">
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="touch-target flex items-center justify-center rounded-md p-2 text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-white sm:p-1.5"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDelete}
                  className="touch-target flex items-center justify-center rounded-md p-2 text-red-400/60 transition-colors hover:bg-red-400/10 hover:text-red-400 sm:p-1.5"
                  aria-label="Delete task"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export type DailyPlansSectionProps = {
  plans: SerializedWorkLogPlan[];
  dateKey: string;
  busy: boolean;
  inputClass: string;
  nowMs: number;
  workSeconds: number;
  deenSeconds: number;
  fitnessSeconds: number;
  workTimerRunning: boolean;
  deenTimerRunning: boolean;
  fitnessTimerRunning: boolean;
  workSessionSecs: number;
  deenSessionSecs: number;
  fitnessSessionSecs: number;
  workSessionDateKey?: string | null;
  deenSessionDateKey?: string | null;
  fitnessSessionDateKey?: string | null;
  azkarMorningSeconds?: number;
  azkarEveningSeconds?: number;
  personId?: string;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
};

export function DailyPlansSection({
  plans,
  dateKey,
  busy,
  inputClass,
  nowMs,
  workSeconds,
  deenSeconds,
  fitnessSeconds,
  workTimerRunning,
  deenTimerRunning,
  fitnessTimerRunning,
  workSessionSecs,
  deenSessionSecs,
  fitnessSessionSecs,
  workSessionDateKey,
  deenSessionDateKey,
  fitnessSessionDateKey,
  azkarMorningSeconds = 0,
  azkarEveningSeconds = 0,
  personId = "primary",
  onPatch,
}: DailyPlansSectionProps) {
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_WORK_PLAN_ID);

  // Open a specific tab when returning from a deep link (e.g. /?tab=deen).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "work") setActiveTabId(DEFAULT_WORK_PLAN_ID);
    else if (tab === "deen") setActiveTabId(DEFAULT_DEEN_PLAN_ID);
    else if (tab === "fitness") setActiveTabId(DEFAULT_FITNESS_PLAN_ID);
  }, []);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editPlanTitle, setEditPlanTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskText, setEditTaskText] = useState("");
  const [newSubTask, setNewSubTask] = useState<Record<string, string>>({});
  const [newSubPriority, setNewSubPriority] = useState<Record<string, WorkLogPriority>>({});
  const [newSubEstH, setNewSubEstH] = useState<Record<string, string>>({});
  const [newSubEstM, setNewSubEstM] = useState<Record<string, string>>({});
  const [adjustHours, setAdjustHours] = useState<Record<string, string>>({});
  const [adjustMins, setAdjustMins] = useState<Record<string, string>>({});

  const sortedPlans = [...plans].sort((a, b) => a.order - b.order);
  const coreRank: Record<string, number> = { work: 0, deen: 1, fitness: 2 };
  const corePlans = sortedPlans
    .filter((p) => p.kind === "work" || p.kind === "deen" || p.kind === "fitness")
    .sort((a, b) => (coreRank[a.kind] ?? 9) - (coreRank[b.kind] ?? 9));
  const customPlans = sortedPlans.filter((p) => p.kind === "custom");
  // Every plan (core + custom) is a tab; only the active plan is rendered below.
  const orderedPlans = [...corePlans, ...customPlans];
  const tabLabel = (plan: SerializedWorkLogPlan) =>
    plan.kind === "work"
      ? "Work"
      : plan.kind === "deen"
        ? "Deen"
        : plan.kind === "fitness"
          ? "Fitness"
          : plan.title;

  const tabIcon = (plan: SerializedWorkLogPlan) => {
    if (plan.kind === "work") return Briefcase;
    if (plan.kind === "deen") return Moon;
    if (plan.kind === "fitness") return Dumbbell;
    return Sparkles;
  };

  const tabHint = (plan: SerializedWorkLogPlan) => {
    if (plan.kind === "work") return "Your job & projects";
    if (plan.kind === "deen") return "Faith & worship";
    if (plan.kind === "fitness") return "Exercise & health";
    return "Custom plan";
  };
  const activePlan =
    orderedPlans.find((p) => p.id === activeTabId) ?? orderedPlans[0] ?? null;
  const plansToRender = activePlan ? [activePlan] : [];

  const timerListForPlan = (plan: SerializedWorkLogPlan): "work" | "deen" | "fitness" | null => {
    if (plan.kind === "work") return "work";
    if (plan.kind === "deen") return "deen";
    if (plan.kind === "fitness") return "fitness";
    return null;
  };

  const parseEst = (planId: string) => {
    const h = Number.parseInt(newSubEstH[planId] || "0", 10);
    const m = Number.parseInt(newSubEstM[planId] || "0", 10);
    return Number.isFinite(h) && Number.isFinite(m) && h * 60 + m > 0 ? h * 60 + m : null;
  };

  const planAccent = (plan: SerializedWorkLogPlan) => {
    if (plan.kind === "deen") {
      return { border: "border-emerald-400/25", icon: Moon, color: "#34d399", btn: "bg-emerald-400 text-[#06120c]" };
    }
    if (plan.kind === "fitness") {
      return { border: "border-orange-400/25", icon: Dumbbell, color: "#fb923c", btn: "bg-orange-400 text-[#140a06]" };
    }
    if (plan.kind === "work") {
      return { border: "border-[var(--card-border)]", icon: Briefcase, color: "var(--accent-cyan)", btn: "bg-[var(--accent-cyan)] text-[#070d0d]" };
    }
    return { border: "border-violet-400/25", icon: ListIcon, color: "#a78bfa", btn: "bg-violet-400 text-[#0d0614]" };
  };

  const addCustomPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newPlanTitle.trim();
    if (!title) return;
    const ok = await onPatch({ action: "addPlan", title, priority: "medium" });
    if (ok) setNewPlanTitle("");
  };

  const savePlanTitle = async (planId: string) => {
    const title = editPlanTitle.trim();
    if (!title) return;
    const ok = await onPatch({ action: "updatePlan", planId, title });
    if (ok) setEditingPlanId(null);
  };

  const addSubTask = async (e: React.FormEvent, planId: string) => {
    e.preventDefault();
    const text = (newSubTask[planId] || "").trim();
    if (!text) return;
    const ok = await onPatch({
      action: "addTask",
      planId,
      text,
      priority: newSubPriority[planId] ?? "medium",
      estimateMinutes: parseEst(planId),
    });
    if (ok) {
      setNewSubTask((s) => ({ ...s, [planId]: "" }));
      setNewSubEstH((s) => ({ ...s, [planId]: "" }));
      setNewSubEstM((s) => ({ ...s, [planId]: "" }));
    }
  };

  const saveSubTask = async (planId: string, taskId: string) => {
    const text = editTaskText.trim();
    if (!text) return;
    const ok = await onPatch({ action: "updateTask", planId, taskId, text });
    if (ok) setEditingTaskId(null);
  };

  const applyAdjust = async (plan: SerializedWorkLogPlan, mode: "add" | "set", sign: 1 | -1 = 1) => {
    const list = timerListForPlan(plan);
    if (!list) return;
    const h = Number.parseInt(adjustHours[plan.id] || "0", 10);
    const m = Number.parseInt(adjustMins[plan.id] || "0", 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    const currentMinutes = Math.floor(
      (list === "work" ? workSeconds : list === "deen" ? deenSeconds : fitnessSeconds) / 60
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
    const ok = await onPatch({
      action: "adjustMinutes",
      mode,
      minutes,
      list,
    });
    if (ok) {
      setAdjustHours((s) => ({ ...s, [plan.id]: "" }));
      setAdjustMins((s) => ({ ...s, [plan.id]: "" }));
    }
  };

  return (
    <section className="mb-5 space-y-4 sm:mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-white sm:text-lg">What are you working on today?</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Pick an area — each has its own timer and to-do list.
          </p>
        </div>
        <form onSubmit={addCustomPlan} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <input
            type="text"
            value={newPlanTitle}
            onChange={(e) => setNewPlanTitle(e.target.value)}
            placeholder="Add your own area…"
            maxLength={120}
            className={`${inputClass} w-full sm:w-48 md:w-56`}
          />
          <button
            type="submit"
            disabled={busy || !newPlanTitle.trim()}
            className="touch-target shrink-0 inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--card-border)] bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-50 sm:py-2"
          >
            <Plus className="w-4 h-4" />
            Add area
          </button>
        </form>
      </div>

      <div data-tour="plan-tabs" className="grid grid-cols-3 gap-1.5 rounded-xl border border-[var(--card-border)] bg-white/5 p-1.5 backdrop-blur sm:flex sm:flex-wrap sm:gap-1.5">
        {orderedPlans.map((plan) => {
          const TabIcon = tabIcon(plan);
          const active = activePlan?.id === plan.id;
          return (
          <button
            key={plan.id}
            type="button"
            data-tour={`plan-tab-${plan.kind === "custom" ? plan.id : plan.kind}`}
            onClick={() => setActiveTabId(plan.id)}
            className={`flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 px-1 text-center transition-all sm:min-w-[6rem] sm:px-2 sm:py-2.5 ${
              active
                ? "bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-cyan-2)] text-[#070d0d] shadow-[0_0_18px_-4px_var(--accent-cyan-glow)]"
                : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-white"
            }`}
            title={tabHint(plan)}
          >
            <TabIcon className={`h-5 w-5 sm:h-4 sm:w-4 ${active ? "text-[#070d0d]" : ""}`} />
            <span className="text-xs font-semibold truncate w-full sm:text-sm">{tabLabel(plan)}</span>
            <span className={`hidden text-[10px] truncate w-full sm:block ${active ? "text-[#070d0d]/70" : "text-white/35"}`}>
              {tabHint(plan)}
            </span>
          </button>
        );
        })}
      </div>

      {plansToRender.map((plan) => {
        const index = orderedPlans.findIndex((p) => p.id === plan.id);
        const accent = planAccent(plan);
        const Icon = accent.icon;
        const morningAzkar = plan.subTasks.find((t) => t.id === AZKAR_MORNING_TASK_ID);
        const eveningAzkar = plan.subTasks.find((t) => t.id === AZKAR_EVENING_TASK_ID);
        const regularSubTasks = plan.subTasks.filter(
          (t) => t.id !== AZKAR_MORNING_TASK_ID && t.id !== AZKAR_EVENING_TASK_ID
        );
        const doneRegular = regularSubTasks.filter((t) => t.done).length;
        const planned = regularSubTasks
          .filter((t) => !t.done)
          .reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0);
        const hasTimer = timerListForPlan(plan) !== null;
        const list = timerListForPlan(plan);
        const timerRunning =
          list === "work" ? workTimerRunning : list === "deen" ? deenTimerRunning : list === "fitness" ? fitnessTimerRunning : false;
        const liveSecs =
          list === "work" ? workSeconds : list === "deen" ? deenSeconds : list === "fitness" ? fitnessSeconds : 0;
        const sessionSecs =
          list === "work" ? workSessionSecs : list === "deen" ? deenSessionSecs : fitnessSessionSecs;
        const sessionDateKey =
          list === "work"
            ? workSessionDateKey
            : list === "deen"
              ? deenSessionDateKey
              : fitnessSessionDateKey;
        const sessionFromOtherDay =
          timerRunning && sessionDateKey && sessionDateKey !== dateKey;
        const isCore =
          plan.id === DEFAULT_WORK_PLAN_ID ||
          plan.id === DEFAULT_DEEN_PLAN_ID ||
          plan.id === DEFAULT_FITNESS_PLAN_ID;
        const azkarQuery = `date=${encodeURIComponent(dateKey)}&personId=${encodeURIComponent(personId)}`;

        return (
          <article
            key={plan.id}
            className={`relative overflow-hidden rounded-2xl border ${accent.border} bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-4 backdrop-blur shadow-[0_16px_44px_-26px_rgba(0,0,0,0.85)] transition-colors sm:p-6`}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px opacity-70"
              style={{ background: `linear-gradient(90deg, transparent, ${accent.color}, transparent)` }}
            />
            <div className="flex flex-wrap items-start gap-3 mb-4">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white/5"
                style={{ color: accent.color, borderColor: `${accent.color}40` }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[var(--text-secondary)]">#{index + 1}</span>
                  {editingPlanId === plan.id ? (
                    <div className="flex flex-1 gap-2 min-w-[200px]">
                      <input
                        type="text"
                        value={editPlanTitle}
                        onChange={(e) => setEditPlanTitle(e.target.value)}
                        className={`${inputClass} flex-1 py-1.5 text-sm`}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => savePlanTitle(plan.id)}
                        disabled={busy}
                        className="text-xs font-semibold text-[var(--accent-cyan)]"
                      >
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingPlanId(null)} className="text-[var(--text-secondary)]">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-bold text-white">{plan.title}</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPlanId(plan.id);
                          setEditPlanTitle(plan.title);
                        }}
                        className="text-[var(--text-secondary)] hover:text-white"
                        title="Edit plan name"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <PriorityBadge
                    priority={plan.priority}
                    onClick={() =>
                      onPatch({
                        action: "updatePlan",
                        planId: plan.id,
                        priority: nextPriority(plan.priority),
                      })
                    }
                  />
                  <EstimateBadge minutes={plan.estimateMinutes} />
                </div>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  {doneRegular} of {regularSubTasks.length} tasks done
                  {planned > 0 ? ` · about ${formatEstimate(planned)} left` : ""}
                </p>
              </div>
              {!isCore ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPatch({ action: "deletePlan", planId: plan.id })}
                  className="text-red-400/70 hover:text-red-400"
                  title="Delete plan"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            {plan.kind === "deen" ? (
              <div data-tour="azkar" className="mb-4 grid gap-3 sm:grid-cols-2">
                <Link
                  href={`/morning-azkar?${azkarQuery}`}
                  className={`flex min-h-[3.5rem] items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors active:scale-[0.98] ${
                    morningAzkar?.done
                      ? "border-emerald-400/40 bg-emerald-400/10"
                      : "border-[var(--card-border)] bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  {morningAzkar?.done ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                  ) : (
                    <Sun className="w-5 h-5 shrink-0 text-amber-300" />
                  )}
                  <div className="min-w-0 text-left flex-1">
                    <p className="font-bold text-white">Morning Azkar</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {morningAzkar?.done ? "Completed" : "Read & tick each adhkār"}
                    </p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                    <Clock className="w-3 h-3" />
                    {formatSpent(azkarMorningSeconds)}
                  </span>
                </Link>
                <Link
                  href={`/evening-azkar?${azkarQuery}`}
                  className={`flex min-h-[3.5rem] items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors active:scale-[0.98] ${
                    eveningAzkar?.done
                      ? "border-emerald-400/40 bg-emerald-400/10"
                      : "border-[var(--card-border)] bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  {eveningAzkar?.done ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                  ) : (
                    <Sparkles className="w-5 h-5 shrink-0 text-indigo-300" />
                  )}
                  <div className="min-w-0 text-left flex-1">
                    <p className="font-bold text-white">Evening Azkar</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {eveningAzkar?.done ? "Completed" : "Read & tick each adhkār"}
                    </p>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                    <Clock className="w-3 h-3" />
                    {formatSpent(azkarEveningSeconds)}
                  </span>
                </Link>
              </div>
            ) : null}

            {hasTimer ? (
              <div data-tour="timer" className="mb-4 rounded-xl border border-[var(--card-border)] bg-white/[0.03] p-4 sm:p-5">
                <p className="text-sm text-center text-[var(--text-secondary)] mb-2">
                  {timerRunning
                    ? "Timer is running — tap Stop when you finish"
                    : "Tap Start when you begin working"}
                </p>
                <p
                  className="text-3xl sm:text-4xl font-extrabold tabular-nums text-center"
                  style={{ color: timerRunning ? accent.color : "white" }}
                >
                  {formatClock(liveSecs)}
                </p>
                <p className="text-xs text-center text-[var(--text-secondary)] mt-1">
                  {timerRunning ? (
                    <>
                      This session · {formatClock(sessionSecs)}
                      {sessionFromOtherDay ? (
                        <span className="block text-amber-300/90 mt-0.5">
                          Started {new Date(`${sessionDateKey}T12:00:00`).toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    "Total time logged for this area today"
                  )}
                </p>
                {loggedTimeLooksImpossible(Math.floor(liveSecs / 60), dateKey, new Date(nowMs)) ? (
                  <p className="text-xs text-center text-amber-300/95 mt-2 px-2">
                    This looks too high for today ({formatMinutesLabel(minutesSinceMidnight(dateKey, new Date(nowMs)))}{" "}
                    elapsed since midnight). Check hours vs minutes, or use Remove to fix.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-3">
                  {timerRunning ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => list && onPatch({ action: "stopTimer", list })}
                      className="touch-target inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/40 bg-red-400/10 px-6 py-3.5 text-base font-bold text-red-400 sm:w-auto sm:py-3"
                    >
                      <Pause className="w-5 h-5" /> Stop timer
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => list && onPatch({ action: "startTimer", list })}
                      className={`touch-target inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-extrabold sm:w-auto sm:py-3 ${accent.btn}`}
                    >
                      <Play className="w-5 h-5" /> Start timer
                    </button>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
                  <p className="text-sm font-medium text-white mb-1">
                    Already finished? Enter your time
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mb-3">
                    Use this if you forgot to start the timer or worked offline. Enter hours and minutes
                    separately — e.g. 1 hour 30 min, not 90 in the hours box.
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--text-secondary)]">Hours</span>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        placeholder="0"
                        value={adjustHours[plan.id] ?? ""}
                        onChange={(e) => setAdjustHours((s) => ({ ...s, [plan.id]: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-2 py-3 text-base text-white text-center sm:w-16 sm:py-2"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--text-secondary)]">Minutes</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        placeholder="0"
                        value={adjustMins[plan.id] ?? ""}
                        onChange={(e) => setAdjustMins((s) => ({ ...s, [plan.id]: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-2 py-3 text-base text-white text-center sm:w-16 sm:py-2"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyAdjust(plan, "add", 1)}
                      className="col-span-2 touch-target rounded-xl border border-[var(--card-border)] py-3 text-sm font-semibold hover:bg-white/5 sm:col-span-1 sm:rounded-lg sm:px-4 sm:py-2"
                    >
                      Add time
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyAdjust(plan, "add", -1)}
                      className="touch-target rounded-xl border border-red-400/40 bg-red-400/10 py-3 text-sm font-semibold text-red-400 hover:bg-red-400/20 sm:rounded-lg sm:px-4 sm:py-2"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyAdjust(plan, "set")}
                      className="touch-target rounded-xl border border-[var(--card-border)] py-3 text-sm font-semibold hover:bg-white/5 sm:rounded-lg sm:px-4 sm:py-2"
                      title="Replace the total with this amount"
                    >
                      Set total
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div data-tour="subtasks" className="border-t border-[var(--card-border)] pt-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Today&apos;s to-do list</h3>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Tap the circle to mark a task as done.
                  </p>
                </div>
                {regularSubTasks.length > 0 ? (
                  <span
                    className="shrink-0 rounded-full border border-[var(--card-border)] bg-white/5 px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text-secondary)]"
                  >
                    {regularSubTasks.filter((t) => t.done).length}/{regularSubTasks.length}
                  </span>
                ) : null}
              </div>

              {regularSubTasks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--card-border)] bg-white/[0.02] py-8 text-center text-sm text-[var(--text-secondary)]">
                  No tasks yet — add one below to get started.
                </p>
              ) : (
                <ul className="mb-4 space-y-2.5">
                  {sortByPriority(regularSubTasks).map((t) => (
                    <SubTaskRow
                      key={t.id}
                      task={t}
                      accentColor={accent.color}
                      busy={busy}
                      editing={editingTaskId === t.id}
                      editText={editTaskText}
                      onEditTextChange={setEditTaskText}
                      onToggle={() => onPatch({ action: "toggleTask", planId: plan.id, taskId: t.id })}
                      onSaveEdit={() => saveSubTask(plan.id, t.id)}
                      onStartEdit={() => {
                        setEditingTaskId(t.id);
                        setEditTaskText(t.text);
                      }}
                      onCyclePriority={() =>
                        onPatch({
                          action: "setTaskPriority",
                          planId: plan.id,
                          taskId: t.id,
                          priority: nextPriority(t.priority),
                        })
                      }
                      onDelete={() => onPatch({ action: "deleteTask", planId: plan.id, taskId: t.id })}
                    />
                  ))}
                </ul>
              )}

              <form
                onSubmit={(e) => addSubTask(e, plan.id)}
                className="rounded-xl border border-[var(--card-border)] bg-white/[0.03] p-3 sm:p-3.5"
              >
                <input
                  type="text"
                  value={newSubTask[plan.id] ?? ""}
                  onChange={(e) => setNewSubTask((s) => ({ ...s, [plan.id]: e.target.value }))}
                  placeholder="Type a task, e.g. Reply to emails…"
                  maxLength={500}
                  className={`${inputClass} mb-3 w-full text-base`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Priority</span>
                  {(Object.keys(PRIORITY_STYLES) as WorkLogPriority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewSubPriority((s) => ({ ...s, [plan.id]: p }))}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase transition-opacity ${
                        PRIORITY_STYLES[p].className
                      } ${(newSubPriority[plan.id] ?? "medium") === p ? "" : "opacity-35"}`}
                    >
                      {PRIORITY_STYLES[p].label}
                    </button>
                  ))}
                  <span className="hidden h-4 w-px bg-[var(--card-border)] sm:block" aria-hidden />
                  <span className="text-xs font-medium text-[var(--text-secondary)]">Est.</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    placeholder="0h"
                    value={newSubEstH[plan.id] ?? ""}
                    onChange={(e) => setNewSubEstH((s) => ({ ...s, [plan.id]: e.target.value }))}
                    className="w-14 rounded-lg border border-[var(--card-border)] bg-white/5 px-2 py-1.5 text-xs text-white text-center"
                    aria-label="Estimated hours"
                  />
                  <input
                    type="number"
                    min={0}
                    max={59}
                    placeholder="0m"
                    value={newSubEstM[plan.id] ?? ""}
                    onChange={(e) => setNewSubEstM((s) => ({ ...s, [plan.id]: e.target.value }))}
                    className="w-14 rounded-lg border border-[var(--card-border)] bg-white/5 px-2 py-1.5 text-xs text-white text-center"
                    aria-label="Estimated minutes"
                  />
                  <button
                    type="submit"
                    disabled={busy || !(newSubTask[plan.id] || "").trim()}
                    className={`touch-target ml-auto inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-extrabold disabled:opacity-50 sm:rounded-lg sm:py-2 ${accent.btn}`}
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
              </form>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 6h12M9 12h12M9 18h12M5 6h.01M5 12h.01M5 18h.01" />
    </svg>
  );
}
