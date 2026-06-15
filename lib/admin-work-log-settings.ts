import { randomUUID } from "crypto";
import type { Db } from "mongodb";
import { z } from "zod";
import { WORK_LOG_PRIORITIES, type WorkLogPriority } from "@/lib/admin-work-log";

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
  }

  const updated = await coll.findOne({ scope });
  if (!updated) throw new Error("Settings not found");
  return serializeSettings(updated);
}

export function resolveAdminPersonId(personId?: string | null): string {
  return personId?.trim() || PRIMARY_PERSON_ID;
}
