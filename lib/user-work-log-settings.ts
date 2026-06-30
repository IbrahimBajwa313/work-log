import { randomUUID } from "crypto";
import type { Db } from "mongodb";
import { z } from "zod";
import { WORK_LOG_PRIORITIES, type WorkLogPriority } from "@/lib/admin-work-log";
import type { WorkLogArea } from "@/lib/work-log-area-colors";

export const MONTHLY_MILESTONE_CATEGORIES = ["work", "deen", "fitness"] as const;
export type MonthlyMilestoneCategory = WorkLogArea;

export const MILESTONE_CATEGORY_LABELS: Record<MonthlyMilestoneCategory, string> = {
  work: "Business",
  deen: "Deen",
  fitness: "Fitness",
};

export const userWorkLogSettingsCollection =
  process.env.USER_WORK_LOG_SETTINGS_COLLECTION || "userWorkLogSettings";

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

/** Numeric milestone for a calendar month, e.g. "Connect with 100 doctors". */
export type MonthlyAchievementTarget = {
  id: string;
  /** "YYYY-MM" */
  monthKey: string;
  title: string;
  /** 0 = no numeric target (mark complete when done). */
  targetCount: number;
  currentCount: number;
  /** Optional label shown after the number, e.g. "doctors". */
  unit: string;
  category: MonthlyMilestoneCategory;
};

/** Numeric milestone for a calendar year, e.g. "Launch 3 products". */
export type YearlyAchievementTarget = {
  id: string;
  /** "YYYY" */
  yearKey: string;
  title: string;
  targetCount: number;
  currentCount: number;
  unit: string;
  category: MonthlyMilestoneCategory;
};

export type UserWorkLogSettingsDoc = {
  userId: string;
  people: WorkLogPerson[];
  taskTemplates: WorkLogTaskTemplate[];
  /** Combined work + deen daily target in minutes (0 = no goal). */
  dailyGoalMinutes: number;
  /** Combined monthly target in minutes (0 = derive from daily goal × days in month). */
  monthlyGoalMinutes: number;
  monthlyAchievementTargets: MonthlyAchievementTarget[];
  /** Combined yearly target in minutes (0 = derive from monthly × 12 or daily × days in year). */
  yearlyGoalMinutes: number;
  yearlyAchievementTargets: YearlyAchievementTarget[];
  /** Per-month time goal overrides keyed by "YYYY-MM". */
  monthlyGoalOverrides: MonthlyGoalOverride[];
  /** Per-year time goal overrides keyed by "YYYY". */
  yearlyGoalOverrides: YearlyGoalOverride[];
  createdAt: Date;
  updatedAt: Date;
};

export type MonthlyGoalOverride = {
  monthKey: string;
  minutes: number;
};

export type YearlyGoalOverride = {
  yearKey: string;
  minutes: number;
};

export type SerializedMonthlyAchievementTarget = {
  id: string;
  monthKey: string;
  title: string;
  targetCount: number;
  currentCount: number;
  unit: string;
  category: MonthlyMilestoneCategory;
};

export type SerializedYearlyAchievementTarget = {
  id: string;
  yearKey: string;
  title: string;
  targetCount: number;
  currentCount: number;
  unit: string;
  category: MonthlyMilestoneCategory;
};

export function normalizeMilestoneCategory(value: unknown): MonthlyMilestoneCategory {
  return value === "deen" || value === "fitness" || value === "work" ? value : "work";
}

export function isMilestoneComplete(
  target: Pick<SerializedMonthlyAchievementTarget, "targetCount" | "currentCount">
): boolean {
  if (target.targetCount > 0) return target.currentCount >= target.targetCount;
  return target.currentCount >= 1;
}

export type SerializedWorkLogSettings = {
  people: WorkLogPerson[];
  taskTemplates: SerializedWorkLogTaskTemplate[];
  dailyGoalMinutes: number;
  monthlyGoalMinutes: number;
  monthlyAchievementTargets: SerializedMonthlyAchievementTarget[];
  yearlyGoalMinutes: number;
  yearlyAchievementTargets: SerializedYearlyAchievementTarget[];
  monthlyGoalOverrides: MonthlyGoalOverride[];
  yearlyGoalOverrides: YearlyGoalOverride[];
};

export type SerializedWorkLogTaskTemplate = {
  id: string;
  text: string;
  priority: WorkLogPriority;
  estimateMinutes: number | null;
  list: "work" | "deen";
};

let indexesEnsured = false;

export async function ensureUserWorkLogSettingsIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db
    .collection(userWorkLogSettingsCollection)
    .createIndex({ userId: 1 }, { unique: true });
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

