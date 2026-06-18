import { randomUUID } from "crypto";
import type { Collection, Filter, UpdateFilter } from "mongodb";
import { z } from "zod";
import {
  emptyWorkLogDay,
  serializeWorkLogDay,
  WORK_LOG_PRIORITIES,
  type AdminWorkLogDoc,
} from "@/lib/admin-work-log";
import {
  emptyUserWorkLogDay,
  resolvePersonId,
  serializeUserWorkLogDay,
  type UserWorkLogDoc,
} from "@/lib/user-work-log";
import { resolveAdminPersonId } from "@/lib/admin-work-log-settings";
import {
  createDefaultPlans,
  findPlan,
  isCorePlan,
  newCustomPlan,
  newSubTask,
  nextPlanOrder,
  resolvePlansFromDoc,
  syncLegacyTaskFields,
  type WorkLogPlan,
} from "@/lib/work-log-plans";

/** "work" → business plan, "deen" → Deen plan, "fitness" → fitness plan. */
const TASK_LISTS = ["work", "deen", "fitness"] as const;

function timerFields(list?: (typeof TASK_LISTS)[number]): TimerFields {
  if (list === "deen") {
    return { minutes: "deenMinutes", startedAt: "deenTimerStartedAt" };
  }
  if (list === "fitness") {
    return { minutes: "fitnessMinutes", startedAt: "fitnessTimerStartedAt" };
  }
  return { minutes: "totalMinutes", startedAt: "timerStartedAt" };
}

export const workLogActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("startTimer"), list: z.enum(TASK_LISTS).optional() }),
  z.object({ action: z.literal("stopTimer"), list: z.enum(TASK_LISTS).optional() }),
  z.object({
    action: z.literal("adjustMinutes"),
    mode: z.enum(["add", "set"]),
    minutes: z.coerce.number().int().min(-24 * 60).max(24 * 60),
    list: z.enum(TASK_LISTS).optional(),
  }),
  z.object({
    action: z.literal("addTask"),
    text: z.string().trim().min(1).max(500),
    priority: z.enum(WORK_LOG_PRIORITIES).optional(),
    estimateMinutes: z.coerce.number().int().min(1).max(24 * 60).nullish(),
    list: z.enum(TASK_LISTS).optional(),
    planId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("updateTask"),
    taskId: z.string().min(1),
    text: z.string().trim().min(1).max(500).optional(),
    priority: z.enum(WORK_LOG_PRIORITIES).optional(),
    estimateMinutes: z.coerce.number().int().min(1).max(24 * 60).nullish(),
    list: z.enum(TASK_LISTS).optional(),
    planId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("setTaskPriority"),
    taskId: z.string().min(1),
    priority: z.enum(WORK_LOG_PRIORITIES),
    list: z.enum(TASK_LISTS).optional(),
    planId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("toggleTask"),
    taskId: z.string().min(1),
    list: z.enum(TASK_LISTS).optional(),
    planId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("deleteTask"),
    taskId: z.string().min(1),
    list: z.enum(TASK_LISTS).optional(),
    planId: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("addPlan"),
    title: z.string().trim().min(1).max(120),
    priority: z.enum(WORK_LOG_PRIORITIES).optional(),
    estimateMinutes: z.coerce.number().int().min(1).max(24 * 60).nullish(),
  }),
  z.object({
    action: z.literal("updatePlan"),
    planId: z.string().min(1),
    title: z.string().trim().min(1).max(120).optional(),
    priority: z.enum(WORK_LOG_PRIORITIES).optional(),
    estimateMinutes: z.coerce.number().int().min(1).max(24 * 60).nullish(),
  }),
  z.object({
    action: z.literal("deletePlan"),
    planId: z.string().min(1),
  }),
  z.object({ action: z.literal("setNotes"), notes: z.string().max(5000) }),
]);

function elapsedMinutes(startedAt: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60_000));
}

