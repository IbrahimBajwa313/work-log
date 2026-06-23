"use client";

import { useState } from "react";
import {
  Bookmark,
  Moon,
  Plus,
  Settings,
  Target,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

export type WorkLogPriority = "high" | "medium" | "low";

export type WorkLogPerson = {
  id: string;
  name: string;
  color: string;
};

export type WorkLogTaskTemplate = {
  id: string;
  text: string;
  priority: WorkLogPriority;
  estimateMinutes: number | null;
  list: "work" | "deen";
};

export type WorkLogSettings = {
  people: WorkLogPerson[];
  taskTemplates: WorkLogTaskTemplate[];
  dailyGoalMinutes: number;
};

const PRIORITY_STYLES: Record<WorkLogPriority, { label: string; className: string }> = {
  high: { label: "High", className: "border-red-400/40 bg-red-400/10 text-red-400" },
  medium: { label: "Med", className: "border-amber-400/40 bg-amber-400/10 text-amber-400" },
  low: { label: "Low", className: "border-sky-400/40 bg-sky-400/10 text-sky-400" },
};

function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function PersonTabs({
  people,
  activePersonId,
  onSelect,
  onManage,
}: {
  people: WorkLogPerson[];
  activePersonId: string;
  onSelect: (id: string) => void;
  onManage: () => void;
}) {
  return (
    <div className="mb-5 sm:mb-6">
      <p className="text-sm font-medium text-white mb-2 flex items-center gap-2">
        <Users className="w-4 h-4 text-[var(--text-secondary)]" />
        Who are you tracking for?
      </p>
      <div className="-mx-3 flex items-center gap-2 overflow-x-auto mobile-scroll-x px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors touch-target sm:px-3 sm:py-1.5 ${
            activePersonId === p.id
              ? "border-white/30 bg-white/10 text-white"
              : "border-[var(--card-border)] bg-white/5 text-[var(--text-secondary)] hover:text-white"
          }`}
          style={activePersonId === p.id ? { borderColor: `${p.color}88`, color: p.color } : undefined}
        >
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
            style={{ background: p.color }}
          />
          {p.name}
        </button>
      ))}
      <button
        type="button"
        onClick={onManage}
        className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-white/5 px-3.5 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-white touch-target sm:px-3 sm:py-1.5"
      >
        <Settings className="w-3.5 h-3.5" />
        Manage
      </button>
      </div>
    </div>
  );
}

export function DailyGoalProgress({
  totalSeconds,
  goalMinutes,
  onEditGoal,
}: {
  totalSeconds: number;
  goalMinutes: number;
  onEditGoal: () => void;
}) {
  if (goalMinutes <= 0) return null;
  const goalSecs = goalMinutes * 60;
  const pct = Math.min(100, Math.round((totalSeconds / goalSecs) * 100));
  const met = totalSeconds >= goalSecs;

  return (
    <div className="glass-card rounded-2xl p-4 mb-5 sm:p-5 sm:mb-6">
      <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10">
            <Target className="w-4 h-4 text-[var(--accent-cyan)]" />
          </span>
          <p className="text-sm font-bold text-white">Today&apos;s time goal</p>
        </div>
        <button
          type="button"
          onClick={onEditGoal}
          className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-white sm:w-auto sm:py-1.5 sm:text-xs"
        >
          Change goal
        </button>
      </div>
      <div className="flex items-end justify-between mb-2">
        <p className="text-2xl font-bold text-white tabular-nums">{formatDuration(totalSeconds)}</p>
        <p className="text-sm text-[var(--text-secondary)]">goal: {formatEstimate(goalMinutes)}</p>
      </div>
      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            met
              ? "bg-gradient-to-r from-emerald-400 to-emerald-300 shadow-[0_0_14px_-2px_rgba(52,211,153,0.6)]"
              : "bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-cyan-2)] shadow-[0_0_14px_-2px_var(--accent-cyan-glow)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-[var(--text-secondary)] mt-2">
        {met ? "🎉 You reached your goal — well done!" : `${pct}% of the way there — keep going!`}
      </p>
    </div>
  );
}

export function TaskTemplatesPanel({
  templates,
  todayTaskTexts,
  busy,
  onApply,
  onApplyAll,
  onManage,
  className = "",
}: {
  templates: WorkLogTaskTemplate[];
  todayTaskTexts: Set<string>;
  busy: boolean;
  onApply: (t: WorkLogTaskTemplate) => void;
  onApplyAll: () => void;
  onManage: () => void;
  className?: string;
}) {
  const pending = templates.filter((t) => !todayTaskTexts.has(t.text.trim().toLowerCase()));
  if (templates.length === 0) {
    return (
      <div className={`glass-card rounded-2xl p-4 mb-5 sm:p-5 sm:mb-6 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <Bookmark className="w-4 h-4 text-[var(--accent-cyan)]" />
          <h2 className="text-sm font-bold text-white">Quick-add daily tasks</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          Save tasks you do every day — add them all with one tap instead of typing again.
        </p>
        <button
          type="button"
          onClick={onManage}
          className="text-sm font-semibold text-[var(--accent-cyan)] hover:underline"
        >
          Create your first saved task →
        </button>
      </div>
    );
  }

  return (
    <div className={`glass-card rounded-2xl p-4 mb-5 sm:p-5 sm:mb-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-[var(--accent-cyan)]" />
          <h2 className="text-sm font-bold text-white">Quick-add daily tasks</h2>
          <span className="text-xs text-[var(--text-secondary)]">
            {pending.length} ready to add
          </span>
        </div>
        <div className="flex gap-2">
          {pending.length > 1 ? (
            <button
              type="button"
              onClick={onApplyAll}
              disabled={busy || pending.length === 0}
              className="rounded-md border border-[var(--accent-cyan)]/40 px-3 py-1 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 disabled:opacity-50"
            >
              Add all ({pending.length})
            </button>
          ) : null}
          <button
            type="button"
            onClick={onManage}
            className="rounded-md border border-[var(--card-border)] bg-white/5 px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-white"
          >
            Manage
          </button>
        </div>
      </div>
      <ul className="-mx-1 flex gap-2 overflow-x-auto mobile-scroll-x px-1 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {templates.map((t) => {
          const added = todayTaskTexts.has(t.text.trim().toLowerCase());
          const style = PRIORITY_STYLES[t.priority];
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onApply(t)}
                disabled={busy || added}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
                  added
                    ? "border-[var(--card-border)] bg-white/5 text-[var(--text-secondary)] line-through"
                    : "border-[var(--card-border)] bg-white/5 text-white hover:border-[var(--accent-cyan)]/40"
                }`}
                title={added ? "Already added today" : "Add to today"}
              >
                {t.list === "deen" ? (
                  <Moon className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                ) : null}
                <span className={`rounded-full border px-1.5 text-[10px] font-bold uppercase ${style.className}`}>
                  {style.label}
                </span>
                {t.estimateMinutes ? (
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {formatEstimate(t.estimateMinutes)}
                  </span>
                ) : null}
                {t.text}
                {!added ? <Plus className="w-3.5 h-3.5 text-[var(--accent-cyan)]" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function WorkLogSettingsModal({
  settings,
  busy,
  onClose,
  onPatch,
}: {
  settings: WorkLogSettings;
  busy: boolean;
  onClose: () => void;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [newPersonName, setNewPersonName] = useState("");
  const [newTemplateText, setNewTemplateText] = useState("");
  const [newTemplatePriority, setNewTemplatePriority] = useState<WorkLogPriority>("medium");
  const [newTemplateList, setNewTemplateList] = useState<"work" | "deen">("work");
  const [newTemplateHours, setNewTemplateHours] = useState("");
  const [newTemplateMins, setNewTemplateMins] = useState("");
  const [goalHours, setGoalHours] = useState(String(Math.floor(settings.dailyGoalMinutes / 60)));
  const [goalMins, setGoalMins] = useState(String(settings.dailyGoalMinutes % 60));

  const inputClass =
    "w-full px-3 py-2 bg-white/5 border border-[var(--card-border)] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35";

  const parseEst = (h: string, m: string) => {
    const hv = Number.parseInt(h || "0", 10);
    const mv = Number.parseInt(m || "0", 10);
    return Number.isFinite(hv) && Number.isFinite(mv) && hv * 60 + mv > 0
      ? hv * 60 + mv
      : null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#0b1414] border border-[var(--card-border)] rounded-xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Work Logging settings</h2>
          <button type="button" onClick={onClose} className="text-[var(--text-secondary)] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <section className="mb-6">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--accent-cyan)]" />
            People you track
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Add family, teammates, or anyone else — each person has their own log and stats.
          </p>
          <ul className="space-y-2 mb-3">
            {settings.people.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-md border border-[var(--card-border)] bg-white/5 px-3 py-2"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
                <span className="flex-1 text-sm text-white">{p.name}</span>
                {p.id !== "primary" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPatch({ action: "deletePerson", personId: p.id })}
                    className="text-red-400/70 hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="text-[10px] uppercase text-[var(--text-secondary)]">You</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              placeholder="New person name"
              maxLength={60}
              className={inputClass}
            />
            <button
              type="button"
              disabled={busy || !newPersonName.trim()}
              onClick={async () => {
                const ok = await onPatch({ action: "addPerson", name: newPersonName.trim() });
                if (ok) setNewPersonName("");
              }}
              className="shrink-0 inline-flex items-center gap-1 rounded-md bg-[var(--accent-cyan)] px-3 py-2 text-sm font-bold text-[#070d0d] disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              Add
            </button>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--accent-cyan)]" />
            Daily combined goal
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Work, Deen, and fitness time counted together toward this target.
          </p>
          <div className="flex items-end gap-2">
            <div className="w-16">
              <label className="text-xs text-[var(--text-secondary)]">Hours</label>
              <input
                type="number"
                min={0}
                max={24}
                value={goalHours}
                onChange={(e) => setGoalHours(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="w-16">
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
              onClick={() => {
                const h = Number.parseInt(goalHours || "0", 10);
                const m = Number.parseInt(goalMins || "0", 10);
                onPatch({ action: "setDailyGoal", minutes: h * 60 + m });
              }}
              className="rounded-md border border-[var(--accent-cyan)]/40 px-4 py-2 text-sm font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 disabled:opacity-50"
            >
              Save goal
            </button>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-[var(--accent-cyan)]" />
            Saved daily tasks
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Preset tasks with priority and time — add to any day without retyping.
          </p>
          <ul className="space-y-2 mb-3 max-h-40 overflow-y-auto">
            {settings.taskTemplates.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-md border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm"
              >
                {t.list === "deen" ? <Moon className="w-3.5 h-3.5 text-emerald-300" /> : null}
                <span className="flex-1 text-white">{t.text}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPatch({ action: "deleteTemplate", templateId: t.id })}
                  className="text-red-400/70 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <input
              type="text"
              value={newTemplateText}
              onChange={(e) => setNewTemplateText(e.target.value)}
              placeholder="Task name, e.g. Morning standup"
              maxLength={500}
              className={inputClass}
            />
            <div className="flex flex-wrap gap-2 items-center">
              {(Object.keys(PRIORITY_STYLES) as WorkLogPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setNewTemplatePriority(p)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                    PRIORITY_STYLES[p].className
                  } ${newTemplatePriority === p ? "" : "opacity-40"}`}
                >
                  {PRIORITY_STYLES[p].label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setNewTemplateList(newTemplateList === "work" ? "deen" : "work")}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                  newTemplateList === "deen"
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                    : "border-[var(--card-border)] bg-white/5 text-[var(--text-secondary)]"
                }`}
              >
                {newTemplateList === "deen" ? "Deen" : "Business"}
              </button>
              <input
                type="number"
                min={0}
                max={23}
                value={newTemplateHours}
                onChange={(e) => setNewTemplateHours(e.target.value)}
                placeholder="0"
                className="w-12 rounded border border-[var(--card-border)] bg-white/5 px-2 py-1 text-xs text-white"
              />
              <span className="text-xs text-[var(--text-secondary)]">h</span>
              <input
                type="number"
                min={0}
                max={59}
                value={newTemplateMins}
                onChange={(e) => setNewTemplateMins(e.target.value)}
                placeholder="0"
                className="w-12 rounded border border-[var(--card-border)] bg-white/5 px-2 py-1 text-xs text-white"
              />
              <span className="text-xs text-[var(--text-secondary)]">m</span>
            </div>
            <button
              type="button"
              disabled={busy || !newTemplateText.trim()}
              onClick={async () => {
                const ok = await onPatch({
                  action: "addTemplate",
                  text: newTemplateText.trim(),
                  priority: newTemplatePriority,
                  list: newTemplateList,
                  estimateMinutes: parseEst(newTemplateHours, newTemplateMins),
                });
                if (ok) {
                  setNewTemplateText("");
                  setNewTemplateHours("");
                  setNewTemplateMins("");
                }
              }}
              className="w-full rounded-md bg-[var(--accent-cyan)] py-2 text-sm font-bold text-[#070d0d] disabled:opacity-50"
            >
              Save task template
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
