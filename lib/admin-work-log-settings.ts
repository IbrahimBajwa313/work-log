import { randomUUID } from "crypto";
import type { Db } from "mongodb";
import { z } from "zod";
import { WORK_LOG_PRIORITIES, type WorkLogPriority } from "@/lib/admin-work-log";
import type {
  MonthlyAchievementTarget,
  MonthlyGoalOverride,
  YearlyAchievementTarget,
  YearlyGoalOverride,
} from "@/lib/user-work-log-settings";
import {
  MONTHLY_MILESTONE_CATEGORIES,
  normalizeMilestoneCategory,
} from "@/lib/user-work-log-settings";

export const adminWorkLogSettingsCollection =
  process.env.ADMIN_WORK_LOG_SETTINGS_COLLECTION || "adminWorkLogSettings";

export const ADMIN_WORK_LOG_SETTINGS_SCOPE = "admin";
export const PRIMARY_PERSON_ID = "primary";

const PERSON_COLORS = [
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#c084fc",
] as const;

export type WorkLogPerson = {
  id: string;
  name: string;
  color: string;
};

export type WorkLogTaskTemplate = {
  id: string;
  text: string;
  priority: WorkLogPriority;
  estimateMinutes: number | null;
  list: "work" | "deen";
};

type AdminWorkLogSettingsDoc = {
  scope: string;
  people: WorkLogPerson[];
  taskTemplates: WorkLogTaskTemplate[];
  dailyGoalMinutes: number;
  monthlyGoalMinutes: number;
  monthlyAchievementTargets: MonthlyAchievementTarget[];
  yearlyGoalMinutes: number;
  yearlyAchievementTargets: YearlyAchievementTarget[];
  monthlyGoalOverrides: MonthlyGoalOverride[];
  yearlyGoalOverrides: YearlyGoalOverride[];
  carryOverIncompleteTasks?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SerializedWorkLogSettings = {
  people: WorkLogPerson[];
  taskTemplates: SerializedWorkLogTaskTemplate[];
  dailyGoalMinutes: number;
  monthlyGoalMinutes: number;
  monthlyAchievementTargets: import("@/lib/user-work-log-settings").SerializedMonthlyAchievementTarget[];
  yearlyGoalMinutes: number;
  yearlyAchievementTargets: import("@/lib/user-work-log-settings").SerializedYearlyAchievementTarget[];
  monthlyGoalOverrides: import("@/lib/user-work-log-settings").MonthlyGoalOverride[];
  yearlyGoalOverrides: import("@/lib/user-work-log-settings").YearlyGoalOverride[];
  carryOverIncompleteTasks: boolean;
};

export type SerializedWorkLogTaskTemplate = {
  id: string;
  text: string;
  priority: WorkLogPriority;
  estimateMinutes: number | null;
  list: "work" | "deen";
};

let indexesEnsured = false;

export async function ensureAdminWorkLogSettingsIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db
    .collection(adminWorkLogSettingsCollection)
    .createIndex({ scope: 1 }, { unique: true });
  indexesEnsured = true;
}

function nextPersonColor(existing: WorkLogPerson[]): string {
  const used = new Set(existing.map((p) => p.color));
  for (const c of PERSON_COLORS) {
    if (!used.has(c)) return c;
  }
  return PERSON_COLORS[existing.length % PERSON_COLORS.length];
}

function serializeTemplate(t: WorkLogTaskTemplate): SerializedWorkLogTaskTemplate {
  return {
    id: t.id,
    text: t.text,
    priority: WORK_LOG_PRIORITIES.includes(t.priority) ? t.priority : "medium",
    estimateMinutes:
      typeof t.estimateMinutes === "number" && t.estimateMinutes > 0
        ? Math.round(t.estimateMinutes)
        : null,
    list: t.list === "deen" ? "deen" : "work",
  };
}

