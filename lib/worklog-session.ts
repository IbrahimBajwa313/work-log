import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

export const WORKLOG_SESSION_COOKIE = "worklog_session";

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14;

export type WorklogJwtPayload = {
  sub: string;
  email: string;
};

function getSecretKey(): Uint8Array {
  const raw = process.env.WORKLOG_SESSION_SECRET?.trim();
  const key =
    raw ||
    (process.env.NODE_ENV !== "production"
      ? "dev-only-worklog-session-secret-min-32-chars!!"
      : "");
  if (!key) {
    return new TextEncoder().encode("__missing_worklog_session_secret__");
  }
  return new TextEncoder().encode(key);
}

export async function signWorklogSession(payload: WorklogJwtPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(getSecretKey());
}

export async function verifyWorklogSession(
  token: string | undefined
): Promise<WorklogJwtPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!sub || !email) return null;
    return { sub, email };
  } catch {
    return null;
  }
}

export function worklogSessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}
