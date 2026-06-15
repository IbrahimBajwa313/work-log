import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

/** HTTP-only cookie; validated in API routes alongside `x-admin-password`. */
export const ADMIN_SESSION_COOKIE = "admin_session";

/** At least one day — admin stays signed in across navigations without re-entering password. */
const SESSION_MAX_AGE_SEC = 60 * 60 * 24; // 24 hours

function getSecretKey(): Uint8Array {
  const raw = process.env.ADMIN_SESSION_SECRET?.trim();
  const key =
    raw ||
    (process.env.NODE_ENV !== "production"
      ? "dev-only-admin-session-secret-min-32-chars!!"
      : "");
  if (!key) {
    return new TextEncoder().encode("__missing_admin_session_secret__");
  }
  return new TextEncoder().encode(key);
}

export async function signAdminSession(): Promise<string> {
  return new SignJWT({ role: "admin" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(getSecretKey());
}

export async function verifyAdminSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload.sub === "admin";
  } catch {
    return false;
  }
}

export function adminSessionCookieOptions(): {
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
