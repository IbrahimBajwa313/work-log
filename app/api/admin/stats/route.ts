import { NextRequest, NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { getAdminPlatformStats } from "@/lib/admin-stats";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { ensureUserWorkLogIndexes } from "@/lib/user-work-log";
import { ensureWorklogAccountIndexes } from "@/lib/worklog-accounts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }
    if (!(await isAdminRequestAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);

    await Promise.all([ensureWorklogAccountIndexes(db), ensureUserWorkLogIndexes(db)]);

    const stats = await getAdminPlatformStats(db);
    return NextResponse.json({ stats });
  } catch (e) {
    console.error("Admin stats GET:", e);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
