"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Flag, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import {
  isMilestoneComplete,
  MILESTONE_CATEGORY_LABELS,
  MONTHLY_MILESTONE_CATEGORIES,
  type MonthlyMilestoneCategory,
} from "@/lib/user-work-log-settings";
import { WORK_LOG_AREA_COLORS, workLogAreaColorsForKind } from "@/lib/work-log-area-colors";

export type MilestoneTargetFields = {
  id: string;
  title: string;
  targetCount: number;
  currentCount: number;
  unit: string;
  category: MonthlyMilestoneCategory;
};

export type MilestoneTargetDetails = {
  title: string;
  targetCount: number;
  unit: string;
  category: MonthlyMilestoneCategory;
};

const INPUT_CLASS =
  "w-full px-3 py-2.5 bg-white/5 border border-[var(--card-border)] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35";

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

export function MilestoneTargetCard({
  target,
  busy,
  periodLabel,
  accent = "cyan",
  extraBumpValues = [],
  onUpdateCount,
  onUpdateDetails,
  onDelete,
}: {
  target: MilestoneTargetFields;
  busy: boolean;
  periodLabel: string;
  accent?: "cyan" | "violet";
  extraBumpValues?: number[];
  onUpdateCount: (count: number) => void;
  onUpdateDetails: (details: MilestoneTargetDetails) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(target.title);
  const [editCount, setEditCount] = useState(
    target.targetCount > 0 ? String(target.targetCount) : ""
  );
  const [editUnit, setEditUnit] = useState(target.unit);
  const [editCategory, setEditCategory] = useState(target.category);
  const [countDraft, setCountDraft] = useState(String(target.currentCount));

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
  const bumpAccent =
    accent === "violet"
      ? "border-violet-400/30 bg-violet-400/10 text-violet-300 hover:bg-violet-400/20"
      : "border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20";

  useEffect(() => {
    setCountDraft(String(target.currentCount));
  }, [target.currentCount]);

  useEffect(() => {
    if (!editing) {
      setEditTitle(target.title);
      setEditCount(target.targetCount > 0 ? String(target.targetCount) : "");
      setEditUnit(target.unit);
      setEditCategory(target.category);
    }
  }, [target, editing]);

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

  const saveEdit = () => {
    const title = editTitle.trim();
    if (!title) return;
    const parsedTarget = editCount.trim() ? Number.parseInt(editCount, 10) : 0;
    const targetCount =
      Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : 0;
    onUpdateDetails({
      title,
      targetCount,
      unit: editUnit.trim(),
      category: editCategory,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <motion.article
        layout
        className="rounded-2xl border border-violet-400/30 bg-violet-500/[0.06] p-4 sm:p-5"
      >
        <p className="mb-3 text-sm font-bold text-white">Edit milestone</p>
        <div className="space-y-3">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            maxLength={200}
            className={INPUT_CLASS}
          />
          <div>
            <label className="mb-2 block text-xs text-[var(--text-secondary)]">Category</label>
            <div className="flex flex-wrap gap-2">
              {MONTHLY_MILESTONE_CATEGORIES.map((cat) => {
                const catColors = WORK_LOG_AREA_COLORS[cat];
                const active = editCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEditCategory(cat)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                      active ? "text-[#070d0d]" : "text-[var(--text-secondary)] hover:text-white"
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
                value={editCount}
                onChange={(e) => setEditCount(e.target.value)}
                placeholder="100"
                className={INPUT_CLASS}
              />
            </div>
            <div className="min-w-[7rem] flex-1">
              <label className="mb-1 block text-xs text-[var(--text-secondary)]">Unit (optional)</label>
              <input
                type="text"
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value)}
                placeholder="doctors"
                maxLength={40}
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !editTitle.trim()}
              onClick={saveEdit}
              className="rounded-xl bg-gradient-to-r from-violet-500 to-[var(--accent-cyan)] px-5 py-2.5 text-sm font-bold text-[#070d0d] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.article>
    );
  }

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
              {met
                ? `Completed ${periodLabel}`
                : "No numeric target — mark done when finished"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="rounded-lg p-2 text-[var(--text-secondary)] opacity-100 transition-all hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-30"
            aria-label="Edit milestone"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="rounded-lg p-2 text-red-400/50 opacity-100 transition-all hover:bg-red-400/10 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-30"
            aria-label="Delete milestone"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
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
              if (e.key === "Enter") e.currentTarget.blur();
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
          {[5, 10, ...extraBumpValues].map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => bump(n)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${bumpAccent}`}
            >
              +{n}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => onUpdateCount(met ? 0 : 1)}
          className={`mt-4 w-full rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 sm:w-auto ${
            met
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              : accent === "violet"
                ? "border-violet-400/40 bg-violet-400/10 text-violet-300 hover:bg-violet-400/20"
                : "border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20"
          }`}
        >
          {met ? "Mark as not done" : "Mark complete"}
        </button>
      )}
    </motion.article>
  );
}
