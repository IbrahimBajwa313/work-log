import type { SerializedWorkLogDay } from "@/lib/admin-work-log";
import { emptyWorkLogDay } from "@/lib/admin-work-log";
import { capDailyMinutes } from "@/lib/work-log-time-guards";
import {
  createDefaultPlans,
  findPlan,
  isCorePlan,
  newCustomPlan,
  newSubTask,
  nextPlanOrder,
  resolvePlansFromDoc,
  serializePlan,
  syncLegacyTaskFields,
  type WorkLogPlan,
} from "@/lib/work-log-plans";
import type { AdminWorkLogDoc } from "@/lib/admin-work-log";

const TASK_LISTS = ["work", "deen", "fitness"] as const;

function timerFields(list?: (typeof TASK_LISTS)[number]) {
  if (list === "deen") {
    return { minutes: "deenMinutes" as const, startedAt: "deenTimerStartedAt" as const };
  }
  if (list === "fitness") {
    return { minutes: "fitnessMinutes" as const, startedAt: "fitnessTimerStartedAt" as const };
  }
  return { minutes: "totalMinutes" as const, startedAt: "timerStartedAt" as const };
}

function elapsedMinutes(startedAt: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60_000));
}

function dayToDoc(day: SerializedWorkLogDay): AdminWorkLogDoc {
  const plans: WorkLogPlan[] = (day.plans ?? createDefaultPlans().map(serializePlan)).map((p) => ({
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
    tasks: day.tasks.map((t) => ({
      ...t,
      createdAt: new Date(t.createdAt),
    })),
    plans,
    deenTasks: day.deenTasks.map((t) => ({ ...t, createdAt: new Date(t.createdAt) })),
    deenMinutes: day.deenMinutes,
    deenTimerStartedAt: day.deenTimerStartedAt ? new Date(day.deenTimerStartedAt) : null,
    fitnessTasks: day.fitnessTasks.map((t) => ({ ...t, createdAt: new Date(t.createdAt) })),
    fitnessMinutes: day.fitnessMinutes,
    fitnessTimerStartedAt: day.fitnessTimerStartedAt
      ? new Date(day.fitnessTimerStartedAt)
      : null,
    azkarProgress: {
      morning: { tickedIds: [], secondsSpent: day.azkarMorningSeconds },
      evening: { tickedIds: [], secondsSpent: day.azkarEveningSeconds },
    },
    notes: day.notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function docToDay(doc: AdminWorkLogDoc): SerializedWorkLogDay {
  const resolved = resolvePlansFromDoc(doc);
  const legacy = syncLegacyTaskFields(resolved);
  return {
    dateKey: doc.dateKey,
    totalMinutes: doc.totalMinutes ?? 0,
    timerStartedAt: doc.timerStartedAt ? doc.timerStartedAt.toISOString() : null,
    tasks: legacy.tasks.map((t) => ({
      id: t.id,
      text: t.text,
      done: t.done,
      priority: t.priority,
      estimateMinutes: t.estimateMinutes,
      createdAt: t.createdAt.toISOString(),
    })),
    plans: resolved.map(serializePlan),
    deenTasks: legacy.deenTasks.map((t) => ({
      id: t.id,
      text: t.text,
      done: t.done,
      priority: t.priority,
      estimateMinutes: t.estimateMinutes,
      createdAt: t.createdAt.toISOString(),
    })),
    deenMinutes: doc.deenMinutes ?? 0,
    deenTimerStartedAt: doc.deenTimerStartedAt
      ? doc.deenTimerStartedAt.toISOString()
      : null,
    fitnessTasks: legacy.fitnessTasks.map((t) => ({
      id: t.id,
      text: t.text,
      done: t.done,
      priority: t.priority,
      estimateMinutes: t.estimateMinutes,
      createdAt: t.createdAt.toISOString(),
    })),
    fitnessMinutes: doc.fitnessMinutes ?? 0,
    fitnessTimerStartedAt: doc.fitnessTimerStartedAt
      ? doc.fitnessTimerStartedAt.toISOString()
      : null,
    azkarMorningSeconds:
      typeof doc.azkarProgress?.morning?.secondsSpent === "number"
        ? Math.round(doc.azkarProgress.morning.secondsSpent)
        : 0,
    azkarEveningSeconds:
      typeof doc.azkarProgress?.evening?.secondsSpent === "number"
        ? Math.round(doc.azkarProgress.evening.secondsSpent)
        : 0,
    notes: doc.notes ?? "",
  };
}

function applyPlanMutation(
  doc: AdminWorkLogDoc,
  body: Record<string, unknown>,
  now: Date
): WorkLogPlan[] {
  let plans = resolvePlansFromDoc(doc);

  switch (body.action) {
    case "addPlan": {
      plans = [
        ...plans,
        newCustomPlan(
          String(body.title),
          (body.priority as WorkLogPlan["priority"]) ?? "medium",
          (body.estimateMinutes as number | null) ?? null,
          nextPlanOrder(plans),
          now
        ),
      ];
      break;
    }
    case "updatePlan": {
      const planId = String(body.planId);
      const idx = plans.findIndex((p) => p.id === planId);
      if (idx < 0) throw new Error("Plan not found");
      const current = plans[idx];
      plans = [...plans];
      plans[idx] = {
        ...current,
        title: body.title !== undefined ? String(body.title) : current.title,
        priority:
          body.priority !== undefined
            ? (body.priority as WorkLogPlan["priority"])
            : current.priority,
        estimateMinutes:
          body.estimateMinutes !== undefined
            ? (body.estimateMinutes as number | null)
            : current.estimateMinutes,
      };
      break;
    }
    case "deletePlan": {
      const planId = String(body.planId);
      if (isCorePlan(planId)) throw new Error("Cannot delete a core daily plan");
      const next = plans.filter((p) => p.id !== planId);
      if (next.length === plans.length) throw new Error("Plan not found");
      plans = next;
      break;
    }
    case "addTask": {
      const plan = findPlan(plans, {
        planId: body.planId as string | undefined,
        list: body.list as "work" | "deen" | "fitness" | undefined,
      });
      if (!plan) throw new Error("Plan not found");
      const idx = plans.findIndex((p) => p.id === plan.id);
      plans = [...plans];
      plans[idx] = {
        ...plan,
        subTasks: [
          ...plan.subTasks,
          newSubTask(
            String(body.text),
            (body.priority as WorkLogPlan["priority"]) ?? "medium",
            (body.estimateMinutes as number | null) ?? null,
            now
          ),
        ],
      };
      break;
    }
    case "updateTask": {
      const plan = findPlan(plans, {
        planId: body.planId as string | undefined,
        list: body.list as "work" | "deen" | "fitness" | undefined,
      });
      if (!plan) throw new Error("Plan not found");
      const taskId = String(body.taskId);
      const taskIdx = plan.subTasks.findIndex((t) => t.id === taskId);
      if (taskIdx < 0) throw new Error("Task not found");
      const current = plan.subTasks[taskIdx];
      const pIdx = plans.findIndex((p) => p.id === plan.id);
      const subTasks = [...plan.subTasks];
      subTasks[taskIdx] = {
        ...current,
        text: body.text !== undefined ? String(body.text) : current.text,
        priority:
          body.priority !== undefined
            ? (body.priority as WorkLogPlan["priority"])
            : current.priority,
        estimateMinutes:
          body.estimateMinutes !== undefined
            ? (body.estimateMinutes as number | null)
            : current.estimateMinutes,
      };
      plans = [...plans];
      plans[pIdx] = { ...plan, subTasks };
      break;
    }
    case "setTaskPriority": {
      const plan = findPlan(plans, {
        planId: body.planId as string | undefined,
        list: body.list as "work" | "deen" | "fitness" | undefined,
      });
      if (!plan) throw new Error("Plan not found");
      const taskId = String(body.taskId);
      const taskIdx = plan.subTasks.findIndex((t) => t.id === taskId);
      if (taskIdx < 0) throw new Error("Task not found");
      const pIdx = plans.findIndex((p) => p.id === plan.id);
      const subTasks = [...plan.subTasks];
      subTasks[taskIdx] = {
        ...subTasks[taskIdx],
        priority: body.priority as WorkLogPlan["priority"],
      };
      plans = [...plans];
      plans[pIdx] = { ...plan, subTasks };
      break;
    }
    case "toggleTask": {
      const plan = findPlan(plans, {
        planId: body.planId as string | undefined,
        list: body.list as "work" | "deen" | "fitness" | undefined,
      });
      if (!plan) throw new Error("Plan not found");
      const taskId = String(body.taskId);
      const taskIdx = plan.subTasks.findIndex((t) => t.id === taskId);
      if (taskIdx < 0) throw new Error("Task not found");
      const pIdx = plans.findIndex((p) => p.id === plan.id);
      const subTasks = [...plan.subTasks];
      subTasks[taskIdx] = { ...subTasks[taskIdx], done: !subTasks[taskIdx].done };
      plans = [...plans];
      plans[pIdx] = { ...plan, subTasks };
      break;
    }
    case "deleteTask": {
      const plan = findPlan(plans, {
        planId: body.planId as string | undefined,
        list: body.list as "work" | "deen" | "fitness" | undefined,
      });
      if (!plan) throw new Error("Plan not found");
      const taskId = String(body.taskId);
      const pIdx = plans.findIndex((p) => p.id === plan.id);
      const next = plan.subTasks.filter((t) => t.id !== taskId);
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

/** Apply a work-log PATCH action locally for offline optimistic updates. */
export function applyClientWorkLogAction(
  day: SerializedWorkLogDay | null,
  dateKey: string,
  body: Record<string, unknown>,
  allDays: SerializedWorkLogDay[] = []
): SerializedWorkLogDay {
  const now = new Date();
  let doc = dayToDoc(day ?? emptyWorkLogDay(dateKey));

  switch (body.action) {
    case "startTimer": {
      const fields = timerFields(body.list as (typeof TASK_LISTS)[number] | undefined);
      for (const d of allDays) {
        const other = dayToDoc(d);
        const started = other[fields.startedAt];
        if (started) {
          other[fields.minutes] = capDailyMinutes(
            (other[fields.minutes] ?? 0) + elapsedMinutes(started, now)
          );
          other[fields.startedAt] = null;
        }
      }
      doc[fields.startedAt] = now;
      break;
    }
    case "stopTimer": {
      const fields = timerFields(body.list as (typeof TASK_LISTS)[number] | undefined);
      let target = doc;
      const started = doc[fields.startedAt];
      if (!started) {
        const running = allDays.find((d) => {
          const o = dayToDoc(d);
          return o[fields.startedAt] != null;
        });
        if (running) {
          target = dayToDoc(running);
          doc = target;
        }
      }
      const startedAt = target[fields.startedAt];
      if (startedAt) {
        target[fields.minutes] = capDailyMinutes(
          (target[fields.minutes] ?? 0) + elapsedMinutes(startedAt, now)
        );
        target[fields.startedAt] = null;
      }
      return docToDay(target);
    }
    case "adjustMinutes": {
      const fields = timerFields(body.list as (typeof TASK_LISTS)[number] | undefined);
      const mode = body.mode as "add" | "set";
      const minutes = Number(body.minutes);
      const rawNext =
        mode === "set"
          ? Math.max(0, minutes)
          : Math.max(0, (doc[fields.minutes] ?? 0) + minutes);
      doc[fields.minutes] = capDailyMinutes(rawNext);
      if (mode === "set") {
        doc[fields.startedAt] = null;
      }
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
      const plans = applyPlanMutation(doc, body, now);
      const legacy = syncLegacyTaskFields(plans);
      doc.plans = plans;
      doc.tasks = legacy.tasks;
      doc.deenTasks = legacy.deenTasks;
      doc.fitnessTasks = legacy.fitnessTasks;
      break;
    }
    case "setNotes": {
      doc.notes = String(body.notes ?? "");
      break;
    }
    default:
      break;
  }

  doc.updatedAt = now;
  return docToDay(doc);
}
