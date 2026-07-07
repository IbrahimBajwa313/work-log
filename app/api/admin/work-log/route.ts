import { NextRequest, NextResponse } from "next/server";
import {
  adminWorkLogCollection,
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
import { runAdminCarryOverIfNeeded } from "@/lib/work-log-carry-over";
import { runTimerRolloverIfNeeded } from "@/lib/work-log-timer-rollover";
import { localDateKey } from "@/lib/date-keys";

export const dynamic = "force-dynamic";

function defaultFromKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 60);
  return d.toISOString().slice(0, 10);
}

/** List day entries in `[from, to]` (inclusive), newest first. Defaults to the last ~60 days. */
export async function GET(request: NextRequest) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }
    if (!(await isAdminRequestAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fromParam = request.nextUrl.searchParams.get("from") || "";
    const toParam = request.nextUrl.searchParams.get("to") || "";
    const personParam = request.nextUrl.searchParams.get("personId") || "";
    const from = isValidDateKey(fromParam) ? fromParam : defaultFromKey();
    const to = isValidDateKey(toParam) ? toParam : null;
    const personId = resolveAdminPersonId(personParam || PRIMARY_PERSON_ID);

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);
    await ensureAdminWorkLogIndexes(db);

    await runAdminCarryOverIfNeeded(db, personId);
    const coll = db.collection<AdminWorkLogDoc>(adminWorkLogCollection);
    await runTimerRolloverIfNeeded(coll, { personId });

    const dateFilter = to ? { $gte: from, $lte: to } : { $gte: from };
    const filter: Record<string, unknown> = { personId, dateKey: dateFilter };

    const rows = await db
      .collection<AdminWorkLogDoc>(adminWorkLogCollection)
      .find(filter)
      .sort({ dateKey: -1 })
      .limit(400)
      .toArray();

    return NextResponse.json({ days: rows.map(serializeWorkLogDay), personId });
  } catch (e) {
    console.error("Admin work-log GET:", e);
    return NextResponse.json({ error: "Failed to list work log" }, { status: 500 });
  }
}
