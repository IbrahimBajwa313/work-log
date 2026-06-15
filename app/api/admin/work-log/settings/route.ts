import { NextRequest, NextResponse } from "next/server";
import {
  applyAdminWorkLogSettingsAction,
  getOrCreateAdminWorkLogSettings,
  workLogSettingsActionSchema,
} from "@/lib/admin-work-log-settings";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { isAdminRequestAuthorized } from "@/lib/admin-auth";

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

    const settings = await getOrCreateAdminWorkLogSettings(db, "Me");
    return NextResponse.json({ settings });
  } catch (e) {
    console.error("Admin work-log settings GET:", e);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }
    if (!(await isAdminRequestAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = await request.json().catch(() => null);
    const parsed = workLogSettingsActionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);

    try {
      const settings = await applyAdminWorkLogSettingsAction(db, parsed.data, "Me");
      return NextResponse.json({ settings });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed";
      if (msg === "Person not found" || msg === "Template not found") {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      if (msg === "Cannot delete your primary profile") {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      throw e;
    }
  } catch (e) {
    console.error("Admin work-log settings PATCH:", e);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