function serializeSettings(doc: AdminWorkLogSettingsDoc): SerializedWorkLogSettings {
  return {
    people: doc.people ?? [],
    taskTemplates: (doc.taskTemplates ?? []).map(serializeTemplate),
    dailyGoalMinutes: Math.max(0, doc.dailyGoalMinutes ?? 0),
    monthlyGoalMinutes: Math.max(0, doc.monthlyGoalMinutes ?? 0),
    monthlyAchievementTargets: (doc.monthlyAchievementTargets ?? [])
      .map((t) => ({
        id: t.id,
        monthKey: t.monthKey,
        title: (t.title ?? "").trim().slice(0, 200),
        targetCount: Math.max(0, Math.round(t.targetCount ?? 0)),
        currentCount: Math.max(0, Math.round(t.currentCount ?? 0)),
        unit: (t.unit ?? "").trim().slice(0, 40),
        category: normalizeMilestoneCategory(t.category),
      }))
      .filter((t) => t.monthKey && t.title),
    yearlyGoalMinutes: Math.max(0, doc.yearlyGoalMinutes ?? 0),
    yearlyAchievementTargets: (doc.yearlyAchievementTargets ?? [])
      .map((t) => ({
        id: t.id,
        yearKey: t.yearKey,
        title: (t.title ?? "").trim().slice(0, 200),
        targetCount: Math.max(0, Math.round(t.targetCount ?? 0)),
        currentCount: Math.max(0, Math.round(t.currentCount ?? 0)),
        unit: (t.unit ?? "").trim().slice(0, 40),
        category: normalizeMilestoneCategory(t.category),
      }))
      .filter((t) => t.yearKey && t.title),
    monthlyGoalOverrides: (doc.monthlyGoalOverrides ?? [])
      .filter((o) => /^\d{4}-\d{2}$/.test(o.monthKey))
      .map((o) => ({
        monthKey: o.monthKey,
        minutes: Math.max(0, Math.round(o.minutes ?? 0)),
      })),
    yearlyGoalOverrides: (doc.yearlyGoalOverrides ?? [])
      .filter((o) => /^\d{4}$/.test(o.yearKey))
      .map((o) => ({
        yearKey: o.yearKey,
        minutes: Math.max(0, Math.round(o.minutes ?? 0)),
      })),
    carryOverIncompleteTasks: Boolean(doc.carryOverIncompleteTasks),
  };
}

