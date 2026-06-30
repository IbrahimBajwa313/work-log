import { NextRequest, NextResponse } from "next/server";
import { connectMongoDb, defaultDbName, getMongoUri } from "@/lib/mongodb";
import { rateLimit } from "@/lib/rate-limit";
import {
  exchangeGoogleAuthCode,
  fetchGoogleUserInfo,
  getGoogleOAuthRedirectUri,
  GOOGLE_OAUTH_STATE_COOKIE,
  googleOAuthStateCookieOptions,
  isGoogleOAuthConfigured,
  type GoogleOAuthState,
} from "@/lib/google-oauth";
import { signInWithGoogleAccount } from "@/lib/worklog-google-auth";
import {
  signWorklogSession,
  worklogSessionCookieOptions,
  WORKLOG_SESSION_COOKIE,
} from "@/lib/worklog-session";

export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest) {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (request as any).ip || "unknown";
}

function authErrorRedirect(request: NextRequest, code: string): NextResponse {
  const url = new URL("/", request.url);
  url.searchParams.set("auth_error", code);
  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
    ...googleOAuthStateCookieOptions(0),
    maxAge: 0,
  });
  return res;
}

function readOAuthState(raw: string | undefined): GoogleOAuthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GoogleOAuthState>;
    if (
      typeof parsed.nonce === "string" &&
      parsed.nonce.length >= 16 &&
      (parsed.intent === "login" || parsed.intent === "signup")
    ) {
      return { nonce: parsed.nonce, intent: parsed.intent };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const clearStateCookie = (res: NextResponse) => {
    res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
      ...googleOAuthStateCookieOptions(0),
      maxAge: 0,
    });
    return res;
  };

  try {
    if (!isGoogleOAuthConfigured() || !getMongoUri()) {
      return authErrorRedirect(request, "google_not_configured");
    }

    const oauthError = request.nextUrl.searchParams.get("error");
    if (oauthError) {
      return authErrorRedirect(
        request,
        oauthError === "access_denied" ? "google_denied" : "google_failed"
      );
    }

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const storedState = readOAuthState(request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value);

    if (!code || !state || !storedState || state !== storedState.nonce) {
      return authErrorRedirect(request, "google_state_mismatch");
    }

    const ip = getClientIp(request);
    const ipBucket = rateLimit(`worklog-google-oauth:ip:${ip}`, 20, 900_000);
    if (!ipBucket.ok) {
      return authErrorRedirect(request, "google_rate_limited");
    }

    const redirectUri = getGoogleOAuthRedirectUri(request.nextUrl);
    const { accessToken } = await exchangeGoogleAuthCode({ code, redirectUri });
    const profile = await fetchGoogleUserInfo(accessToken);

    const emailBucket = rateLimit(
      `worklog-google-oauth:email:${profile.email.toLowerCase()}`,
      12,
      900_000
    );
    if (!emailBucket.ok) {
      return authErrorRedirect(request, "google_rate_limited");
    }

    const clientOrErr = await connectMongoDb();
    if (clientOrErr instanceof NextResponse) return clientOrErr;
    const db = clientOrErr.db(defaultDbName);

    const user = await signInWithGoogleAccount(db, profile);
    const token = await signWorklogSession({
      sub: user.id,
      email: user.email,
    });

    const url = new URL("/", request.url);
    url.searchParams.set("oauth", "success");
    if (user.isNewUser || storedState.intent === "signup") {
      url.searchParams.set("new", "1");
    }

    const res = clearStateCookie(NextResponse.redirect(url));
    res.cookies.set(WORKLOG_SESSION_COOKIE, token, worklogSessionCookieOptions());
    return res;
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return authErrorRedirect(request, "google_failed");
  }
}
