import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-session";

/**
 * Admin API routes accept either the legacy `x-admin-password` header (must match `ADMIN_PASSWORD`)
 * or a valid `admin_session` HTTP-only cookie (issued by POST `/api/admin/verify`).
 */
export async function isAdminRequestAuthorized(request: NextRequest): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  const header = request.headers.get("x-admin-password") || "";
  if (adminPassword && header === adminPassword) {
    return true;
  }
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return verifyAdminSession(token);
}
