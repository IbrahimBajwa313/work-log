import { NextResponse } from "next/server";
import { WORKLOG_SESSION_COOKIE, worklogSessionCookieOptions } from "@/lib/worklog-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(WORKLOG_SESSION_COOKIE, "", { ...worklogSessionCookieOptions(), maxAge: 0 });
  return res;
}
