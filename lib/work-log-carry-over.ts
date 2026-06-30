import type { Collection, Filter } from "mongodb";
import type { Db } from "mongodb";
import type { AdminWorkLogDoc, AdminWorkLogTask, SerializedWorkLogDay } from "@/lib/admin-work-log";
import { emptyWorkLogDay } from "@/lib/admin-work-log";
import { dateKeyAddDays, localDateKey } from "@/lib/date-keys";
import {
  createDefaultPlans,
  newSubTask,
  resolvePlansFromDoc,
  serializePlan,
  syncLegacyTaskFields,
  type WorkLogPlan,
} from "@/lib/work-log-plans";
import { getOrCreateUserWorkLogSettings } from "@/lib/user-work-log-settings";
import { resolveUserDayForWrite } from "@/lib/work-log-day-resolve";
import type { UserWorkLogDoc } from "@/lib/user-work-log";
import { getOrCreateAdminWorkLogSettings } from "@/lib/admin-work-log-settings";
import { adminWorkLogCollection } from "@/lib/admin-work-log";

export function computeCarryOverPlans(
  yesterdayDoc: AdminWorkLogDoc | null,
  todayDoc: AdminWorkLogDoc,
  now: Date
): { plans: WorkLogPlan[]; carryOverAppliedFrom: string; tasksAdded: number } | null {
  const yesterdayKey = dateKeyAddDays(todayDoc.dateKey, -1);
  if (todayDoc.carryOverAppliedFrom === yesterdayKey) return null;
  if (!yesterdayDoc) {
    return {
      plans: resolvePlansFromDoc(todayDoc),
      carryOverAppliedFrom: yesterdayKey,
      tasksAdded: 0,
    };
  }

  const yesterdayPlans = resolvePlansFromDoc(yesterdayDoc);
  const todayPlans = resolvePlansFromDoc(todayDoc);
  const existingCarriedIds = new Set<string>();
  for (const plan of todayPlans) {
    for (const task of plan.subTasks) {
      if (task.carriedFromTaskId) existingCarriedIds.add(task.carriedFromTaskId);
    }
  }

  const mergedPlans = todayPlans.map((plan) => ({ ...plan, subTasks: [...plan.subTasks] }));
  const planById = new Map(mergedPlans.map((plan) => [plan.id, plan]));
  let tasksAdded = 0;

  for (const yPlan of yesterdayPlans) {
    for (const task of yPlan.subTasks) {
      if (task.done || existingCarriedIds.has(task.id)) continue;

      let targetPlan = planById.get(yPlan.id);
      if (!targetPlan && yPlan.kind === "custom") {
        mergedPlans.push({ ...yPlan, subTasks: [] });
        targetPlan = mergedPlans[mergedPlans.length - 1];
        planById.set(targetPlan.id, targetPlan);
      }
      if (!targetPlan) continue;

      const carried: AdminWorkLogTask = {
        ...newSubTask(task.text, task.priority, task.estimateMinutes, now),
        carriedFromTaskId: task.id,
      };
      targetPlan.subTasks.push(carried);
      existingCarriedIds.add(task.id);
      tasksAdded += 1;
    }
  }

  return {
    plans: mergedPlans.sort((a, b) => a.order - b.order),
    carryOverAppliedFrom: yesterdayKey,
    tasksAdded,
  };
}

export async function persistCarryOverResult<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  dayFilter: Filter<T>,
  plans: WorkLogPlan[],
  carryOverAppliedFrom: string,
  now: Date
): Promise<void> {
  const legacy = syncLegacyTaskFields(plans);
  await coll.updateOne(dayFilter, {
    $set: {
      plans,
      tasks: legacy.tasks,
      deenTasks: legacy.deenTasks,
      fitnessTasks: legacy.fitnessTasks,
      carryOverAppliedFrom,
      updatedAt: now,
    },
  } as Parameters<Collection<T>["updateOne"]>[1]);
}

/** Apply carry-over when loading today's log, if the setting is enabled. */
export async function ensureCarryOverForToday<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  todayDoc: T,
  yesterdayDoc: T | null,
  enabled: boolean
): Promise<T> {
  if (!enabled) return todayDoc;

  const todayKey = localDateKey(new Date());
  if (todayDoc.dateKey !== todayKey) return todayDoc;

  const now = new Date();
  const result = computeCarryOverPlans(yesterdayDoc, todayDoc, now);
  if (!result) return todayDoc;

  const dayFilter = { _id: (todayDoc as T & { _id?: unknown })._id } as Filter<T>;
  if (!dayFilter._id) return todayDoc;

  await persistCarryOverResult(coll, dayFilter, result.plans, result.carryOverAppliedFrom, now);

  const updated = await coll.findOne(dayFilter);
  return (updated as T | null) ?? todayDoc;
}

export async function findYesterdayDoc<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  todayKey: string,
  baseFilter: Filter<T>
): Promise<T | null> {
  const yesterdayKey = dateKeyAddDays(todayKey, -1);
  const doc = await coll.findOne({ ...baseFilter, dateKey: yesterdayKey } as Filter<T>);
  return doc as T | null;
}

