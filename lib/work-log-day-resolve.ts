import type { Filter, Collection } from "mongodb";
import type { AdminWorkLogDoc } from "@/lib/admin-work-log";
import {
  createDefaultPlans,
  resolvePlansFromDoc,
  syncLegacyTaskFields,
  type WorkLogPlan,
} from "@/lib/work-log-plans";
import { PRIMARY_PERSON_ID } from "@/lib/user-work-log-settings";
import type { UserWorkLogDoc } from "@/lib/user-work-log";

function mergePlanSubTasks(a: WorkLogPlan, b: WorkLogPlan): WorkLogPlan {
  const seen = new Set(a.subTasks.map((t) => t.id));
  const subTasks = [...a.subTasks];
  for (const task of b.subTasks) {
    if (!seen.has(task.id)) {
      seen.add(task.id);
      subTasks.push(task);
    }
  }
  return { ...a, subTasks };
}

function mergeWorkLogPlans(a: WorkLogPlan[], b: WorkLogPlan[]): WorkLogPlan[] {
  const byId = new Map<string, WorkLogPlan>();
  for (const plan of [...a, ...b]) {
    const existing = byId.get(plan.id);
    byId.set(plan.id, existing ? mergePlanSubTasks(existing, plan) : { ...plan, subTasks: [...plan.subTasks] });
  }
  return [...byId.values()].sort((x, y) => x.order - y.order);
}

/** Merge two day documents (e.g. legacy row + personId row) into one payload. */
export function mergeWorkLogDayDocs(
  primary: AdminWorkLogDoc,
  secondary: AdminWorkLogDoc,
  now: Date
): Omit<AdminWorkLogDoc, "dateKey" | "createdAt"> & { personId: string } {
  const mergedPlans = mergeWorkLogPlans(
    resolvePlansFromDoc(primary),
    resolvePlansFromDoc(secondary)
  );
  const legacy = syncLegacyTaskFields(mergedPlans);

  return {
    personId: PRIMARY_PERSON_ID,
    totalMinutes: Math.max(primary.totalMinutes ?? 0, secondary.totalMinutes ?? 0),
    timerStartedAt: primary.timerStartedAt ?? secondary.timerStartedAt ?? null,
    tasks: legacy.tasks,
    plans: mergedPlans,
    deenTasks: legacy.deenTasks,
    deenMinutes: Math.max(primary.deenMinutes ?? 0, secondary.deenMinutes ?? 0),
    deenTimerStartedAt: primary.deenTimerStartedAt ?? secondary.deenTimerStartedAt ?? null,
    fitnessTasks: legacy.fitnessTasks,
    fitnessMinutes: Math.max(primary.fitnessMinutes ?? 0, secondary.fitnessMinutes ?? 0),
    fitnessTimerStartedAt: primary.fitnessTimerStartedAt ?? secondary.fitnessTimerStartedAt ?? null,
    azkarProgress: primary.azkarProgress ?? secondary.azkarProgress,
    notes:
      (primary.notes ?? "").length >= (secondary.notes ?? "").length
        ? (primary.notes ?? "")
        : (secondary.notes ?? ""),
    updatedAt: now,
  };
}

export function dayDocFilter(doc: UserWorkLogDoc & { _id?: unknown }): Filter<UserWorkLogDoc> {
  if (doc._id) return { _id: doc._id } as Filter<UserWorkLogDoc>;
  return {
    userId: doc.userId,
    personId: doc.personId ?? PRIMARY_PERSON_ID,
    dateKey: doc.dateKey,
  } as Filter<UserWorkLogDoc>;
}

/**
 * Find the single day row to read/write. Handles legacy rows (no personId) and
 * duplicate rows created before migration.
 */
export async function resolveUserDayForWrite(
  coll: Collection<UserWorkLogDoc>,
  userId: string,
  dateKey: string,
  personId: string
): Promise<UserWorkLogDoc> {
  const now = new Date();
  const personDoc = await coll.findOne({ userId, personId, dateKey });

  if (personId === PRIMARY_PERSON_ID) {
    const legacyDoc = await coll.findOne({
      userId,
      dateKey,
      personId: { $exists: false },
    });

    if (legacyDoc && personDoc && String(legacyDoc._id) !== String(personDoc._id)) {
      const merged = mergeWorkLogDayDocs(legacyDoc, personDoc, now);
      await coll.updateOne(
        { _id: legacyDoc._id },
        { $set: { ...merged, userId, dateKey } }
      );
      await coll.deleteOne({ _id: personDoc._id });
      const doc = await coll.findOne({ _id: legacyDoc._id });
      if (!doc) throw new Error(`Failed to merge work log day ${dateKey}`);
      return doc;
    }

    if (legacyDoc && !personDoc) {
      await coll.updateOne(
        { _id: legacyDoc._id },
        { $set: { personId: PRIMARY_PERSON_ID, updatedAt: now } }
      );
      const doc = await coll.findOne({ _id: legacyDoc._id });
      if (!doc) throw new Error(`Failed to load work log day ${dateKey}`);
      return doc;
    }
  }

  if (personDoc) return personDoc;

  const result = await coll.findOneAndUpdate(
    { userId, personId, dateKey },
    {
      $setOnInsert: {
        userId,
        personId,
        dateKey,
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
  if (!result) throw new Error(`Failed to upsert work log day ${dateKey}`);
  return result;
}

/** Collapse multiple DB rows for the same date into one logical day (read path). */
export function collapseWorkLogDayRows(rows: UserWorkLogDoc[]): UserWorkLogDoc {
  if (rows.length <= 1) return rows[0];
  const now = new Date();
  let merged = rows[0];
  for (let i = 1; i < rows.length; i++) {
    const payload = mergeWorkLogDayDocs(merged, rows[i], now);
    merged = { ...merged, ...payload, userId: merged.userId, dateKey: merged.dateKey };
  }
  return merged;
}
