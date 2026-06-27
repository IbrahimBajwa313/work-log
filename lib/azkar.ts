import { randomUUID } from "crypto";
import type { AdminWorkLogDoc, AdminWorkLogTask } from "@/lib/admin-work-log";
import {
  DEFAULT_DEEN_PLAN_ID,
  resolvePlansFromDoc,
  type WorkLogPlan,
} from "@/lib/work-log-plans";

export const AZKAR_MORNING_TASK_ID = "azkar-morning";
export const AZKAR_EVENING_TASK_ID = "azkar-evening";

export type AzkarPeriod = "morning" | "evening";

export type AzkarPeriodProgress = {
  /** Per-adhkar repetition counts (tasbih-style). */
  counts?: Record<string, number>;
  /** Legacy binary completion — migrated to counts on read. */
  tickedIds?: string[];
  /** Accumulated reading time on the azkar page, in seconds. */
  secondsSpent?: number;
};

export type AzkarProgress = {
  morning?: AzkarPeriodProgress;
  evening?: AzkarPeriodProgress;
};

export type AdhkarItem = {
  id: string;
  title: string;
  arabic: string;
  repeatCount: number;
  translation: string;
  virtue: string;
};

export type AzkarProgressSummary = {
  total: number;
  read: number;
  complete: boolean;
};

function azkarSubTask(id: string, text: string, done: boolean, now: Date): AdminWorkLogTask {
  return {
    id,
    text,
    done,
    priority: "high",
    estimateMinutes: null,
    createdAt: now,
  };
}

/** Ensure Morning / Evening Azkar tasks exist at the top of the Deen plan. */
export function ensureAzkarSubTasksOnDoc(doc: AdminWorkLogDoc): WorkLogPlan[] {
  const now = new Date();
  const plans = resolvePlansFromDoc(doc);
  const deenIdx = plans.findIndex((p) => p.id === DEFAULT_DEEN_PLAN_ID || p.kind === "deen");
  if (deenIdx < 0) return plans;

  const deen = plans[deenIdx];
  const existing = [...deen.subTasks];
  const morning = existing.find((t) => t.id === AZKAR_MORNING_TASK_ID);
  const evening = existing.find((t) => t.id === AZKAR_EVENING_TASK_ID);
  const rest = existing.filter(
    (t) => t.id !== AZKAR_MORNING_TASK_ID && t.id !== AZKAR_EVENING_TASK_ID
  );

  const morningDone = morning?.done ?? false;
  const eveningDone = evening?.done ?? false;

  const subTasks: AdminWorkLogTask[] = [
    azkarSubTask(AZKAR_MORNING_TASK_ID, "Morning Azkar", morningDone, now),
    azkarSubTask(AZKAR_EVENING_TASK_ID, "Evening Azkar", eveningDone, now),
    ...rest,
  ];

  const next = [...plans];
  next[deenIdx] = { ...deen, subTasks };
  return next;
}

export function resolveAzkarCounts(
  progress: AzkarPeriodProgress | undefined,
  items: AdhkarItem[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  if (progress?.counts && typeof progress.counts === "object") {
    for (const item of items) {
      const raw = progress.counts[item.id];
      if (typeof raw === "number" && raw > 0) {
        counts[item.id] = Math.min(Math.floor(raw), item.repeatCount);
      }
    }
    return counts;
  }

  if (progress?.tickedIds?.length) {
    const ticked = new Set(progress.tickedIds);
    for (const item of items) {
      if (ticked.has(item.id)) counts[item.id] = item.repeatCount;
    }
  }

  return counts;
}

export function getAzkarCounts(
  doc: AdminWorkLogDoc,
  period: AzkarPeriod,
  items: AdhkarItem[]
): Record<string, number> {
  return resolveAzkarCounts(doc.azkarProgress?.[period], items);
}

/** @deprecated Use getAzkarCounts — returns ids whose repetition target is fully met. */
export function getAzkarTickedIds(doc: AdminWorkLogDoc, period: AzkarPeriod): string[] {
  return doc.azkarProgress?.[period]?.tickedIds ?? [];
}

export function getAdhkarCount(counts: Record<string, number>, item: AdhkarItem): number {
  const raw = counts[item.id];
  if (typeof raw !== "number" || raw <= 0) return 0;
  return Math.min(Math.floor(raw), item.repeatCount);
}

export function isAdhkarComplete(counts: Record<string, number>, item: AdhkarItem): boolean {
  return getAdhkarCount(counts, item) >= item.repeatCount;
}

export function computeAzkarProgress(
  counts: Record<string, number>,
  items: AdhkarItem[]
): AzkarProgressSummary {
  const total = items.reduce((sum, item) => sum + item.repeatCount, 0);
  const read = items.reduce((sum, item) => sum + getAdhkarCount(counts, item), 0);
  const complete = items.length > 0 && items.every((item) => isAdhkarComplete(counts, item));
  return { total, read, complete };
}

export function getAzkarSecondsSpent(doc: AdminWorkLogDoc, period: AzkarPeriod): number {
  const secs = doc.azkarProgress?.[period]?.secondsSpent;
  return typeof secs === "number" && secs > 0 ? Math.round(secs) : 0;
}

export function setAzkarTaskDone(plans: WorkLogPlan[], taskId: string, done: boolean): WorkLogPlan[] {
  const deenIdx = plans.findIndex((p) => p.kind === "deen");
  if (deenIdx < 0) return plans;
  const deen = plans[deenIdx];
  const subTasks = deen.subTasks.map((t) => (t.id === taskId ? { ...t, done } : t));
  const next = [...plans];
  next[deenIdx] = { ...deen, subTasks };
  return next;
}

export function newAzkarProgress(
  current: AzkarProgress | undefined,
  period: AzkarPeriod,
  counts: Record<string, number>
): AzkarProgress {
  const prev = current?.[period];
  return {
    ...current,
    [period]: {
      counts,
      secondsSpent: prev?.secondsSpent,
    },
  };
}

/** Returns updated progress with `seconds` added to the period's accumulated time. */
export function addAzkarSecondsToProgress(
  current: AzkarProgress | undefined,
  period: AzkarPeriod,
  seconds: number
): AzkarProgress {
  const prev = current?.[period];
  const base = typeof prev?.secondsSpent === "number" ? prev.secondsSpent : 0;
  return {
    ...current,
    [period]: {
      counts: prev?.counts,
      tickedIds: prev?.tickedIds,
      secondsSpent: Math.max(0, Math.round(base + seconds)),
    },
  };
}

export function isAzkarComplete(counts: Record<string, number>, items: AdhkarItem[]): boolean {
  return computeAzkarProgress(counts, items).complete;
}

export function applyAdhkarCountUpdate(
  counts: Record<string, number>,
  item: AdhkarItem,
  mode: "increment" | "complete" | "reset" | "set",
  value?: number
): Record<string, number> {
  const next = { ...counts };
  switch (mode) {
    case "increment":
      next[item.id] = Math.min(getAdhkarCount(counts, item) + 1, item.repeatCount);
      break;
    case "complete":
      next[item.id] = item.repeatCount;
      break;
    case "reset":
      delete next[item.id];
      break;
    case "set":
      if (typeof value !== "number" || value <= 0) delete next[item.id];
      else next[item.id] = Math.min(Math.floor(value), item.repeatCount);
      break;
  }
  return next;
}

/** Fallback id generator for custom sub-tasks (unchanged). */
export function newTaskId(): string {
  return randomUUID();
}
