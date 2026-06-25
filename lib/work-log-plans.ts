import { randomUUID as nodeRandomUUID } from "crypto";

function newId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return nodeRandomUUID();
}
import type { AdminWorkLogDoc, AdminWorkLogTask, WorkLogPriority } from "@/lib/admin-work-log";
import { WORK_LOG_PRIORITIES } from "@/lib/admin-work-log";

export const PLAN_KINDS = ["work", "deen", "fitness", "custom"] as const;
export type WorkLogPlanKind = (typeof PLAN_KINDS)[number];

export const DEFAULT_WORK_PLAN_ID = "plan-work";
export const DEFAULT_DEEN_PLAN_ID = "plan-deen";
export const DEFAULT_FITNESS_PLAN_ID = "plan-fitness";

export type WorkLogPlan = {
  id: string;
  kind: WorkLogPlanKind;
  title: string;
  priority: WorkLogPriority;
  estimateMinutes: number | null;
  order: number;
  subTasks: AdminWorkLogTask[];
  createdAt: Date;
};

export type SerializedWorkLogPlan = {
  id: string;
  kind: WorkLogPlanKind;
  title: string;
  priority: WorkLogPriority;
  estimateMinutes: number | null;
  order: number;
  subTasks: {
    id: string;
    text: string;
    done: boolean;
    priority: WorkLogPriority;
    estimateMinutes: number | null;
    createdAt: string;
  }[];
  createdAt: string;
};

