import type { Collection, Filter, UpdateFilter } from "mongodb";
import { syncLegacyTaskFields, type WorkLogPlan } from "@/lib/work-log-plans";
import type { AdminWorkLogDoc } from "@/lib/admin-work-log";
import {
  addAzkarSecondsToProgress,
  AZKAR_EVENING_TASK_ID,
  AZKAR_MORNING_TASK_ID,
  ensureAzkarSubTasksOnDoc,
  getAzkarSecondsSpent,
  getAzkarTickedIds,
  isAzkarComplete,
  newAzkarProgress,
  setAzkarTaskDone,
  type AzkarPeriod,
} from "@/lib/azkar";
import { getAdhkarForPeriod } from "@/lib/data/azkar-config";

function adhkarItemsForPeriod(period: AzkarPeriod) {
  return getAdhkarForPeriod(period);
}

function taskIdForPeriod(period: AzkarPeriod): string {
  return period === "morning" ? AZKAR_MORNING_TASK_ID : AZKAR_EVENING_TASK_ID;
}

export async function persistDayPlansWithLegacy<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  dayFilter: Filter<T>,
  plans: WorkLogPlan[],
  now: Date
): Promise<void> {
  const legacy = syncLegacyTaskFields(plans);
  await coll.updateOne(dayFilter, {
    $set: {
      plans,
      tasks: legacy.tasks,
      deenTasks: legacy.deenTasks,
      fitnessTasks: legacy.fitnessTasks,
      updatedAt: now,
    },
  } as UpdateFilter<T>);
}

export async function ensureAzkarOnDayDoc<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  dayFilter: Filter<T>,
  doc: T | null,
  now: Date
): Promise<T | null> {
  if (!doc) return null;
  const plans = ensureAzkarSubTasksOnDoc(doc);
  const deenPlan = plans.find((p) => p.kind === "deen");
  const subTasks = deenPlan?.subTasks ?? [];
  const hasMorning = subTasks.some((t) => t.id === AZKAR_MORNING_TASK_ID);
  const hasEvening = subTasks.some((t) => t.id === AZKAR_EVENING_TASK_ID);
  const hadMorning = doc.plans
    ?.find((p) => p.kind === "deen")
    ?.subTasks?.some((t) => t.id === AZKAR_MORNING_TASK_ID);
  const hadEvening = doc.plans
    ?.find((p) => p.kind === "deen")
    ?.subTasks?.some((t) => t.id === AZKAR_EVENING_TASK_ID);
  if (hasMorning && hadMorning && hasEvening && hadEvening) return doc;
  await persistDayPlansWithLegacy(coll, dayFilter, plans, now);
  return (await coll.findOne(dayFilter)) as T | null;
}

export function buildAzkarResponse(doc: AdminWorkLogDoc, period: AzkarPeriod) {
  const items = adhkarItemsForPeriod(period);
  const tickedIds = getAzkarTickedIds(doc, period);
  const complete = isAzkarComplete(tickedIds, items);
  const plans = ensureAzkarSubTasksOnDoc(doc);
  const deen = plans.find((p) => p.kind === "deen");
  const taskId = taskIdForPeriod(period);
  const taskDone = deen?.subTasks.find((t) => t.id === taskId)?.done ?? false;

  return {
    period,
    items,
    tickedIds,
    complete,
    taskDone,
    secondsSpent: getAzkarSecondsSpent(doc, period),
    total: items.length,
    read: tickedIds.length,
  };
}

/** Adds elapsed reading time (in seconds) to the period's accumulated total. */
export async function addAzkarSeconds<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  dayFilter: Filter<T>,
  doc: T,
  period: AzkarPeriod,
  seconds: number,
  now: Date
): Promise<{ secondsSpent: number }> {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const progress = addAzkarSecondsToProgress(doc.azkarProgress, period, safeSeconds);

  await coll.updateOne(dayFilter, {
    $set: {
      azkarProgress: progress,
      updatedAt: now,
    },
  } as UpdateFilter<T>);

  return { secondsSpent: progress[period]?.secondsSpent ?? 0 };
}

export async function toggleAzkarAdhkar<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  dayFilter: Filter<T>,
  doc: T,
  period: AzkarPeriod,
  adhkarId: string,
  now: Date
): Promise<{ tickedIds: string[]; complete: boolean; taskDone: boolean }> {
  const items = adhkarItemsForPeriod(period);
  if (!items.some((item) => item.id === adhkarId)) {
    throw new Error("Adhkar not found");
  }

  const current = new Set(getAzkarTickedIds(doc, period));
  if (current.has(adhkarId)) current.delete(adhkarId);
  else current.add(adhkarId);

  const tickedIds = [...current];
  const complete = isAzkarComplete(tickedIds, items);
  const taskId = taskIdForPeriod(period);

  let plans = ensureAzkarSubTasksOnDoc(doc);
  plans = setAzkarTaskDone(plans, taskId, complete);

  await coll.updateOne(dayFilter, {
    $set: {
      azkarProgress: newAzkarProgress(doc.azkarProgress, period, tickedIds),
      updatedAt: now,
    },
  } as UpdateFilter<T>);

  await persistDayPlansWithLegacy(coll, dayFilter, plans, now);

  return { tickedIds, complete, taskDone: complete };
}