async function persistDayPlans<T extends AdminWorkLogDoc>(
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

function applyPlanMutation(
  doc: AdminWorkLogDoc,
  body: z.infer<typeof workLogActionSchema>,
  now: Date
): WorkLogPlan[] {
  let plans = resolvePlansFromDoc(doc);

  switch (body.action) {
    case "addPlan": {
      plans = [
        ...plans,
        newCustomPlan(
          body.title,
          body.priority ?? "medium",
          body.estimateMinutes ?? null,
          nextPlanOrder(plans),
          now
        ),
      ];
      break;
    }
    case "updatePlan": {
      const idx = plans.findIndex((p) => p.id === body.planId);
      if (idx < 0) throw new Error("Plan not found");
      const current = plans[idx];
      plans = [...plans];
      plans[idx] = {
        ...current,
        title: body.title ?? current.title,
        priority: body.priority ?? current.priority,
        estimateMinutes:
          body.estimateMinutes !== undefined
            ? body.estimateMinutes ?? null
            : current.estimateMinutes,
      };
      break;
    }
    case "deletePlan": {
      if (isCorePlan(body.planId)) throw new Error("Cannot delete a core daily plan");
      const next = plans.filter((p) => p.id !== body.planId);
      if (next.length === plans.length) throw new Error("Plan not found");
      plans = next;
      break;
    }
    case "addTask": {
      const plan = findPlan(plans, { planId: body.planId, list: body.list });
      if (!plan) throw new Error("Plan not found");
      const idx = plans.findIndex((p) => p.id === plan.id);
      plans = [...plans];
      plans[idx] = {
        ...plan,
        subTasks: [
          ...plan.subTasks,
          newSubTask(
            body.text,
            body.priority ?? "medium",
            body.estimateMinutes ?? null,
            now
          ),
        ],
      };
      break;
    }
    case "updateTask": {
      const plan = findPlan(plans, { planId: body.planId, list: body.list });
      if (!plan) throw new Error("Plan not found");
      const taskIdx = plan.subTasks.findIndex((t) => t.id === body.taskId);
      if (taskIdx < 0) throw new Error("Task not found");
      const current = plan.subTasks[taskIdx];
      const pIdx = plans.findIndex((p) => p.id === plan.id);
      const subTasks = [...plan.subTasks];
      subTasks[taskIdx] = {
        ...current,
        text: body.text ?? current.text,
        priority: body.priority ?? current.priority,
        estimateMinutes:
          body.estimateMinutes !== undefined
            ? body.estimateMinutes ?? null
            : current.estimateMinutes,
      };
      plans = [...plans];
      plans[pIdx] = { ...plan, subTasks };
      break;
    }
    case "setTaskPriority": {
      const plan = findPlan(plans, { planId: body.planId, list: body.list });
      if (!plan) throw new Error("Plan not found");
      const taskIdx = plan.subTasks.findIndex((t) => t.id === body.taskId);
      if (taskIdx < 0) throw new Error("Task not found");
      const pIdx = plans.findIndex((p) => p.id === plan.id);
      const subTasks = [...plan.subTasks];
      subTasks[taskIdx] = { ...subTasks[taskIdx], priority: body.priority };
      plans = [...plans];
      plans[pIdx] = { ...plan, subTasks };
      break;
    }
    case "toggleTask": {
      const plan = findPlan(plans, { planId: body.planId, list: body.list });
      if (!plan) throw new Error("Plan not found");
      const taskIdx = plan.subTasks.findIndex((t) => t.id === body.taskId);
      if (taskIdx < 0) throw new Error("Task not found");
      const pIdx = plans.findIndex((p) => p.id === plan.id);
      const subTasks = [...plan.subTasks];
      subTasks[taskIdx] = { ...subTasks[taskIdx], done: !subTasks[taskIdx].done };
      plans = [...plans];
      plans[pIdx] = { ...plan, subTasks };
      break;
    }
    case "deleteTask": {
      const plan = findPlan(plans, { planId: body.planId, list: body.list });
      if (!plan) throw new Error("Plan not found");
      const pIdx = plans.findIndex((p) => p.id === plan.id);
      const next = plan.subTasks.filter((t) => t.id !== body.taskId);
      if (next.length === plan.subTasks.length) throw new Error("Task not found");
      plans = [...plans];
      plans[pIdx] = { ...plan, subTasks: next };
      break;
    }
    default:
      throw new Error("Not a plan mutation");
  }

  return plans;
}

type TimerFields = {
  minutes: "totalMinutes" | "deenMinutes" | "fitnessMinutes";
  startedAt: "timerStartedAt" | "deenTimerStartedAt" | "fitnessTimerStartedAt";
};

async function finalizeRunningTimers<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  scopeFilter: Filter<T>,
  fields: TimerFields
): Promise<void> {
  const now = new Date();
  const running = await coll
    .find({ ...scopeFilter, [fields.startedAt]: { $ne: null } } as Filter<T>)
    .toArray();
  for (const doc of running) {
    const startedAt = doc[fields.startedAt];
    if (!startedAt) continue;
    await coll.updateOne(
      { dateKey: doc.dateKey, ...scopeFilter } as Filter<T>,
      {
        $inc: { [fields.minutes]: elapsedMinutes(startedAt, now) },
        $set: { [fields.startedAt]: null, updatedAt: now },
      } as UpdateFilter<T>
    );
  }
}

