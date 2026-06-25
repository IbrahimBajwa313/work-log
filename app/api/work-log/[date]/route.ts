import { NextRequest, NextResponse } from "next/server";
import {
  emptyUserWorkLogDay,
  ensureUserWorkLogIndexes,
  resolvePersonId,
  serializeUserWorkLogDay,
  userWorkLogCollection,
  type UserWorkLogDoc,
} from "@/lib/user-work-log";
import { PRIMARY_PERSON_ID } from "@/lib/user-work-log-settings";
import { collapseWorkLogDayRows, resolveUserDayForWrite } from "@/lib/work-log-day-resolve";
import { isValidDateKey } from "@/lib/admin-work-log";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { getWorklogSessionFromRequest } from "@/lib/worklog-auth";
import { applyUserWorkLogAction, workLogActionSchema } from "@/lib/work-log-mutations";
import { ensureAzkarOnDayDoc } from "@/lib/azkar-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { date: string } };

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

    const personId = resolvePersonId(
      request.nextUrl.searchParams.get("personId") || PRIMARY_PERSON_ID
    );

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);
    await ensureUserWorkLogIndexes(db);

    const coll = db.collection<UserWorkLogDoc>(userWorkLogCollection);
    const candidates: UserWorkLogDoc[] = [];
    const personDoc = await coll.findOne({ userId: session.sub, personId, dateKey: params.date });
    if (personDoc) candidates.push(personDoc);

    if (personId === PRIMARY_PERSON_ID) {
      const legacyDoc = await coll.findOne({
        userId: session.sub,
        dateKey: params.date,
        personId: { $exists: false },
      });
      if (legacyDoc && !candidates.some((c) => String((c as { _id?: unknown })._id) === String((legacyDoc as { _id?: unknown })._id))) {
        candidates.push(legacyDoc);
      }
    }

    let doc: UserWorkLogDoc | null = null;
    if (candidates.length > 1 && personId === PRIMARY_PERSON_ID) {
      doc = await resolveUserDayForWrite(coll, session.sub, params.date, personId);
    } else if (candidates.length > 0) {
      doc = collapseWorkLogDayRows(candidates);
    }

    if (doc) {
      const docId = (doc as { _id?: unknown })._id;
      const dayFilter = docId
        ? { _id: docId }
        : {
            userId: session.sub,
            personId: doc.personId ?? personId,
            dateKey: params.date,
          };
      const ensured = await ensureAzkarOnDayDoc(coll, dayFilter, doc, new Date());
      if (ensured) {
        doc = ensured as typeof doc;
      }
    }

    return NextResponse.json({
      day: doc ? serializeUserWorkLogDay(doc) : emptyUserWorkLogDay(params.date),
      personId,
    });
  } catch (e) {
    console.error("User work-log day GET:", e);
    return NextResponse.json({ error: "Failed to load day" }, { status: 500 });
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

    const personId = resolvePersonId(
      request.nextUrl.searchParams.get("personId") || PRIMARY_PERSON_ID
    );

    const raw = await request.json().catch(() => null);
    const parsed = workLogActionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);
    await ensureUserWorkLogIndexes(db);
    const coll = db.collection<UserWorkLogDoc>(userWorkLogCollection);

    try {
      const day = await applyUserWorkLogAction(
        coll,
        session.sub,
        params.date,
        parsed.data,
        personId
      );
      return NextResponse.json({ day, personId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      if (msg === "Task not found" || msg === "Plan not found") {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      if (msg === "Cannot delete a core daily plan") {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      throw e;
    }
  } catch (e) {
    console.error("User work-log day PATCH:", e);
    return NextResponse.json({ error: "Failed to update day" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
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

    const personId = resolvePersonId(
      request.nextUrl.searchParams.get("personId") || PRIMARY_PERSON_ID
    );

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);
    await ensureUserWorkLogIndexes(db);

    const deleteFilter: Record<string, unknown> = {
      userId: session.sub,
      dateKey: params.date,
    };
    if (personId === PRIMARY_PERSON_ID) {
      deleteFilter.$or = [{ personId }, { personId: { $exists: false } }];
    } else {
      deleteFilter.personId = personId;
    }

    await db.collection(userWorkLogCollection).deleteOne(deleteFilter);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("User work-log day DELETE:", e);
    return NextResponse.json({ error: "Failed to delete day" }, { status: 500 });
  }
}