function serializeAchievementTarget(
  t: MonthlyAchievementTarget
): SerializedMonthlyAchievementTarget {
  return {
    id: t.id,
    monthKey: /^\d{4}-\d{2}$/.test(t.monthKey) ? t.monthKey : "",
    title: (t.title ?? "").trim().slice(0, 200),
    targetCount: Math.max(0, Math.round(t.targetCount ?? 0)),
    currentCount: Math.max(0, Math.round(t.currentCount ?? 0)),
    unit: (t.unit ?? "").trim().slice(0, 40),
    category: normalizeMilestoneCategory(t.category),
  };
}

function serializeYearlyAchievementTarget(
  t: YearlyAchievementTarget
): SerializedYearlyAchievementTarget {
  return {
    id: t.id,
    yearKey: /^\d{4}$/.test(t.yearKey) ? t.yearKey : "",
    title: (t.title ?? "").trim().slice(0, 200),
    targetCount: Math.max(0, Math.round(t.targetCount ?? 0)),
    currentCount: Math.max(0, Math.round(t.currentCount ?? 0)),
    unit: (t.unit ?? "").trim().slice(0, 40),
    category: normalizeMilestoneCategory(t.category),
  };
}

export function serializeWorkLogSettings(doc: UserWorkLogSettingsDoc): SerializedWorkLogSettings {
  return {
    people: doc.people ?? [],
    taskTemplates: (doc.taskTemplates ?? []).map(serializeTemplate),
    dailyGoalMinutes: Math.max(0, doc.dailyGoalMinutes ?? 0),
    monthlyGoalMinutes: Math.max(0, doc.monthlyGoalMinutes ?? 0),
    monthlyAchievementTargets: (doc.monthlyAchievementTargets ?? [])
      .map(serializeAchievementTarget)
      .filter((t) => t.monthKey && t.title),
    yearlyGoalMinutes: Math.max(0, doc.yearlyGoalMinutes ?? 0),
    yearlyAchievementTargets: (doc.yearlyAchievementTargets ?? [])
      .map(serializeYearlyAchievementTarget)
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
  };
}

export function achievementTargetsForMonth(
  settings: Pick<SerializedWorkLogSettings, "monthlyAchievementTargets">,
  monthKey: string
): SerializedMonthlyAchievementTarget[] {
  return (settings.monthlyAchievementTargets ?? []).filter((t) => t.monthKey === monthKey);
}

export function achievementTargetsForYear(
  settings: Pick<SerializedWorkLogSettings, "yearlyAchievementTargets">,
  yearKey: string
): SerializedYearlyAchievementTarget[] {
  return (settings.yearlyAchievementTargets ?? []).filter((t) => t.yearKey === yearKey);
}

export function daysInCalendarMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function daysInCalendarYear(year: number): number {
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
}

export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** Effective monthly target: per-month override, global setting, or daily goal × days in month. */
export function effectiveMonthlyGoalMinutes(
  settings: Pick<
    SerializedWorkLogSettings,
    "dailyGoalMinutes" | "monthlyGoalMinutes" | "monthlyGoalOverrides"
  >,
  year: number,
  monthIndex: number
): number {
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const override = (settings.monthlyGoalOverrides ?? []).find((o) => o.monthKey === monthKey);
  if (override) return override.minutes;
  if (settings.monthlyGoalMinutes > 0) return settings.monthlyGoalMinutes;
  const daily = settings.dailyGoalMinutes;
  if (daily <= 0) return 0;
  return daily * daysInCalendarMonth(year, monthIndex);
}

/** Effective yearly target: per-year override, global setting, monthly × 12, or daily × days in year. */
export function effectiveYearlyGoalMinutes(
  settings: Pick<
    SerializedWorkLogSettings,
    "dailyGoalMinutes" | "monthlyGoalMinutes" | "yearlyGoalMinutes" | "yearlyGoalOverrides"
  >,
  year: number
): number {
  const yearKey = String(year);
  const override = (settings.yearlyGoalOverrides ?? []).find((o) => o.yearKey === yearKey);
  if (override) return override.minutes;
  if (settings.yearlyGoalMinutes > 0) return settings.yearlyGoalMinutes;
  if (settings.monthlyGoalMinutes > 0) return settings.monthlyGoalMinutes * 12;
  const daily = settings.dailyGoalMinutes;
  if (daily <= 0) return 0;
  return daily * daysInCalendarYear(year);
}

export function hasMonthlyGoalOverride(
  settings: Pick<SerializedWorkLogSettings, "monthlyGoalOverrides">,
  monthKey: string
): boolean {
  return (settings.monthlyGoalOverrides ?? []).some((o) => o.monthKey === monthKey);
}

export function hasYearlyGoalOverride(
  settings: Pick<SerializedWorkLogSettings, "yearlyGoalOverrides">,
  yearKey: string
): boolean {
  return (settings.yearlyGoalOverrides ?? []).some((o) => o.yearKey === yearKey);
}

export async function getOrCreateUserWorkLogSettings(
  db: Db,
  userId: string,
  defaultName = "Me"
): Promise<SerializedWorkLogSettings> {
  await ensureUserWorkLogSettingsIndexes(db);
  const coll = db.collection<UserWorkLogSettingsDoc>(userWorkLogSettingsCollection);
  const now = new Date();

  const result = await coll.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
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
    };
  }

  return serializeWorkLogSettings(result);
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