/** Stops a running timer on the requested day, or any other day in scope (e.g. left on overnight). */
async function stopRunningTimer<T extends AdminWorkLogDoc>(
  coll: Collection<T>,
  scopeFilter: Filter<T>,
  dayFilter: Filter<T>,
  dateKey: string,
  fields: TimerFields,
  now: Date
): Promise<string> {
  const doc = await coll.findOne(dayFilter);
  let startedAt = doc?.[fields.startedAt];
  let stopFilter: Filter<T> = dayFilter;
  let responseDateKey = dateKey;

  if (!startedAt) {
    const running = await coll.findOne({
      ...scopeFilter,
      [fields.startedAt]: { $ne: null },
    } as Filter<T>);
    if (running) {
      startedAt = running[fields.startedAt] ?? null;
      responseDateKey = running.dateKey;
      stopFilter = { dateKey: running.dateKey, ...scopeFilter } as Filter<T>;
    }
  }

  if (startedAt) {
    await coll.updateOne(stopFilter, {
      $inc: { [fields.minutes]: elapsedMinutes(startedAt, now) },
      $set: { [fields.startedAt]: null, updatedAt: now },
    } as UpdateFilter<T>);
  }

  return responseDateKey;
}

async function getOrCreateAdminDay(
  coll: Collection<AdminWorkLogDoc>,
  dateKey: string,
  personId: string
): Promise<AdminWorkLogDoc> {
  const now = new Date();
  const result = await coll.findOneAndUpdate(
    { personId, dateKey },
    {
      $setOnInsert: {
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

async function getOrCreateUserDay(
  coll: Collection<UserWorkLogDoc>,
  userId: string,
  dateKey: string,
  personId: string
): Promise<UserWorkLogDoc> {
  const now = new Date();
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

export async function applyWorkLogAction(
  coll: Collection<AdminWorkLogDoc>,
  dateKey: string,
  body: z.infer<typeof workLogActionSchema>,
  personIdInput?: string | null
): Promise<ReturnType<typeof serializeWorkLogDay>> {
  const now = new Date();
  const personId = resolveAdminPersonId(personIdInput);
  const scopeFilter = { personId } as Filter<AdminWorkLogDoc>;
  const dayFilter = { personId, dateKey } as Filter<AdminWorkLogDoc>;
  let responseDateKey = dateKey;

  switch (body.action) {
    case "startTimer": {
      const fields = timerFields(body.list);
      await finalizeRunningTimers(coll, scopeFilter, fields);
      await getOrCreateAdminDay(coll, dateKey, personId);
      await coll.updateOne(dayFilter, { $set: { [fields.startedAt]: now, updatedAt: now } });
      break;
    }
    case "stopTimer": {
      const fields = timerFields(body.list);
      responseDateKey = await stopRunningTimer(coll, scopeFilter, dayFilter, dateKey, fields, now);
      break;
    }
    case "adjustMinutes": {
      const fields = timerFields(body.list);
      const doc = await getOrCreateAdminDay(coll, dateKey, personId);
      const next =
        body.mode === "set"
          ? Math.max(0, body.minutes)
          : Math.max(0, (doc[fields.minutes] ?? 0) + body.minutes);
      await coll.updateOne(dayFilter, { $set: { [fields.minutes]: next, updatedAt: now } });
      break;
    }
    case "addTask":
    case "updateTask":
    case "setTaskPriority":
    case "toggleTask":
    case "deleteTask":
    case "addPlan":
    case "updatePlan":
    case "deletePlan": {
      const doc = await getOrCreateAdminDay(coll, dateKey, personId);
      const plans = applyPlanMutation(doc, body, now);
      await persistDayPlans(coll, dayFilter, plans, now);
      break;
    }
    case "setNotes": {
      await getOrCreateAdminDay(coll, dateKey, personId);
      await coll.updateOne(dayFilter, { $set: { notes: body.notes, updatedAt: now } });
      break;
    }
  }

  const updated = await coll.findOne({ personId, dateKey: responseDateKey } as Filter<AdminWorkLogDoc>);
  return updated ? serializeWorkLogDay(updated) : emptyWorkLogDay(responseDateKey);
}

export async function applyUserWorkLogAction(
  coll: Collection<UserWorkLogDoc>,
  userId: string,
  dateKey: string,
  body: z.infer<typeof workLogActionSchema>,
  personIdInput?: string | null
): Promise<ReturnType<typeof serializeUserWorkLogDay>> {
  const now = new Date();
  const personId = resolvePersonId(personIdInput);
  const scopeFilter = { userId, personId } as Filter<UserWorkLogDoc>;
  const dayFilter = { userId, personId, dateKey } as Filter<UserWorkLogDoc>;
  let responseDateKey = dateKey;

  switch (body.action) {
    case "startTimer": {
      const fields = timerFields(body.list);
      await finalizeRunningTimers(coll, scopeFilter, fields);
      await getOrCreateUserDay(coll, userId, dateKey, personId);
      await coll.updateOne(dayFilter, { $set: { [fields.startedAt]: now, updatedAt: now } });
      break;
    }
    case "stopTimer": {
      const fields = timerFields(body.list);
      responseDateKey = await stopRunningTimer(coll, scopeFilter, dayFilter, dateKey, fields, now);
      break;
    }
    case "adjustMinutes": {
      const fields = timerFields(body.list);
      const doc = await getOrCreateUserDay(coll, userId, dateKey, personId);
      const next =
        body.mode === "set"
          ? Math.max(0, body.minutes)
          : Math.max(0, (doc[fields.minutes] ?? 0) + body.minutes);
      await coll.updateOne(dayFilter, { $set: { [fields.minutes]: next, updatedAt: now } });
      break;
    }
    case "addTask":
    case "updateTask":
    case "setTaskPriority":
    case "toggleTask":
    case "deleteTask":
    case "addPlan":
    case "updatePlan":
    case "deletePlan": {
      const doc = await getOrCreateUserDay(coll, userId, dateKey, personId);
      const plans = applyPlanMutation(doc, body, now);
      await persistDayPlans(coll, dayFilter, plans, now);
      break;
    }
    case "setNotes": {
      await getOrCreateUserDay(coll, userId, dateKey, personId);
      await coll.updateOne(dayFilter, { $set: { notes: body.notes, updatedAt: now } });
      break;
    }
  }

  const updated = await coll.findOne({
    userId,
    personId,
    dateKey: responseDateKey,
  } as Filter<UserWorkLogDoc>);
  return updated ? serializeUserWorkLogDay(updated) : emptyUserWorkLogDay(responseDateKey);
}
