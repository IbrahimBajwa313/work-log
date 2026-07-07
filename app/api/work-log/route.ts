import { NextRequest, NextResponse } from "next/server";
import { isValidDateKey } from "@/lib/admin-work-log";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { getWorklogSessionFromRequest } from "@/lib/worklog-auth";
import {
  ensureUserWorkLogIndexes,
  resolvePersonId,
  serializeUserWorkLogDay,
  userWorkLogCollection,
  type UserWorkLogDoc,
} from "@/lib/user-work-log";
import { PRIMARY_PERSON_ID } from "@/lib/user-work-log-settings";
import { collapseWorkLogDayRows } from "@/lib/work-log-day-resolve";
import { runUserCarryOverIfNeeded } from "@/lib/work-log-carry-over";
import { runTimerRolloverIfNeeded } from "@/lib/work-log-timer-rollover";

export const dynamic = "force-dynamic";

function defaultFromKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 53 * 7);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const session = await getWorklogSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fromParam = request.nextUrl.searchParams.get("from") || "";
    const toParam = request.nextUrl.searchParams.get("to") || "";
    const personParam = request.nextUrl.searchParams.get("personId") || "";
    const from = isValidDateKey(fromParam) ? fromParam : defaultFromKey();
    const to = isValidDateKey(toParam) ? toParam : null;
    const personId = resolvePersonId(personParam || PRIMARY_PERSON_ID);

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);
    await ensureUserWorkLogIndexes(db);

    const coll = db.collection<UserWorkLogDoc>(userWorkLogCollection);
    await runUserCarryOverIfNeeded(db, coll, session.sub, personId);
    await runTimerRolloverIfNeeded(coll, { userId: session.sub, personId });

    const filter: Record<string, unknown> = { userId: session.sub, personId };
    if (to) {
      filter.dateKey = { $gte: from, $lte: to };
    } else {
      filter.dateKey = { $gte: from };
    }

    const rows = await db
      .collection<UserWorkLogDoc>(userWorkLogCollection)
      .find(filter)
      .sort({ dateKey: -1 })
      .limit(400)
      .toArray();

    // Include legacy rows stored before personId existed (primary profile only).
    if (personId === PRIMARY_PERSON_ID) {
      const legacyFilter: Record<string, unknown> = {
        userId: session.sub,
        personId: { $exists: false },
      };
      if (to) {
        legacyFilter.dateKey = { $gte: from, $lte: to };
      } else {
        legacyFilter.dateKey = { $gte: from };
      }
      const legacy = await db
        .collection<UserWorkLogDoc>(userWorkLogCollection)
        .find(legacyFilter)
        .sort({ dateKey: -1 })
        .limit(400)
        .toArray();
      const byDate = new Map<string, UserWorkLogDoc[]>();
      for (const row of [...rows, ...legacy]) {
        const list = byDate.get(row.dateKey) ?? [];
        list.push(row);
        byDate.set(row.dateKey, list);
      }
      const days = [...byDate.entries()]
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([, docs]) => serializeUserWorkLogDay(collapseWorkLogDayRows(docs)));
      return NextResponse.json({ days, personId });
    }

    return NextResponse.json({ days: rows.map(serializeUserWorkLogDay), personId });
  } catch (e) {
    console.error("User work-log GET:", e);
    return NextResponse.json({ error: "Failed to list work log" }, { status: 500 });
  }
}
