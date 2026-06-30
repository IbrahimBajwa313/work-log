import type { Db } from "mongodb";
import {
  createDefaultPlans,
  resolvePlansFromDoc,
  serializePlan,
  syncLegacyTaskFields,
  type SerializedWorkLogPlan,
  type WorkLogPlan,
} from "@/lib/work-log-plans";

export type { SerializedWorkLogPlan, WorkLogPlan } from "@/lib/work-log-plans";

export const adminWorkLogCollection =
  process.env.ADMIN_WORK_LOG_COLLECTION || "adminWorkLog";

export const WORK_LOG_PRIORITIES = ["high", "medium", "low"] as const;

export type WorkLogPriority = (typeof WORK_LOG_PRIORITIES)[number];

export type AdminWorkLogTask = {
  id: string;
  text: string;
  done: boolean;
  priority: WorkLogPriority;
  /** Planned time investment in minutes (null when not estimated). */
  estimateMinutes: number | null;
  /** Source task id when rolled over from a previous day. */
  carriedFromTaskId?: string | null;
  createdAt: Date;
};

/** One document per calendar day per tracked person (`personId` + `dateKey` unique). */
export type AdminWorkLogDoc = {
  dateKey: string;
  /** Which tracked person this day belongs to (defaults to primary). */
  personId?: string;
  /** Accumulated worked time in minutes (timer stops + manual adjustments). */
  totalMinutes: number;
  /** Non-null while the timer is running; elapsed time is added on stop. */
  timerStartedAt: Date | null;
  tasks: AdminWorkLogTask[];
  /** Daily plans (Business, Ilme Deen, custom) each with sub-tasks. */
  plans?: WorkLogPlan[];
  /** Separate daily checklist for Deen progress. */
  deenTasks?: AdminWorkLogTask[];
  /** Accumulated Deen time in minutes (separate from work time). */
  deenMinutes?: number;
  /** Non-null while the Deen timer is running. */
  deenTimerStartedAt?: Date | null;
  /** Separate daily checklist for fitness progress. */
  fitnessTasks?: AdminWorkLogTask[];
  /** Accumulated fitness time in minutes. */
  fitnessMinutes?: number;
  /** Non-null while the fitness timer is running. */
  fitnessTimerStartedAt?: Date | null;
  azkarProgress?: {
    morning?: { counts?: Record<string, number>; tickedIds?: string[]; secondsSpent?: number };
    evening?: { counts?: Record<string, number>; tickedIds?: string[]; secondsSpent?: number };
  };
  notes?: string;
  /** Last calendar day whose incomplete tasks were copied into this day. */
  carryOverAppliedFrom?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

let workLogIndexesEnsured = false;

/** Backfill `personId` on documents created before multi-person support. */
export async function migrateLegacyAdminWorkLogDays(db: Db): Promise<void> {
  await db.collection(adminWorkLogCollection).updateMany(
    { personId: { $exists: false } },
    { $set: { personId: "primary" } }
  );
}

/** Idempotent index setup (safe to call on cold starts). */
export async function ensureAdminWorkLogIndexes(db: Db): Promise<void> {
  if (workLogIndexesEnsured) return;
  await migrateLegacyAdminWorkLogDays(db);
  const coll = db.collection(adminWorkLogCollection);
  try {
    await coll.dropIndex("dateKey_1");
  } catch {
    // Index may not exist yet.
  }
  await coll.createIndex({ personId: 1, dateKey: 1 }, { unique: true });
  await coll.createIndex({ personId: 1, dateKey: -1 });
  workLogIndexesEnsured = true;
}

export type SerializedWorkLogDay = {
  dateKey: string;
  totalMinutes: number;
  timerStartedAt: string | null;
  tasks: SerializedWorkLogTask[];
  plans: SerializedWorkLogPlan[];
  deenTasks: SerializedWorkLogTask[];
  deenMinutes: number;
  deenTimerStartedAt: string | null;
  fitnessTasks: SerializedWorkLogTask[];
  fitnessMinutes: number;
  fitnessTimerStartedAt: string | null;
  /** Time spent reading morning adhkār today, in seconds. */
  azkarMorningSeconds: number;
  /** Time spent reading evening adhkār today, in seconds. */
  azkarEveningSeconds: number;
  notes: string;
  carryOverAppliedFrom?: string | null;
};

export type SerializedWorkLogTask = {
  id: string;
  text: string;
  done: boolean;
  priority: WorkLogPriority;
  estimateMinutes: number | null;
  createdAt: string;
};

function serializeTask(t: AdminWorkLogTask): SerializedWorkLogTask {
  return {
    id: t.id,
    text: t.text,
    done: Boolean(t.done),
    priority: WORK_LOG_PRIORITIES.includes(t.priority) ? t.priority : "medium",
    estimateMinutes:
      typeof t.estimateMinutes === "number" && t.estimateMinutes > 0
        ? Math.round(t.estimateMinutes)
        : null,
    createdAt:
      t.createdAt instanceof Date
        ? t.createdAt.toISOString()
        : new Date(t.createdAt).toISOString(),
  };
}

export function serializeWorkLogDay(doc: AdminWorkLogDoc): SerializedWorkLogDay {
  const resolved = resolvePlansFromDoc(doc);
  const legacy = syncLegacyTaskFields(resolved);
  return {
    dateKey: doc.dateKey,
    totalMinutes: doc.totalMinutes ?? 0,
    timerStartedAt: doc.timerStartedAt ? doc.timerStartedAt.toISOString() : null,
    tasks: legacy.tasks.map(serializeTask),
    plans: resolved.map(serializePlan),
    deenTasks: legacy.deenTasks.map(serializeTask),
    deenMinutes: doc.deenMinutes ?? 0,
    deenTimerStartedAt: doc.deenTimerStartedAt
      ? doc.deenTimerStartedAt.toISOString()
      : null,
    fitnessTasks: legacy.fitnessTasks.map(serializeTask),
    fitnessMinutes: doc.fitnessMinutes ?? 0,
    fitnessTimerStartedAt: doc.fitnessTimerStartedAt
      ? doc.fitnessTimerStartedAt.toISOString()
      : null,
    azkarMorningSeconds: azkarSeconds(doc.azkarProgress?.morning?.secondsSpent),
    azkarEveningSeconds: azkarSeconds(doc.azkarProgress?.evening?.secondsSpent),
    notes: doc.notes ?? "",
    carryOverAppliedFrom: doc.carryOverAppliedFrom ?? null,
  };
}

function azkarSeconds(value: number | undefined): number {
  return typeof value === "number" && value > 0 ? Math.round(value) : 0;
}

/** Empty shell returned for days that have no document yet. */
export function emptyWorkLogDay(dateKey: string): SerializedWorkLogDay {
  const plans = createDefaultPlans().map(serializePlan);
  return {
    dateKey,
    totalMinutes: 0,
    timerStartedAt: null,
    tasks: [],
    plans,
    deenTasks: [],
    deenMinutes: 0,
    deenTimerStartedAt: null,
    fitnessTasks: [],
    fitnessMinutes: 0,
    fitnessTimerStartedAt: null,
    azkarMorningSeconds: 0,
    azkarEveningSeconds: 0,
    notes: "",
    carryOverAppliedFrom: null,
  };
}