export async function getOrCreateAdminWorkLogSettings(
  db: Db,
  defaultName = "Me"
): Promise<SerializedWorkLogSettings> {
  await ensureAdminWorkLogSettingsIndexes(db);
  const coll = db.collection<AdminWorkLogSettingsDoc>(adminWorkLogSettingsCollection);
  const now = new Date();

  const result = await coll.findOneAndUpdate(
    { scope: ADMIN_WORK_LOG_SETTINGS_SCOPE },
    {
      $setOnInsert: {
        scope: ADMIN_WORK_LOG_SETTINGS_SCOPE,
        people: [
          {
            id: PRIMARY_PERSON_ID,
            name: defaultName.trim() || "Me",
            color: PERSON_COLORS[0],
          },
        ],
        taskTemplates: [],
        dailyGoalMinutes: 480,
        monthlyGoalMinutes: 10560,
        monthlyAchievementTargets: [],
        yearlyGoalMinutes: 126720,
        yearlyAchievementTargets: [],
        monthlyGoalOverrides: [],
        yearlyGoalOverrides: [],
        carryOverIncompleteTasks: false,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  if (!result) {
    return {
      people: [{ id: PRIMARY_PERSON_ID, name: defaultName, color: PERSON_COLORS[0] }],
      taskTemplates: [],
      dailyGoalMinutes: 480,
      monthlyGoalMinutes: 10560,
      monthlyAchievementTargets: [],
      yearlyGoalMinutes: 126720,
      yearlyAchievementTargets: [],
      monthlyGoalOverrides: [],
      yearlyGoalOverrides: [],
      carryOverIncompleteTasks: false,
    };
  }

  return serializeSettings(result);
}

export const workLogSettingsActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("addPerson"),
    name: z.string().trim().min(1).max(60),
  }),
  z.object({
    action: z.literal("updatePerson"),
    personId: z.string().min(1),
    name: z.string().trim().min(1).max(60),
  }),
  z.object({
    action: z.literal("deletePerson"),
    personId: z.string().min(1),
  }),
  z.object({
    action: z.literal("addTemplate"),
    text: z.string().trim().min(1).max(500),
    priority: z.enum(WORK_LOG_PRIORITIES).optional(),
    estimateMinutes: z.coerce.number().int().min(1).max(24 * 60).nullish(),
    list: z.enum(["work", "deen"]).optional(),
  }),
  z.object({
    action: z.literal("updateTemplate"),
    templateId: z.string().min(1),
    text: z.string().trim().min(1).max(500).optional(),
    priority: z.enum(WORK_LOG_PRIORITIES).optional(),
    estimateMinutes: z.coerce.number().int().min(1).max(24 * 60).nullish(),
    list: z.enum(["work", "deen"]).optional(),
  }),
  z.object({
    action: z.literal("deleteTemplate"),
    templateId: z.string().min(1),
  }),
  z.object({
    action: z.literal("setDailyGoal"),
    minutes: z.coerce.number().int().min(0).max(24 * 60),
  }),
  z.object({
    action: z.literal("setCarryOverIncompleteTasks"),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("setMonthlyGoal"),
    minutes: z.coerce.number().int().min(0).max(744 * 60),
    monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
  z.object({
    action: z.literal("addMonthlyAchievementTarget"),
    monthKey: z.string().regex(/^\d{4}-\d{2}$/),
    title: z.string().trim().min(1).max(200),
    targetCount: z.coerce.number().int().min(0).max(1_000_000).optional(),
    unit: z.string().trim().max(40).optional(),
    category: z.enum(MONTHLY_MILESTONE_CATEGORIES).optional(),
  }),
  z.object({
    action: z.literal("updateMonthlyAchievementTarget"),
    targetId: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    targetCount: z.coerce.number().int().min(0).max(1_000_000).optional(),
    currentCount: z.coerce.number().int().min(0).max(1_000_000).optional(),
    unit: z.string().trim().max(40).optional(),
    category: z.enum(MONTHLY_MILESTONE_CATEGORIES).optional(),
  }),
  z.object({
    action: z.literal("deleteMonthlyAchievementTarget"),
    targetId: z.string().min(1),
  }),
  z.object({
    action: z.literal("setYearlyGoal"),
    minutes: z.coerce.number().int().min(0).max(8784 * 60),
    yearKey: z.string().regex(/^\d{4}$/).optional(),
  }),
  z.object({
    action: z.literal("addYearlyAchievementTarget"),
    yearKey: z.string().regex(/^\d{4}$/),
    title: z.string().trim().min(1).max(200),
    targetCount: z.coerce.number().int().min(0).max(1_000_000).optional(),
    unit: z.string().trim().max(40).optional(),
    category: z.enum(MONTHLY_MILESTONE_CATEGORIES).optional(),
  }),
  z.object({
    action: z.literal("updateYearlyAchievementTarget"),
    targetId: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    targetCount: z.coerce.number().int().min(0).max(1_000_000).optional(),
    currentCount: z.coerce.number().int().min(0).max(1_000_000).optional(),
    unit: z.string().trim().max(40).optional(),
    category: z.enum(MONTHLY_MILESTONE_CATEGORIES).optional(),
  }),
  z.object({
    action: z.literal("deleteYearlyAchievementTarget"),
    targetId: z.string().min(1),
  }),
]);

export async function applyAdminWorkLogSettingsAction(
  db: Db,
  body: z.infer<typeof workLogSettingsActionSchema>,
  defaultName = "Me"
): Promise<SerializedWorkLogSettings> {
  await getOrCreateAdminWorkLogSettings(db, defaultName);
  const coll = db.collection<AdminWorkLogSettingsDoc>(adminWorkLogSettingsCollection);
  const now = new Date();
  const scope = ADMIN_WORK_LOG_SETTINGS_SCOPE;

  switch (body.action) {
    case "addPerson": {
      const doc = await coll.findOne({ scope });
      const people = doc?.people ?? [];
      const person: WorkLogPerson = {
        id: randomUUID(),
        name: body.name,
        color: nextPersonColor(people),
      };
      await coll.updateOne({ scope }, { $push: { people: person }, $set: { updatedAt: now } });
      break;
    }
    case "updatePerson": {
      if (body.personId === PRIMARY_PERSON_ID) {
        await coll.updateOne(
          { scope, "people.id": PRIMARY_PERSON_ID },
          { $set: { "people.$.name": body.name, updatedAt: now } }
        );
      } else {
        const result = await coll.updateOne(
          { scope, "people.id": body.personId },
          { $set: { "people.$.name": body.name, updatedAt: now } }
        );
        if (result.matchedCount === 0) throw new Error("Person not found");
      }
      break;
    }
    case "deletePerson": {
      if (body.personId === PRIMARY_PERSON_ID) {
        throw new Error("Cannot delete your primary profile");
      }
      const result = await coll.updateOne(
        { scope },
        { $pull: { people: { id: body.personId } }, $set: { updatedAt: now } }
      );
      if (result.modifiedCount === 0) throw new Error("Person not found");
      break;
    }
    case "addTemplate": {
      const template: WorkLogTaskTemplate = {
        id: randomUUID(),
        text: body.text,
        priority: body.priority ?? "medium",
        estimateMinutes: body.estimateMinutes ?? null,
        list: body.list ?? "work",
      };
      await coll.updateOne(
        { scope },
        { $push: { taskTemplates: template }, $set: { updatedAt: now } }
      );
      break;
    }
    case "updateTemplate": {
      const doc = await coll.findOne({ scope });
      const templates = doc?.taskTemplates ?? [];
      const idx = templates.findIndex((t) => t.id === body.templateId);
      if (idx < 0) throw new Error("Template not found");
      const current = templates[idx];
      const updated: WorkLogTaskTemplate = {
        ...current,
        text: body.text ?? current.text,
        priority: body.priority ?? current.priority,
        estimateMinutes:
          body.estimateMinutes !== undefined ? body.estimateMinutes ?? null : current.estimateMinutes,
        list: body.list ?? current.list,
      };
      await coll.updateOne({ scope }, { $set: { [`taskTemplates.${idx}`]: updated, updatedAt: now } });
      break;
    }
    case "deleteTemplate": {
      const result = await coll.updateOne(
        { scope },
        { $pull: { taskTemplates: { id: body.templateId } }, $set: { updatedAt: now } }
      );
      if (result.modifiedCount === 0) throw new Error("Template not found");
      break;
    }
    case "setDailyGoal": {
      await coll.updateOne({ scope }, { $set: { dailyGoalMinutes: body.minutes, updatedAt: now } });
      break;
    }
    case "setCarryOverIncompleteTasks": {
      await coll.updateOne(
        { scope },
        { $set: { carryOverIncompleteTasks: body.enabled, updatedAt: now } }
      );
      break;
    }
    case "setMonthlyGoal": {
      if (body.monthKey) {
        const doc = await coll.findOne({ scope });
        const overrides = [...(doc?.monthlyGoalOverrides ?? [])];
        const idx = overrides.findIndex((o) => o.monthKey === body.monthKey);
        const entry: MonthlyGoalOverride = { monthKey: body.monthKey, minutes: body.minutes };
        if (idx >= 0) overrides[idx] = entry;
        else overrides.push(entry);
        await coll.updateOne(
          { scope },
          { $set: { monthlyGoalOverrides: overrides, updatedAt: now } }
        );
      } else {
        await coll.updateOne({ scope }, { $set: { monthlyGoalMinutes: body.minutes, updatedAt: now } });
      }
      break;
    }
    case "addMonthlyAchievementTarget": {
      const target: MonthlyAchievementTarget = {
        id: randomUUID(),
        monthKey: body.monthKey,
        title: body.title,
        targetCount: body.targetCount ?? 0,
        currentCount: 0,
        unit: body.unit?.trim() ?? "",
        category: normalizeMilestoneCategory(body.category),
      };
      await coll.updateOne(
        { scope },
        { $push: { monthlyAchievementTargets: target }, $set: { updatedAt: now } }
      );
      break;
    }
    case "updateMonthlyAchievementTarget": {
      const doc = await coll.findOne({ scope });
      const targets = doc?.monthlyAchievementTargets ?? [];
      const idx = targets.findIndex((t) => t.id === body.targetId);
      if (idx < 0) throw new Error("Target not found");
      const current = targets[idx];
      const updated: MonthlyAchievementTarget = {
        ...current,
        title: body.title ?? current.title,
        targetCount: body.targetCount ?? current.targetCount,
        currentCount: body.currentCount ?? current.currentCount,
        unit: body.unit !== undefined ? body.unit.trim() : current.unit,
        category:
          body.category !== undefined
            ? normalizeMilestoneCategory(body.category)
            : normalizeMilestoneCategory(current.category),
      };
      await coll.updateOne(
        { scope },
        { $set: { [`monthlyAchievementTargets.${idx}`]: updated, updatedAt: now } }
      );
      break;
    }
    case "deleteMonthlyAchievementTarget": {
      const result = await coll.updateOne(
        { scope },
        {
          $pull: { monthlyAchievementTargets: { id: body.targetId } },
          $set: { updatedAt: now },
        }
      );
      if (result.modifiedCount === 0) throw new Error("Target not found");
      break;
    }
    case "setYearlyGoal": {
      if (body.yearKey) {
        const doc = await coll.findOne({ scope });
        const overrides = [...(doc?.yearlyGoalOverrides ?? [])];
        const idx = overrides.findIndex((o) => o.yearKey === body.yearKey);
        const entry: YearlyGoalOverride = { yearKey: body.yearKey, minutes: body.minutes };
        if (idx >= 0) overrides[idx] = entry;
        else overrides.push(entry);
        await coll.updateOne(
          { scope },
          { $set: { yearlyGoalOverrides: overrides, updatedAt: now } }
        );
      } else {
        await coll.updateOne({ scope }, { $set: { yearlyGoalMinutes: body.minutes, updatedAt: now } });
      }
      break;
    }
    case "addYearlyAchievementTarget": {
      const target: YearlyAchievementTarget = {
        id: randomUUID(),
        yearKey: body.yearKey,
        title: body.title,
        targetCount: body.targetCount ?? 0,
        currentCount: 0,
        unit: body.unit?.trim() ?? "",
        category: normalizeMilestoneCategory(body.category),
      };
      await coll.updateOne(
        { scope },
        { $push: { yearlyAchievementTargets: target }, $set: { updatedAt: now } }
      );
      break;
    }
    case "updateYearlyAchievementTarget": {
      const doc = await coll.findOne({ scope });
      const targets = doc?.yearlyAchievementTargets ?? [];
      const idx = targets.findIndex((t) => t.id === body.targetId);
      if (idx < 0) throw new Error("Target not found");
      const current = targets[idx];
      const updated: YearlyAchievementTarget = {
        ...current,
        title: body.title ?? current.title,
        targetCount: body.targetCount ?? current.targetCount,
        currentCount: body.currentCount ?? current.currentCount,
        unit: body.unit !== undefined ? body.unit.trim() : current.unit,
        category:
          body.category !== undefined
            ? normalizeMilestoneCategory(body.category)
            : normalizeMilestoneCategory(current.category),
      };
      await coll.updateOne(
        { scope },
        { $set: { [`yearlyAchievementTargets.${idx}`]: updated, updatedAt: now } }
      );
      break;
    }
    case "deleteYearlyAchievementTarget": {
      const result = await coll.updateOne(
        { scope },
        {
          $pull: { yearlyAchievementTargets: { id: body.targetId } },
          $set: { updatedAt: now },
        }
      );
      if (result.modifiedCount === 0) throw new Error("Target not found");
      break;
    }
  }

  const updated = await coll.findOne({ scope });
  if (!updated) throw new Error("Settings not found");
  return serializeSettings(updated);
}

export function resolveAdminPersonId(personId?: string | null): string {
  return personId?.trim() || PRIMARY_PERSON_ID;
}
