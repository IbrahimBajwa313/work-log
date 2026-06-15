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
  tickedIds: string[];
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

export function getAzkarTickedIds(doc: AdminWorkLogDoc, period: AzkarPeriod): string[] {
  return doc.azkarProgress?.[period]?.tickedIds ?? [];
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
  tickedIds: string[]
): AzkarProgress {
  return {
    ...current,
    [period]: { ...current?.[period], tickedIds },
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
      tickedIds: prev?.tickedIds ?? [],
      secondsSpent: Math.max(0, Math.round(base + seconds)),
    },
  };
}

export function isAzkarComplete(tickedIds: string[], items: AdhkarItem[]): boolean {
  if (items.length === 0) return false;
  const set = new Set(tickedIds);
  return items.every((item) => set.has(item.id));
}

/** Fallback id generator for custom sub-tasks (unchanged). */
export function newTaskId(): string {
  return randomUUID();
}
