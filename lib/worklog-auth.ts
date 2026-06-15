import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  verifyWorklogSession,
  WORKLOG_SESSION_COOKIE,
  type WorklogJwtPayload,
} from "@/lib/worklog-session";

export async function getWorklogSessionFromRequest(
  request: NextRequest
): Promise<WorklogJwtPayload | null> {
  const token = request.cookies.get(WORKLOG_SESSION_COOKIE)?.value;
  return verifyWorklogSession(token);
}

export async function getWorklogSessionFromCookies(): Promise<WorklogJwtPayload | null> {
  const token = cookies().get(WORKLOG_SESSION_COOKIE)?.value;
  return verifyWorklogSession(token);
}
