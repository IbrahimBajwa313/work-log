"use client";

import { useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  Circle,
  Clock,
  Moon,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  DEFAULT_DEEN_PLAN_ID,
  DEFAULT_WORK_PLAN_ID,
  type SerializedWorkLogPlan,
} from "@/lib/work-log-plans";

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

function sortByPriority<T extends { priority: WorkLogPriority }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => PRIORITY_ORDER[a.priority ?? "medium"] - PRIORITY_ORDER[b.priority ?? "medium"]
  );
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
    <button type="button" onClick={onClick} className={`${base} hover:opacity-80`} title="Change priority">
      {style.label}
    </button>
  );
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

export type DailyPlansSectionProps = {
  plans: SerializedWorkLogPlan[];
  dateKey: string;
  busy: boolean;
  inputClass: string;
  nowMs: number;
  workSeconds: number;
  deenSeconds: number;
  workTimerRunning: boolean;
  deenTimerRunning: boolean;
  workSessionSecs: number;
  deenSessionSecs: number;
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
  workTimerRunning,
  deenTimerRunning,
  workSessionSecs,
  deenSessionSecs,
  onPatch,
}: DailyPlansSectionProps) {
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

  const parseEst = (planId: string) => {
    const h = Number.parseInt(newSubEstH[planId] || "0", 10);
    const m = Number.parseInt(newSubEstM[planId] || "0", 10);
    return Number.isFinite(h) && Number.isFinite(m) && h * 60 + m > 0 ? h * 60 + m : null;
  };

  const planAccent = (plan: SerializedWorkLogPlan) => {
    if (plan.kind === "deen") return { border: "border-emerald-400/25", icon: Moon, color: "#34d399", btn: "bg-emerald-400 text-[#06120c]" };
    if (plan.kind === "work") return { border: "border-[var(--card-border)]", icon: Briefcase, color: "var(--accent-cyan)", btn: "bg-[var(--accent-cyan)] text-[#070d0d]" };
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
    if (plan.kind !== "work" && plan.kind !== "deen") return;
    const h = Number.parseInt(adjustHours[plan.id] || "0", 10);
    const m = Number.parseInt(adjustMins[plan.id] || "0", 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return;
    const minutes = (Math.abs(h) * 60 + Math.abs(m)) * sign;
    if (mode === "add" && minutes === 0) return;
    const ok = await onPatch({
      action: "adjustMinutes",
      mode,
      minutes,
      list: plan.kind === "deen" ? "deen" : "work",
    });
    if (ok) {
      setAdjustHours((s) => ({ ...s, [plan.id]: "" }));
      setAdjustMins((s) => ({ ...s, [plan.id]: "" }));
    }
  };

  return (
    <section className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Daily plans</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Business and Ilme Deen first — each plan has sub-tasks you can add or edit.
          </p>
        </div>
        <form onSubmit={addCustomPlan} className="flex gap-2">
          <input
            type="text"
            value={newPlanTitle}
            onChange={(e) => setNewPlanTitle(e.target.value)}
            placeholder="Add another plan…"
            maxLength={120}
            className={`${inputClass} w-48 sm:w-56`}
          />
          <button
            type="submit"
            disabled={busy || !newPlanTitle.trim()}
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Plan
          </button>
        </form>
      </div>

      {sortedPlans.map((plan, index) => {
        const accent = planAccent(plan);
        const Icon = accent.icon;
        const done = plan.subTasks.filter((t) => t.done).length;
        const total = plan.subTasks.length;
        const planned = plan.subTasks
          .filter((t) => !t.done)
          .reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0);
        const hasTimer = plan.kind === "work" || plan.kind === "deen";
        const timerRunning = plan.kind === "work" ? workTimerRunning : plan.kind === "deen" ? deenTimerRunning : false;
        const liveSecs = plan.kind === "work" ? workSeconds : plan.kind === "deen" ? deenSeconds : 0;
        const sessionSecs = plan.kind === "work" ? workSessionSecs : deenSessionSecs;
        const isCore = plan.id === DEFAULT_WORK_PLAN_ID || plan.id === DEFAULT_DEEN_PLAN_ID;

        return (
          <article
            key={plan.id}
            className={`bg-[var(--card-bg)]/90 border ${accent.border} rounded-xl p-6`}
          >
            <div className="flex flex-wrap items-start gap-3 mb-4">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5"
                style={{ color: accent.color }}
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
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {done}/{total} sub-tasks done
                  {planned > 0 ? ` · ${formatEstimate(planned)} remaining` : ""}
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

            {hasTimer ? (
              <div className="mb-4 rounded-lg border border-[var(--card-border)] bg-white/[0.03] p-4">
                <p
                  className="text-3xl sm:text-4xl font-extrabold tabular-nums text-center"
                  style={{ color: timerRunning ? accent.color : "white" }}
                >
                  {formatClock(liveSecs)}
                </p>
                <p className="text-xs text-center text-[var(--text-secondary)] mt-1">
                  {timerRunning ? `Session · ${formatClock(sessionSecs)}` : "Timer stopped"}
                </p>
                <div className="flex justify-center gap-2 mt-3">
                  {timerRunning ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onPatch({ action: "stopTimer", list: plan.kind === "deen" ? "deen" : "work" })
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-400/10 px-4 py-2 text-sm font-bold text-red-400"
                    >
                      <Pause className="w-4 h-4" /> Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onPatch({ action: "startTimer", list: plan.kind === "deen" ? "deen" : "work" })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-extrabold ${accent.btn}`}
                    >
                      <Play className="w-4 h-4" /> Start
                    </button>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                    Manual time
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      placeholder="h"
                      value={adjustHours[plan.id] ?? ""}
                      onChange={(e) => setAdjustHours((s) => ({ ...s, [plan.id]: e.target.value }))}
                      className="w-14 rounded-md border border-[var(--card-border)] bg-white/5 px-2 py-1.5 text-sm text-white"
                    />
                    <input
                      type="number"
                      min={0}
                      max={59}
                      placeholder="m"
                      value={adjustMins[plan.id] ?? ""}
                      onChange={(e) => setAdjustMins((s) => ({ ...s, [plan.id]: e.target.value }))}
                      className="w-14 rounded-md border border-[var(--card-border)] bg-white/5 px-2 py-1.5 text-sm text-white"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyAdjust(plan, "add", 1)}
                      className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold hover:bg-white/5"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyAdjust(plan, "set")}
                      className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold hover:bg-white/5"
                    >
                      Set
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="border-t border-[var(--card-border)] pt-4">
              <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)] mb-3">Sub-tasks</p>

              {plan.subTasks.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)] text-center py-4">No sub-tasks yet.</p>
              ) : (
                <ul className="space-y-2 mb-4">
                  {sortByPriority(plan.subTasks).map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 rounded-md border border-[var(--card-border)] bg-white/5 px-3 py-2"
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onPatch({ action: "toggleTask", planId: plan.id, taskId: t.id })}
                        className="shrink-0"
                      >
                        {t.done ? (
                          <CheckCircle2 className="w-5 h-5" style={{ color: accent.color }} />
                        ) : (
                          <Circle className="w-5 h-5 text-[var(--text-secondary)]" />
                        )}
                      </button>
                      {editingTaskId === t.id ? (
                        <div className="flex flex-1 gap-2">
                          <input
                            type="text"
                            value={editTaskText}
                            onChange={(e) => setEditTaskText(e.target.value)}
                            className={`${inputClass} flex-1 py-1 text-sm`}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => saveSubTask(plan.id, t.id)}
                            className="text-xs font-semibold shrink-0"
                            style={{ color: accent.color }}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`flex-1 text-sm ${t.done ? "line-through text-[var(--text-secondary)]" : "text-white"}`}
                        >
                          {t.text}
                        </span>
                      )}
                      <EstimateBadge minutes={t.estimateMinutes} />
                      <PriorityBadge
                        priority={t.priority}
                        onClick={() =>
                          onPatch({
                            action: "setTaskPriority",
                            planId: plan.id,
                            taskId: t.id,
                            priority: nextPriority(t.priority),
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTaskId(t.id);
                          setEditTaskText(t.text);
                        }}
                        className="text-[var(--text-secondary)] hover:text-white p-1"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onPatch({ action: "deleteTask", planId: plan.id, taskId: t.id })}
                        className="text-red-400/70 hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={(e) => addSubTask(e, plan.id)} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubTask[plan.id] ?? ""}
                    onChange={(e) => setNewSubTask((s) => ({ ...s, [plan.id]: e.target.value }))}
                    placeholder="Add a sub-task…"
                    maxLength={500}
                    className={inputClass}
                  />
                  <button
                    type="submit"
                    disabled={busy || !(newSubTask[plan.id] || "").trim()}
                    className={`shrink-0 inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-extrabold disabled:opacity-50 ${accent.btn}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(Object.keys(PRIORITY_STYLES) as WorkLogPriority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewSubPriority((s) => ({ ...s, [plan.id]: p }))}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                        PRIORITY_STYLES[p].className
                      } ${(newSubPriority[plan.id] ?? "medium") === p ? "" : "opacity-40"}`}
                    >
                      {PRIORITY_STYLES[p].label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    max={23}
                    placeholder="0h"
                    value={newSubEstH[plan.id] ?? ""}
                    onChange={(e) => setNewSubEstH((s) => ({ ...s, [plan.id]: e.target.value }))}
                    className="w-12 rounded border border-[var(--card-border)] bg-white/5 px-1.5 py-1 text-xs text-white"
                  />
                  <input
                    type="number"
                    min={0}
                    max={59}
                    placeholder="0m"
                    value={newSubEstM[plan.id] ?? ""}
                    onChange={(e) => setNewSubEstM((s) => ({ ...s, [plan.id]: e.target.value }))}
                    className="w-12 rounded border border-[var(--card-border)] bg-white/5 px-1.5 py-1 text-xs text-white"
                  />
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
