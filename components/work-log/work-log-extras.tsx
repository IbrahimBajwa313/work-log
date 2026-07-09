"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import {
  Bookmark,
  Briefcase,
  Dumbbell,
  List,
  Moon,
  Plus,
  Settings,
  Target,
  Trash2,
  UserPlus,
  Users,
  ArrowRight,
} from "lucide-react";
import {
  WORK_LOG_AREA_COLORS,
  WORK_LOG_CUSTOM_PLAN_COLOR,
} from "@/lib/work-log-area-colors";
import {
  MILESTONE_CATEGORY_LABELS,
  MONTHLY_MILESTONE_CATEGORIES,
  templateListLabel,
  type TaskTemplateList,
} from "@/lib/user-work-log-settings";

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
  list: TaskTemplateList;
  customAreaTitle?: string | null;
};

import type {
  MonthlyGoalOverride,
  SerializedMonthlyAchievementTarget,
  SerializedYearlyAchievementTarget,
  YearlyGoalOverride,
} from "@/lib/user-work-log-settings";

export type WorkLogSettings = {
  people: WorkLogPerson[];
  taskTemplates: WorkLogTaskTemplate[];
  dailyGoalMinutes: number;
  monthlyGoalMinutes: number;
  monthlyAchievementTargets: SerializedMonthlyAchievementTarget[];
  yearlyGoalMinutes: number;
  yearlyAchievementTargets: SerializedYearlyAchievementTarget[];
  monthlyGoalOverrides: MonthlyGoalOverride[];
  yearlyGoalOverrides: YearlyGoalOverride[];
  carryOverIncompleteTasks: boolean;
  customAreas: string[];
};

const PRIORITY_STYLES: Record<WorkLogPriority, { label: string; className: string }> = {
  high: { label: "High", className: "border-red-400/50 bg-red-400/15 text-red-300" },
  medium: { label: "Med", className: "border-amber-400/50 bg-amber-400/15 text-amber-300" },
  low: { label: "Low", className: "border-sky-400/50 bg-sky-400/15 text-sky-300" },
};

const SETTINGS_INPUT_CLASS =
  "w-full rounded-xl border border-[var(--card-border)] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-[var(--text-secondary)]/70 transition-colors focus:border-[var(--accent-cyan)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/25";

const SETTINGS_PRIMARY_BTN =
  "inline-flex touch-target items-center justify-center gap-2 rounded-xl bg-[var(--accent-cyan)] px-4 py-2.5 text-sm font-bold text-[#070d0d] shadow-[0_0_20px_-6px_var(--accent-cyan-glow)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none";

