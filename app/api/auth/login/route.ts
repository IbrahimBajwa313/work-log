import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { verifyWorklogPassword } from "@/lib/worklog-password";
import { rateLimit } from "@/lib/rate-limit";
import {
  normalizeWorklogEmail,
  worklogAccountsCollection,
} from "@/lib/worklog-accounts";
import {
  signWorklogSession,
  worklogSessionCookieOptions,
  WORKLOG_SESSION_COOKIE,
} from "@/lib/worklog-session";

function getClientIp(request: NextRequest) {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (request as any).ip || "unknown";
}

const loginBodySchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const ip = getClientIp(request);
    const ipBucket = rateLimit(`worklog-login:ip:${ip}`, 20, 900_000);
    if (!ipBucket.ok) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(ipBucket.retryAfterMs / 1000)) },
        }
      );
    }

    const raw = await request.json().catch(() => null);
    const parsed = loginBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const emailNorm = normalizeWorklogEmail(parsed.data.email);
    const emailBucket = rateLimit(`worklog-login:email:${emailNorm}`, 12, 900_000);
    if (!emailBucket.ok) {
      return NextResponse.json(
        { error: "Too many login attempts for this email. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(emailBucket.retryAfterMs / 1000)) },
        }
      );
    }

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);

    const account = await db.collection(worklogAccountsCollection).findOne({ email: emailNorm });
    const genericError = NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );

    if (!account || typeof account.passwordHash !== "string") {
      return genericError;
    }

    if (account.status === "removed") {
      return NextResponse.json(
        { error: "This account is no longer active." },
        { status: 403 }
      );
    }

    const ok = await verifyWorklogPassword(parsed.data.password, account.passwordHash);
    if (!ok) {
      return genericError;
    }

    const id = account._id instanceof ObjectId ? account._id : new ObjectId(String(account._id));
    const name = typeof account.name === "string" ? account.name : "";
    const token = await signWorklogSession({
      sub: id.toHexString(),
      email: emailNorm,
    });

    const res = NextResponse.json({
      success: true,
      user: { id: id.toHexString(), email: emailNorm, name },
    });
    res.cookies.set(WORKLOG_SESSION_COOKIE, token, worklogSessionCookieOptions());
    return res;
  } catch (error) {
    console.error("WorkLog login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
