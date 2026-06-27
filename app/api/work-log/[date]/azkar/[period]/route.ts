import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Db } from "mongodb";
import { isValidDateKey } from "@/lib/admin-work-log";
import type { AzkarPeriod } from "@/lib/azkar";
import {
  addAzkarSeconds,
  buildAzkarResponse,
  ensureAzkarOnDayDoc,
  toggleAzkarAdhkar,
  updateAzkarAdhkarCount,
} from "@/lib/azkar-service";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { getWorklogSessionFromRequest } from "@/lib/worklog-auth";
import { createDefaultPlans } from "@/lib/work-log-plans";
import {
  ensureUserWorkLogIndexes,
  resolvePersonId,
  userWorkLogCollection,
  type UserWorkLogDoc,
} from "@/lib/user-work-log";
import { PRIMARY_PERSON_ID } from "@/lib/user-work-log-settings";

export const dynamic = "force-dynamic";

type RouteContext = { params: { date: string; period: string } };

const PERIODS = ["morning", "evening"] as const;

function parsePeriod(value: string): AzkarPeriod | null {
  return PERIODS.includes(value as AzkarPeriod) ? (value as AzkarPeriod) : null;
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("toggle"),
    adhkarId: z.string().min(1),
  }),
  z.object({
    action: z.literal("increment"),
    adhkarId: z.string().min(1),
  }),
  z.object({
    action: z.literal("complete"),
    adhkarId: z.string().min(1),
  }),
  z.object({
    action: z.literal("reset"),
    adhkarId: z.string().min(1),
  }),
  z.object({
    action: z.literal("setCount"),
    adhkarId: z.string().min(1),
    count: z.number().int().min(0).max(1000),
  }),
  z.object({
    action: z.literal("addTime"),
    seconds: z.number().int().min(1).max(3600),
  }),
]);

async function getOrSeedDay(db: Db, userId: string, personId: string, dateKey: string) {
  const coll = db.collection<UserWorkLogDoc>(userWorkLogCollection);
  const dayFilter = { userId, personId, dateKey };
  let doc = await coll.findOne(dayFilter);

  if (!doc) {
    const now = new Date();
    await coll.updateOne(
      dayFilter,
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
      { upsert: true }
    );
    doc = await coll.findOne(dayFilter);
  }

  if (!doc) return null;
  return ensureAzkarOnDayDoc(coll, dayFilter, doc, new Date());
}

function docWithPeriodProgress(
  doc: UserWorkLogDoc,
  period: AzkarPeriod,
  counts: Record<string, number>,
  secondsSpent?: number
): UserWorkLogDoc {
  return {
    ...doc,
    azkarProgress: {
      ...doc.azkarProgress,
      [period]: {
        counts,
        secondsSpent: secondsSpent ?? doc.azkarProgress?.[period]?.secondsSpent,
      },
    },
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const session = await getWorklogSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isValidDateKey(params.date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const period = parsePeriod(params.period);
    if (!period) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const personId = resolvePersonId(
      request.nextUrl.searchParams.get("personId") || PRIMARY_PERSON_ID
    );

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);
    await ensureUserWorkLogIndexes(db);

    const doc = await getOrSeedDay(db, session.sub, personId, params.date);
    if (!doc) {
      return NextResponse.json({ error: "Failed to load day" }, { status: 500 });
    }

    return NextResponse.json(buildAzkarResponse(doc, period));
  } catch (e) {
    console.error("Azkar GET:", e);
    return NextResponse.json({ error: "Failed to load azkar" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const session = await getWorklogSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isValidDateKey(params.date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const period = parsePeriod(params.period);
    if (!period) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const body = patchSchema.parse(await request.json());
    const personId = resolvePersonId(
      request.nextUrl.searchParams.get("personId") || PRIMARY_PERSON_ID
    );

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);
    await ensureUserWorkLogIndexes(db);

    const coll = db.collection<UserWorkLogDoc>(userWorkLogCollection);
    const dayFilter = { userId: session.sub, personId, dateKey: params.date };
    const doc = await getOrSeedDay(db, session.sub, personId, params.date);
    if (!doc) {
      return NextResponse.json({ error: "Failed to load day" }, { status: 500 });
    }

    const now = new Date();

    if (body.action === "addTime") {
      const { secondsSpent } = await addAzkarSeconds(
        coll,
        dayFilter,
        doc,
        period,
        body.seconds,
        now
      );
      return NextResponse.json(
        buildAzkarResponse(
          docWithPeriodProgress(
            doc,
            period,
            buildAzkarResponse(doc, period).counts,
            secondsSpent
          ),
          period
        )
      );
    }

    let result;
    switch (body.action) {
      case "toggle":
        result = await toggleAzkarAdhkar(coll, dayFilter, doc, period, body.adhkarId, now);
        break;
      case "increment":
        result = await updateAzkarAdhkarCount(
          coll,
          dayFilter,
          doc,
          period,
          body.adhkarId,
          "increment",
          now
        );
        break;
      case "complete":
        result = await updateAzkarAdhkarCount(
          coll,
          dayFilter,
          doc,
          period,
          body.adhkarId,
          "complete",
          now
        );
        break;
      case "reset":
        result = await updateAzkarAdhkarCount(
          coll,
          dayFilter,
          doc,
          period,
          body.adhkarId,
          "reset",
          now
        );
        break;
      case "setCount":
        result = await updateAzkarAdhkarCount(
          coll,
          dayFilter,
          doc,
          period,
          body.adhkarId,
          "set",
          now,
          body.count
        );
        break;
    }

    return NextResponse.json({
      ...buildAzkarResponse(docWithPeriodProgress(doc, period, result.counts), period),
      adhkarId: "adhkarId" in body ? body.adhkarId : undefined,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Azkar PATCH:", e);
    return NextResponse.json({ error: "Failed to update azkar" }, { status: 500 });
  }
}