function serializeSubTask(t: AdminWorkLogTask) {
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

export function serializePlan(plan: WorkLogPlan): SerializedWorkLogPlan {
  const kind: WorkLogPlanKind =
    plan.kind === "deen"
      ? "deen"
      : plan.kind === "fitness"
        ? "fitness"
        : plan.kind === "custom"
          ? "custom"
          : "work";
  return {
    id: plan.id,
    kind,
    title: plan.title,
    priority: WORK_LOG_PRIORITIES.includes(plan.priority) ? plan.priority : "medium",
    estimateMinutes:
      typeof plan.estimateMinutes === "number" && plan.estimateMinutes > 0
        ? Math.round(plan.estimateMinutes)
        : null,
    order: plan.order ?? 0,
    subTasks: (plan.subTasks ?? []).map(serializeSubTask),
    createdAt:
      plan.createdAt instanceof Date
        ? plan.createdAt.toISOString()
        : new Date(plan.createdAt).toISOString(),
  };
}

export function createDefaultPlans(now = new Date()): WorkLogPlan[] {
  return [
    {
      id: DEFAULT_WORK_PLAN_ID,
      kind: "work",
      title: "Business",
      priority: "high",
      estimateMinutes: null,
      order: 0,
      subTasks: [],
      createdAt: now,
    },
    {
      id: DEFAULT_DEEN_PLAN_ID,
      kind: "deen",
      title: "Deen",
      priority: "high",
      estimateMinutes: null,
      order: 1,
      subTasks: [],
      createdAt: now,
    },
    {
      id: DEFAULT_FITNESS_PLAN_ID,
      kind: "fitness",
      title: "Fitness",
      priority: "high",
      estimateMinutes: null,
      order: 2,
      subTasks: [],
      createdAt: now,
    },
  ];
}

function ensureCorePlans(plans: WorkLogPlan[], doc: AdminWorkLogDoc): WorkLogPlan[] {
  const now = new Date();
  let next = [...plans].sort((a, b) => a.order - b.order);

  const deenIdx = next.findIndex((p) => p.id === DEFAULT_DEEN_PLAN_ID);
  if (deenIdx >= 0 && next[deenIdx].title === "Ilme Deen") {
    next[deenIdx] = { ...next[deenIdx], title: "Deen" };
  }

  if (!next.some((p) => p.id === DEFAULT_FITNESS_PLAN_ID)) {
    next.push({
      id: DEFAULT_FITNESS_PLAN_ID,
      kind: "fitness",
      title: "Fitness",
      priority: "high",
      estimateMinutes: null,
      order: 2,
      subTasks: [...(doc.fitnessTasks ?? [])],
      createdAt: now,
    });
    next = next.sort((a, b) => a.order - b.order);
  }

  return next;
}

/** Build plans from stored `plans` or legacy `tasks` / `deenTasks`. */
export function resolvePlansFromDoc(doc: AdminWorkLogDoc): WorkLogPlan[] {
  if (doc.plans?.length) {
    return ensureCorePlans(doc.plans, doc);
  }
  const now = new Date();
  const defaults = createDefaultPlans(now);
  const work = defaults.find((p) => p.id === DEFAULT_WORK_PLAN_ID)!;
  const deen = defaults.find((p) => p.id === DEFAULT_DEEN_PLAN_ID)!;
  const fitness = defaults.find((p) => p.id === DEFAULT_FITNESS_PLAN_ID)!;
  work.subTasks = [...(doc.tasks ?? [])];
  deen.subTasks = [...(doc.deenTasks ?? [])];
  fitness.subTasks = [...(doc.fitnessTasks ?? [])];
  return defaults;
}

/** Keep legacy task arrays in sync for older clients / queries. */
export function syncLegacyTaskFields(plans: WorkLogPlan[]): {
  tasks: AdminWorkLogTask[];
  deenTasks: AdminWorkLogTask[];
  fitnessTasks: AdminWorkLogTask[];
} {
  const work = plans.find((p) => p.kind === "work");
  const deen = plans.find((p) => p.kind === "deen");
  const fitness = plans.find((p) => p.kind === "fitness");
  return {
    tasks: work?.subTasks ?? [],
    deenTasks: deen?.subTasks ?? [],
    fitnessTasks: fitness?.subTasks ?? [],
  };
}

export function planIdForTaskList(list: "work" | "deen" | "fitness"): string {
  if (list === "deen") return DEFAULT_DEEN_PLAN_ID;
  if (list === "fitness") return DEFAULT_FITNESS_PLAN_ID;
  return DEFAULT_WORK_PLAN_ID;
}

export function findPlan(
  plans: WorkLogPlan[],
  opts: { planId?: string; list?: "work" | "deen" | "fitness" }
): WorkLogPlan | undefined {
  if (opts.planId) return plans.find((p) => p.id === opts.planId);
  if (opts.list) {
    const list = opts.list;
    const byId = plans.find((p) => p.id === planIdForTaskList(list));
    if (byId) return byId;
    if (list === "deen") return plans.find((p) => p.kind === "deen");
    if (list === "fitness") return plans.find((p) => p.kind === "fitness");
    if (list === "work") return plans.find((p) => p.kind === "work");
  }
  return undefined;
}

export function isCorePlan(planId: string): boolean {
  return (
    planId === DEFAULT_WORK_PLAN_ID ||
    planId === DEFAULT_DEEN_PLAN_ID ||
    planId === DEFAULT_FITNESS_PLAN_ID
  );
}

export function nextPlanOrder(plans: WorkLogPlan[]): number {
  if (!plans.length) return 0;
  return Math.max(...plans.map((p) => p.order)) + 1;
}

export function newSubTask(
  text: string,
  priority: WorkLogPriority,
  estimateMinutes: number | null,
  now: Date
): AdminWorkLogTask {
  return {
    id: newId(),
    text,
    done: false,
    priority,
    estimateMinutes,
    createdAt: now,
  };
}

export function newCustomPlan(
  title: string,
  priority: WorkLogPriority,
  estimateMinutes: number | null,
  order: number,
  now: Date
): WorkLogPlan {
  return {
    id: newId(),
    kind: "custom",
    title,
    priority,
    estimateMinutes,
    order,
    subTasks: [],
    createdAt: now,
  };
}
