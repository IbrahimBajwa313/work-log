import { NextRequest, NextResponse } from "next/server";
import {
  adminWorkLogCollection,
  emptyWorkLogDay,
  ensureAdminWorkLogIndexes,
  isValidDateKey,
  serializeWorkLogDay,
  type AdminWorkLogDoc,
} from "@/lib/admin-work-log";
import {
  PRIMARY_PERSON_ID,
  resolveAdminPersonId,
} from "@/lib/admin-work-log-settings";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { applyWorkLogAction, workLogActionSchema } from "@/lib/work-log-mutations";

export const dynamic = "force-dynamic";

type RouteContext = { params: { date: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }
    if (!(await isAdminRequestAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isValidDateKey(params.date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const personId = resolveAdminPersonId(
      request.nextUrl.searchParams.get("personId") || PRIMARY_PERSON_ID
    );

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);
    await ensureAdminWorkLogIndexes(db);

    const doc = await db
      .collection<AdminWorkLogDoc>(adminWorkLogCollection)
      .findOne({ personId, dateKey: params.date });

    return NextResponse.json({
      day: doc ? serializeWorkLogDay(doc) : emptyWorkLogDay(params.date),
      personId,
    });
  } catch (e) {
    console.error("Admin work-log day GET:", e);
    return NextResponse.json({ error: "Failed to load day" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }
    if (!(await isAdminRequestAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isValidDateKey(params.date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const personId = resolveAdminPersonId(
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
    await ensureAdminWorkLogIndexes(db);
    const coll = db.collection<AdminWorkLogDoc>(adminWorkLogCollection);

    try {
      const day = await applyWorkLogAction(coll, params.date, parsed.data, personId);
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
    console.error("Admin work-log day PATCH:", e);
    return NextResponse.json({ error: "Failed to update day" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }
    if (!(await isAdminRequestAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isValidDateKey(params.date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const personId = resolveAdminPersonId(
      request.nextUrl.searchParams.get("personId") || PRIMARY_PERSON_ID
    );

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);
    await ensureAdminWorkLogIndexes(db);

    await db.collection(adminWorkLogCollection).deleteOne({ personId, dateKey: params.date });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Admin work-log day DELETE:", e);
    return NextResponse.json({ error: "Failed to delete day" }, { status: 500 });
  }
}
