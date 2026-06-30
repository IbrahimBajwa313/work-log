import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { hashWorklogPassword, isWorklogPasswordValid } from "@/lib/worklog-password";
import { rateLimit } from "@/lib/rate-limit";
import {
  ensureWorklogAccountIndexes,
  normalizeWorklogEmail,
  normalizeWorklogName,
  worklogAccountsCollection,
} from "@/lib/worklog-accounts";
import { accountUsesGoogleOnly } from "@/lib/worklog-google-auth";
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

const signupBodySchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(120),
  password: z.string().min(6).max(200),
});

export async function POST(request: NextRequest) {
  try {
    if (!getMongoUri()) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const ip = getClientIp(request);
    const ipBucket = rateLimit(`worklog-signup:ip:${ip}`, 8, 900_000);
    if (!ipBucket.ok) {
      return NextResponse.json(
        { error: "Too many signup attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(ipBucket.retryAfterMs / 1000)) },
        }
      );
    }

    const raw = await request.json().catch(() => null);
    const parsed = signupBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const emailNorm = normalizeWorklogEmail(parsed.data.email);
    const emailBucket = rateLimit(`worklog-signup:email:${emailNorm}`, 5, 3_600_000);
    if (!emailBucket.ok) {
      return NextResponse.json(
        { error: "Too many signup attempts for this email. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(emailBucket.retryAfterMs / 1000)) },
        }
      );
    }

    if (!isWorklogPasswordValid(parsed.data.password)) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const nameNorm = normalizeWorklogName(parsed.data.name);
    const passwordHash = await hashWorklogPassword(parsed.data.password);
    const now = new Date();

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);
    await ensureWorklogAccountIndexes(db);

    const existing = await db.collection(worklogAccountsCollection).findOne({ email: emailNorm });
    if (existing) {
      if (accountUsesGoogleOnly(existing)) {
        return NextResponse.json(
          { error: "This email is registered with Google. Continue with Google instead." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "An account already exists for this email. Sign in instead." },
        { status: 409 }
      );
    }

    let insertedId: ObjectId;
    try {
      const result = await db.collection(worklogAccountsCollection).insertOne({
        email: emailNorm,
        name: nameNorm,
        passwordHash,
        authProviders: ["password"],
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      insertedId = result.insertedId;
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? (e as { code: number }).code : 0;
      if (code === 11000) {
        return NextResponse.json(
          { error: "An account already exists for this email. Sign in instead." },
          { status: 409 }
        );
      }
      throw e;
    }

    const token = await signWorklogSession({
      sub: insertedId.toHexString(),
      email: emailNorm,
    });

    const res = NextResponse.json({
      success: true,
      user: { id: insertedId.toHexString(), email: emailNorm, name: nameNorm },
    });
    res.cookies.set(WORKLOG_SESSION_COOKIE, token, worklogSessionCookieOptions());
    return res;
  } catch (error) {
    console.error("WorkLog signup error:", error);
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
