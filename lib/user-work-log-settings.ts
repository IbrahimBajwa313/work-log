import { randomUUID } from "crypto";
import type { Db } from "mongodb";
import { z } from "zod";
import { WORK_LOG_PRIORITIES, type WorkLogPriority } from "@/lib/admin-work-log";

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

export type UserWorkLogSettingsDoc = {
  userId: string;
  people: WorkLogPerson[];
  taskTemplates: WorkLogTaskTemplate[];
  /** Combined work + deen daily target in minutes (0 = no goal). */
  dailyGoalMinutes: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SerializedWorkLogSettings = {
  people: WorkLogPerson[];
  taskTemplates: SerializedWorkLogTaskTemplate[];
  dailyGoalMinutes: number;
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

export function serializeWorkLogSettings(doc: UserWorkLogSettingsDoc): SerializedWorkLogSettings {
  return {
    people: doc.people ?? [],
    taskTemplates: (doc.taskTemplates ?? []).map(serializeTemplate),
    dailyGoalMinutes: Math.max(0, doc.dailyGoalMinutes ?? 0),
  };
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
  }

  const updated = await coll.findOne({ userId });
  if (!updated) throw new Error("Settings not found");
  return serializeWorkLogSettings(updated);
}