function SettingsSection({
  id,
  icon,
  title,
  description,
  children,
}: {
  id?: string;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="glass-card scroll-mt-24 rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10">
          {icon}
        </span>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function DurationFields({
  hours,
  mins,
  onHoursChange,
  onMinsChange,
  hoursMax = 24,
  minsMax = 59,
  compact = false,
}: {
  hours: string;
  mins: string;
  onHoursChange: (value: string) => void;
  onMinsChange: (value: string) => void;
  hoursMax?: number;
  minsMax?: number;
  compact?: boolean;
}) {
  const fieldClass = compact
    ? "w-full rounded-lg border border-[var(--card-border)] bg-white/[0.04] px-2 py-1.5 text-center text-xs text-white focus:border-[var(--accent-cyan)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/25"
    : SETTINGS_INPUT_CLASS + " text-center tabular-nums";

  return (
    <div
      className={`flex items-end gap-2 rounded-xl border border-[var(--card-border)] bg-white/[0.03] ${
        compact ? "p-1.5" : "p-2.5"
      }`}
    >
      <div className="min-w-0 flex-1">
        <label className="mb-1 block px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Hours
        </label>
        <input
          type="number"
          min={0}
          max={hoursMax}
          inputMode="numeric"
          value={hours}
          onChange={(e) => onHoursChange(e.target.value)}
          className={fieldClass}
        />
      </div>
      <span className={`font-light text-[var(--text-secondary)] ${compact ? "pb-1.5 text-sm" : "pb-2.5 text-lg"}`}>
        :
      </span>
      <div className="min-w-0 flex-1">
        <label className="mb-1 block px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Mins
        </label>
        <input
          type="number"
          min={0}
          max={minsMax}
          inputMode="numeric"
          value={mins}
          onChange={(e) => onMinsChange(e.target.value)}
          className={fieldClass}
        />
      </div>
    </div>
  );
}

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

type SelectedTemplateCategory =
  | { kind: "core"; list: (typeof MONTHLY_MILESTONE_CATEGORIES)[number] }
  | { kind: "custom"; title: string };

function TemplateCategoryIcon({
  list,
  customAreaTitle,
  className = "h-3.5 w-3.5 shrink-0",
}: {
  list: TaskTemplateList;
  customAreaTitle?: string | null;
  className?: string;
}) {
  if (list === "deen") {
    return <Moon className={className} style={{ color: WORK_LOG_AREA_COLORS.deen.color }} />;
  }
  if (list === "fitness") {
    return <Dumbbell className={className} style={{ color: WORK_LOG_AREA_COLORS.fitness.color }} />;
  }
  if (list === "work") {
    return <Briefcase className={className} style={{ color: WORK_LOG_AREA_COLORS.work.color }} />;
  }
  if (list === "custom") {
    return <List className={className} style={{ color: WORK_LOG_CUSTOM_PLAN_COLOR }} />;
  }
  return null;
}

function TemplateCategoryPicker({
  selected,
  customAreas,
  onSelect,
}: {
  selected: SelectedTemplateCategory;
  customAreas: string[];
  onSelect: (category: SelectedTemplateCategory) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {MONTHLY_MILESTONE_CATEGORIES.map((cat) => {
          const catColors = WORK_LOG_AREA_COLORS[cat];
          const active = selected.kind === "core" && selected.list === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onSelect({ kind: "core", list: cat })}
              className={`touch-target inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                active ? "text-[#070d0d]" : "hover:text-white"
              }`}
              style={
                active
                  ? { background: catColors.color, borderColor: catColors.border }
                  : {
                      borderColor: catColors.border,
                      background: catColors.softBg,
                      color: catColors.color,
                    }
              }
            >
              <TemplateCategoryIcon list={cat} className="h-3 w-3" />
              {MILESTONE_CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>
      {customAreas.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {customAreas.map((title) => {
            const active = selected.kind === "custom" && selected.title.toLowerCase() === title.toLowerCase();
            return (
              <button
                key={title}
                type="button"
                onClick={() => onSelect({ kind: "custom", title })}
                className={`touch-target inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  active ? "text-[#070d0d]" : "hover:text-white"
                }`}
                style={
                  active
                    ? {
                        background: WORK_LOG_CUSTOM_PLAN_COLOR,
                        borderColor: "rgba(167, 139, 250, 0.34)",
                      }
                    : {
                        borderColor: "rgba(167, 139, 250, 0.34)",
                        background: "rgba(167, 139, 250, 0.12)",
                        color: WORK_LOG_CUSTOM_PLAN_COLOR,
                      }
                }
              >
                <List className="h-3 w-3 shrink-0" />
                {title}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function PersonTabs({
  people,
  activePersonId,
  onSelect,
}: {
  people: WorkLogPerson[];
  activePersonId: string;
  onSelect: (id: string) => void;
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
      <Link
        href="/manage"
        className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[var(--card-border)] bg-white/5 px-3.5 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-white touch-target sm:px-3 sm:py-1.5"
      >
        <Settings className="w-3.5 h-3.5" />
        Manage
      </Link>
      </div>
    </div>
  );
}

export function DailyGoalProgress({
  totalSeconds,
  goalMinutes,
}: {
  totalSeconds: number;
  goalMinutes: number;
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
        <Link
          href="/manage#daily-goal"
          className="w-full rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2.5 text-center text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-white sm:w-auto sm:py-1.5 sm:text-xs"
        >
          Change goal
        </Link>
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

function templateListIcon(template: Pick<WorkLogTaskTemplate, "list" | "customAreaTitle">) {
  if (template.list === "custom") {
    return <List className="w-3.5 h-3.5 shrink-0" style={{ color: WORK_LOG_CUSTOM_PLAN_COLOR }} />;
  }
  if (template.list === "deen") {
    return <Moon className="w-3.5 h-3.5 shrink-0" style={{ color: WORK_LOG_AREA_COLORS.deen.color }} />;
  }
  if (template.list === "fitness") {
    return <Dumbbell className="w-3.5 h-3.5 shrink-0" style={{ color: WORK_LOG_AREA_COLORS.fitness.color }} />;
  }
  return (
    <Briefcase className="w-3.5 h-3.5 shrink-0" style={{ color: WORK_LOG_AREA_COLORS.work.color }} />
  );
}

export function TaskTemplatesPanel({
  templates,
  isTemplateAdded,
  busy,
  onApply,
  onApplyAll,
  areaLabel,
  className = "",
}: {
  templates: WorkLogTaskTemplate[];
  isTemplateAdded: (template: WorkLogTaskTemplate) => boolean;
  busy: boolean;
  onApply: (t: WorkLogTaskTemplate) => void;
  onApplyAll: () => void;
  areaLabel?: string;
  className?: string;
}) {
  const pending = templates.filter((t) => !isTemplateAdded(t));
  if (templates.length === 0) {
    return (
      <div className={`glass-card rounded-2xl p-4 mb-5 sm:p-5 sm:mb-6 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <Bookmark className="w-4 h-4 text-[var(--accent-cyan)]" />
          <h2 className="text-sm font-bold text-white">Quick-add daily tasks</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          {areaLabel
            ? `Save ${areaLabel} tasks you do every day — add them with one tap instead of typing again.`
            : "Save tasks you do every day — add them all with one tap instead of typing again."}
        </p>
        <Link
          href="/manage#saved-tasks"
          className="text-sm font-semibold text-[var(--accent-cyan)] hover:underline"
        >
          Create your first saved task →
        </Link>
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
              onClick={() => void onApplyAll()}
              disabled={busy || pending.length === 0}
              className="rounded-md border border-[var(--accent-cyan)]/40 px-3 py-1 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 disabled:opacity-50"
            >
              Add all ({pending.length})
            </button>
          ) : null}
          <Link
            href="/manage#saved-tasks"
            className="rounded-md border border-[var(--card-border)] bg-white/5 px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-white"
          >
            Manage
          </Link>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const added = isTemplateAdded(t);
          const style = PRIORITY_STYLES[t.priority];
          return (
            <li key={t.id} className="min-w-0">
              <button
                type="button"
                onClick={() => void onApply(t)}
                disabled={busy || added}
                className={`touch-target flex w-full min-w-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-50 sm:py-2 ${
                  added
                    ? "border-[var(--card-border)] bg-white/5 text-[var(--text-secondary)] line-through"
                    : "border-[var(--card-border)] bg-white/5 text-white hover:border-[var(--accent-cyan)]/40 active:scale-[0.99]"
                }`}
                title={added ? "Already added today" : `Add "${t.text}" to today`}
              >
                {templateListIcon(t)}
                <span className="shrink-0 text-[10px] font-semibold text-[var(--text-secondary)]">
                  {templateListLabel(t.list, t.customAreaTitle)}
                </span>
                <span className={`shrink-0 rounded-full border px-1.5 text-[10px] font-bold uppercase ${style.className}`}>
                  {style.label}
                </span>
                {t.estimateMinutes ? (
                  <span className="shrink-0 text-[11px] text-[var(--text-secondary)]">
                    {formatEstimate(t.estimateMinutes)}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{t.text}</span>
                {!added ? <Plus className="w-3.5 h-3.5 shrink-0 text-[var(--accent-cyan)]" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function WorkLogSettingsContent({
  settings,
  busy,
  onPatch,
}: {
  settings: WorkLogSettings;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [newPersonName, setNewPersonName] = useState("");
  const [newTemplateText, setNewTemplateText] = useState("");
  const [newTemplatePriority, setNewTemplatePriority] = useState<WorkLogPriority>("medium");
  const [selectedCategory, setSelectedCategory] = useState<SelectedTemplateCategory>({
    kind: "core",
    list: "work",
  });
  const [newTemplateHours, setNewTemplateHours] = useState("");
  const [newTemplateMins, setNewTemplateMins] = useState("");
  const [goalHours, setGoalHours] = useState(String(Math.floor(settings.dailyGoalMinutes / 60)));
  const [goalMins, setGoalMins] = useState(String(settings.dailyGoalMinutes % 60));

  useEffect(() => {
    setGoalHours(String(Math.floor(settings.dailyGoalMinutes / 60)));
    setGoalMins(String(settings.dailyGoalMinutes % 60));
  }, [settings.dailyGoalMinutes]);

  const parseEst = (h: string, m: string) => {
    const hv = Number.parseInt(h || "0", 10);
    const mv = Number.parseInt(m || "0", 10);
    return Number.isFinite(hv) && Number.isFinite(mv) && hv * 60 + mv > 0
      ? hv * 60 + mv
      : null;
  };

  const goalPreviewMinutes =
    (Number.parseInt(goalHours || "0", 10) || 0) * 60 + (Number.parseInt(goalMins || "0", 10) || 0);

  const addPerson = async () => {
    if (!newPersonName.trim()) return;
    const ok = await onPatch({ action: "addPerson", name: newPersonName.trim() });
    if (ok) setNewPersonName("");
  };

  const saveGoal = () => {
    const h = Number.parseInt(goalHours || "0", 10);
    const m = Number.parseInt(goalMins || "0", 10);
    onPatch({ action: "setDailyGoal", minutes: h * 60 + m });
  };

  const saveTemplate = async () => {
    if (!newTemplateText.trim()) return;
    const body: Record<string, unknown> = {
      action: "addTemplate",
      text: newTemplateText.trim(),
      priority: newTemplatePriority,
      estimateMinutes: parseEst(newTemplateHours, newTemplateMins),
    };
    if (selectedCategory.kind === "core") {
      body.list = selectedCategory.list;
    } else {
      body.list = "custom";
      body.customAreaTitle = selectedCategory.title;
    }
    const ok = await onPatch(body);
    if (ok) {
      setNewTemplateText("");
      setNewTemplateHours("");
      setNewTemplateMins("");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
          <SettingsSection
            id="people"
            icon={<Users className="h-4 w-4 text-[var(--accent-cyan)]" />}
            title="People you track"
            description="Add family, teammates, or anyone else — each person has their own log and stats."
          >
            <ul className="mb-4 space-y-2">
              {settings.people.map((p) => (
                <li
                  key={p.id}
                  className="group flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-white/[0.03] px-3 py-2.5 transition-colors hover:border-[var(--accent-cyan)]/25"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10"
                    style={{ background: `${p.color}18` }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{p.name}</span>
                  {p.id !== "primary" ? (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove ${p.name}`}
                      onClick={() => onPatch({ action: "deletePerson", personId: p.id })}
                      className="touch-target inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-red-400/70 transition-colors hover:bg-red-400/10 hover:text-red-300 disabled:opacity-45"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="shrink-0 rounded-full border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-cyan)]">
                      You
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addPerson();
                }}
                placeholder="New person name"
                maxLength={60}
                className={SETTINGS_INPUT_CLASS}
              />
              <button
                type="button"
                disabled={busy || !newPersonName.trim()}
                onClick={() => void addPerson()}
                className={`${SETTINGS_PRIMARY_BTN} w-full sm:w-auto sm:shrink-0`}
              >
                <UserPlus className="h-4 w-4" />
                Add
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            id="daily-goal"
            icon={<Target className="h-4 w-4 text-[var(--accent-cyan)]" />}
            title="Daily combined goal"
            description="Work, Deen, and fitness time counted together toward this target."
          >
            <div className="mb-3 flex items-center justify-between rounded-xl border border-[var(--card-border)] bg-white/[0.03] px-3 py-2.5">
              <span className="text-xs text-[var(--text-secondary)]">Target</span>
              <span className="text-sm font-bold tabular-nums text-white">
                {goalPreviewMinutes > 0 ? formatEstimate(goalPreviewMinutes) : "Not set"}
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <DurationFields
                  hours={goalHours}
                  mins={goalMins}
                  onHoursChange={setGoalHours}
                  onMinsChange={setGoalMins}
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={saveGoal}
                className={`${SETTINGS_PRIMARY_BTN} w-full sm:w-auto sm:shrink-0`}
              >
                Save goal
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            id="carry-over"
            icon={<ArrowRight className="h-4 w-4 text-[var(--accent-cyan)]" />}
            title="Carry over incomplete tasks"
            description="When enabled, tasks you don't finish today are automatically added to tomorrow's list."
          >
            <button
              type="button"
              role="switch"
              aria-checked={settings.carryOverIncompleteTasks ?? false}
              disabled={busy}
              onClick={() =>
                onPatch({
                  action: "setCarryOverIncompleteTasks",
                  enabled: !(settings.carryOverIncompleteTasks ?? false),
                })
              }
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                (settings.carryOverIncompleteTasks ?? false)
                  ? "border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10"
                  : "border-[var(--card-border)] bg-white/[0.03] hover:border-white/10"
              } disabled:opacity-45`}
            >
              <span className="text-sm text-white">
                {(settings.carryOverIncompleteTasks ?? false) ? "Enabled" : "Disabled"}
              </span>
              <span
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  (settings.carryOverIncompleteTasks ?? false) ? "bg-[var(--accent-cyan)]" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    (settings.carryOverIncompleteTasks ?? false) ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          </SettingsSection>

          <SettingsSection
            id="saved-tasks"
            icon={<Bookmark className="h-4 w-4 text-[var(--accent-cyan)]" />}
            title="Saved daily tasks"
            description="Preset tasks with priority and time — add to any day without retyping."
          >
            {settings.taskTemplates.length === 0 ? (
              <p className="mb-4 rounded-xl border border-dashed border-[var(--card-border)] bg-white/[0.02] px-4 py-8 text-center text-sm leading-relaxed text-[var(--text-secondary)]">
                No saved tasks yet. Create your first template below.
              </p>
            ) : (
              <ul className="mb-4 space-y-2">
                {settings.taskTemplates.map((t) => {
                  const style = PRIORITY_STYLES[t.priority];
                  return (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-white/[0.03] px-3 py-2.5 text-sm transition-colors hover:border-[var(--accent-cyan)]/20"
                    >
                      {templateListIcon(t)}
                      <span className="shrink-0 text-[10px] font-semibold text-[var(--text-secondary)]">
                        {templateListLabel(t.list, t.customAreaTitle)}
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase ${style.className}`}
                      >
                        {style.label}
                      </span>
                      {t.estimateMinutes ? (
                        <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-secondary)]">
                          {formatEstimate(t.estimateMinutes)}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-white">{t.text}</span>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Delete ${t.text}`}
                        onClick={() => onPatch({ action: "deleteTemplate", templateId: t.id })}
                        className="touch-target inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-red-400/70 transition-colors hover:bg-red-400/10 hover:text-red-300 disabled:opacity-45"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-3 rounded-xl border border-[var(--card-border)] bg-white/[0.02] p-3 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                New template
              </p>
              <input
                type="text"
                value={newTemplateText}
                onChange={(e) => setNewTemplateText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveTemplate();
                }}
                placeholder="Task name, e.g. Morning standup"
                maxLength={500}
                className={SETTINGS_INPUT_CLASS}
              />

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Priority
                </p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(PRIORITY_STYLES) as WorkLogPriority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewTemplatePriority(p)}
                      aria-pressed={newTemplatePriority === p}
                      className={`touch-target rounded-full border px-3 py-1 text-[10px] font-bold uppercase transition-all ${
                        PRIORITY_STYLES[p].className
                      } ${
                        newTemplatePriority === p
                          ? "ring-2 ring-white/25 ring-offset-1 ring-offset-[#0d1414]"
                          : "opacity-45 hover:opacity-80"
                      }`}
                    >
                      {PRIORITY_STYLES[p].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Category
                </p>
                <TemplateCategoryPicker
                  selected={selectedCategory}
                  customAreas={settings.customAreas ?? []}
                  onSelect={setSelectedCategory}
                />
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Estimated time
                </p>
                <DurationFields
                  compact
                  hours={newTemplateHours}
                  mins={newTemplateMins}
                  onHoursChange={setNewTemplateHours}
                  onMinsChange={setNewTemplateMins}
                  hoursMax={23}
                />
              </div>

              <button
                type="button"
                disabled={busy || !newTemplateText.trim()}
                onClick={() => void saveTemplate()}
                className={`${SETTINGS_PRIMARY_BTN} w-full`}
              >
                Save task template
              </button>
            </div>
          </SettingsSection>
    </div>
  );
}