export async function runUserCarryOverIfNeeded(
  db: Db,
  coll: Collection<UserWorkLogDoc>,
  userId: string,
  personId: string
): Promise<void> {
  const settings = await getOrCreateUserWorkLogSettings(db, userId);
  if (!settings.carryOverIncompleteTasks) return;

  const todayKey = localDateKey(new Date());
  const todayDoc = await resolveUserDayForWrite(coll, userId, todayKey, personId);
  const yesterdayDoc = await findYesterdayDoc(coll, todayKey, { userId, personId });
  await ensureCarryOverForToday(coll, todayDoc, yesterdayDoc, true);
}

export async function runAdminCarryOverIfNeeded(
  db: Db,
  personId: string
): Promise<void> {
  const settings = await getOrCreateAdminWorkLogSettings(db);
  if (!settings.carryOverIncompleteTasks) return;

  const todayKey = localDateKey(new Date());
  const coll = db.collection<AdminWorkLogDoc>(adminWorkLogCollection);
  const now = new Date();

  const todayDoc = await coll.findOneAndUpdate(
    { personId, dateKey: todayKey },
    {
      $setOnInsert: {
        personId,
        dateKey: todayKey,
        totalMinutes: 0,
        timerStartedAt: null,
        tasks: [],
        plans: createDefaultPlans(now),
        deenTasks: [],
        deenMinutes: 0,
        deenTimerStartedAt: null,
        fitnessTasks: [],
        fitnessMinutes: 0,
        fitnessTimerStartedAt: null,
        notes: "",
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  if (!todayDoc) return;

  const yesterdayDoc = await findYesterdayDoc(coll, todayKey, { personId });
  await ensureCarryOverForToday(coll, todayDoc, yesterdayDoc, true);
}

export function applyCarryOverToDays(
  days: SerializedWorkLogDay[],
  enabled: boolean,
  now = new Date()
): SerializedWorkLogDay[] {
  if (!enabled) return days;

  const todayKey = localDateKey(now);
  const yesterdayKey = dateKeyAddDays(todayKey, -1);
  const byKey = new Map(days.map((day) => [day.dateKey, day]));
  const yesterdayDay = byKey.get(yesterdayKey) ?? null;
  const todayDay = byKey.get(todayKey) ?? emptyWorkLogDay(todayKey);

  const todayDoc: AdminWorkLogDoc = {
    ...serializedDayToDoc(todayDay),
    carryOverAppliedFrom: todayDay.carryOverAppliedFrom ?? null,
  };
  const yesterdayDoc = yesterdayDay ? serializedDayToDoc(yesterdayDay) : null;
  const result = computeCarryOverPlans(yesterdayDoc, todayDoc, now);
  if (!result) return days;

  const legacy = syncLegacyTaskFields(result.plans);
  const updatedToday: SerializedWorkLogDay = {
    ...todayDay,
    plans: result.plans.map(serializePlan),
    tasks: legacy.tasks.map(serializeTaskFromDoc),
    deenTasks: legacy.deenTasks.map(serializeTaskFromDoc),
    fitnessTasks: legacy.fitnessTasks.map(serializeTaskFromDoc),
    carryOverAppliedFrom: result.carryOverAppliedFrom,
  };

  const rest = days.filter((day) => day.dateKey !== todayKey);
  return [...rest, updatedToday].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
}

function serializedDayToDoc(day: SerializedWorkLogDay): AdminWorkLogDoc {
  const plans: WorkLogPlan[] = (day.plans ?? createDefaultPlans()).map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    priority: p.priority,
    estimateMinutes: p.estimateMinutes,
    order: p.order,
    subTasks: p.subTasks.map((t) => ({
      id: t.id,
      text: t.text,
      done: t.done,
      priority: t.priority,
      estimateMinutes: t.estimateMinutes,
      createdAt: new Date(t.createdAt),
    })),
    createdAt: new Date(p.createdAt),
  }));

  return {
    dateKey: day.dateKey,
    totalMinutes: day.totalMinutes,
    timerStartedAt: day.timerStartedAt ? new Date(day.timerStartedAt) : null,
    tasks: [],
    plans,
    deenMinutes: day.deenMinutes,
    deenTimerStartedAt: day.deenTimerStartedAt ? new Date(day.deenTimerStartedAt) : null,
    fitnessMinutes: day.fitnessMinutes,
    fitnessTimerStartedAt: day.fitnessTimerStartedAt
      ? new Date(day.fitnessTimerStartedAt)
      : null,
    notes: day.notes,
    carryOverAppliedFrom: day.carryOverAppliedFrom ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function serializeTaskFromDoc(t: AdminWorkLogTask) {
  return {
    id: t.id,
    text: t.text,
    done: t.done,
    priority: t.priority,
    estimateMinutes: t.estimateMinutes,
    createdAt: t.createdAt.toISOString(),
  };
}
