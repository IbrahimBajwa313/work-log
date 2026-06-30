import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { getWorklogSessionFromRequest } from "@/lib/worklog-auth";
import { worklogAccountsCollection } from "@/lib/worklog-accounts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const session = await getWorklogSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);

    const account = await db.collection(worklogAccountsCollection).findOne({
      _id: new ObjectId(session.sub),
      status: "active",
    });

    if (!account) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: session.sub,
        email: session.email,
        name: typeof account.name === "string" ? account.name : "",
        picture: typeof account.picture === "string" ? account.picture : undefined,
      },
    });
  } catch (error) {
    console.error("WorkLog me error:", error);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}
