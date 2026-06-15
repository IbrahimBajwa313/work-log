import { NextRequest, NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";
import { getAdminUsersList } from "@/lib/admin-stats";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { ensureUserWorkLogIndexes } from "@/lib/user-work-log";
import { ensureUserWorkLogSettingsIndexes } from "@/lib/user-work-log-settings";
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

    await Promise.all([
      ensureWorklogAccountIndexes(db),
      ensureUserWorkLogIndexes(db),
      ensureUserWorkLogSettingsIndexes(db),
    ]);

    const users = await getAdminUsersList(db);
    return NextResponse.json({ users });
  } catch (e) {
    console.error("Admin users GET:", e);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