export async function applyWorkLogSettingsAction(
  db: Db,
  userId: string,
  body: z.infer<typeof workLogSettingsActionSchema>,
  defaultName = "Me"
): Promise<SerializedWorkLogSettings> {
  await getOrCreateUserWorkLogSettings(db, userId, defaultName);
  const coll = db.collection<UserWorkLogSettingsDoc>(userWorkLogSettingsCollection);
  const now = new Date();

  switch (body.action) {
    case "addPerson": {
      const doc = await coll.findOne({ userId });
      const people = doc?.people ?? [];
      const person: WorkLogPerson = {
        id: randomUUID(),
        name: body.name,
        color: nextPersonColor(people),
      };
      await coll.updateOne(
        { userId },
        { $push: { people: person }, $set: { updatedAt: now } }
      );
      break;
    }
    case "updatePerson": {
      if (body.personId === PRIMARY_PERSON_ID) {
        await coll.updateOne(
          { userId, "people.id": PRIMARY_PERSON_ID },
          { $set: { "people.$.name": body.name, updatedAt: now } }
        );
      } else {
        const result = await coll.updateOne(
          { userId, "people.id": body.personId },
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
        { userId },
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
        { userId },
        { $push: { taskTemplates: template }, $set: { updatedAt: now } }
      );
      break;
    }
    case "updateTemplate": {
      const doc = await coll.findOne({ userId });
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
      await coll.updateOne(
        { userId },
        { $set: { [`taskTemplates.${idx}`]: updated, updatedAt: now } }
      );
      break;
    }
    case "deleteTemplate": {
      const result = await coll.updateOne(
        { userId },
        { $pull: { taskTemplates: { id: body.templateId } }, $set: { updatedAt: now } }
      );
      if (result.modifiedCount === 0) throw new Error("Template not found");
      break;
    }
    case "setDailyGoal": {
      await coll.updateOne(
        { userId },
        { $set: { dailyGoalMinutes: body.minutes, updatedAt: now } }
      );
      break;
    }
    case "setMonthlyGoal": {
      if (body.monthKey) {
        const doc = await coll.findOne({ userId });
        const overrides = [...(doc?.monthlyGoalOverrides ?? [])];
        const idx = overrides.findIndex((o) => o.monthKey === body.monthKey);
        const entry: MonthlyGoalOverride = { monthKey: body.monthKey, minutes: body.minutes };
        if (idx >= 0) overrides[idx] = entry;
        else overrides.push(entry);
        await coll.updateOne(
          { userId },
          { $set: { monthlyGoalOverrides: overrides, updatedAt: now } }
        );
      } else {
        await coll.updateOne(
          { userId },
          { $set: { monthlyGoalMinutes: body.minutes, updatedAt: now } }
        );
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
        { userId },
        { $push: { monthlyAchievementTargets: target }, $set: { updatedAt: now } }
      );
      break;
    }
    case "updateMonthlyAchievementTarget": {
      const doc = await coll.findOne({ userId });
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
        { userId },
        { $set: { [`monthlyAchievementTargets.${idx}`]: updated, updatedAt: now } }
      );
      break;
    }
    case "deleteMonthlyAchievementTarget": {
      const result = await coll.updateOne(
        { userId },
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
        const doc = await coll.findOne({ userId });
        const overrides = [...(doc?.yearlyGoalOverrides ?? [])];
        const idx = overrides.findIndex((o) => o.yearKey === body.yearKey);
        const entry: YearlyGoalOverride = { yearKey: body.yearKey, minutes: body.minutes };
        if (idx >= 0) overrides[idx] = entry;
        else overrides.push(entry);
        await coll.updateOne(
          { userId },
          { $set: { yearlyGoalOverrides: overrides, updatedAt: now } }
        );
      } else {
        await coll.updateOne(
          { userId },
          { $set: { yearlyGoalMinutes: body.minutes, updatedAt: now } }
        );
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
        { userId },
        { $push: { yearlyAchievementTargets: target }, $set: { updatedAt: now } }
      );
      break;
    }
    case "updateYearlyAchievementTarget": {
      const doc = await coll.findOne({ userId });
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
        { userId },
        { $set: { [`yearlyAchievementTargets.${idx}`]: updated, updatedAt: now } }
      );
      break;
    }
    case "deleteYearlyAchievementTarget": {
      const result = await coll.updateOne(
        { userId },
        {
          $pull: { yearlyAchievementTargets: { id: body.targetId } },
          $set: { updatedAt: now },
        }
      );
      if (result.modifiedCount === 0) throw new Error("Target not found");
      break;
    }
  }

  const updated = await coll.findOne({ userId });
  if (!updated) throw new Error("Settings not found");
  return serializeWorkLogSettings(updated);
}
