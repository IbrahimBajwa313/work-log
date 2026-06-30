import { NextRequest, NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  createGoogleOAuthState,
  getGoogleOAuthRedirectUri,
  GOOGLE_OAUTH_STATE_COOKIE,
  googleOAuthStateCookieOptions,
  isGoogleOAuthConfigured,
  parseGoogleOAuthIntent,
} from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

function authErrorRedirect(request: NextRequest, code: string): NextResponse {
  const url = new URL("/", request.url);
  url.searchParams.set("auth_error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return authErrorRedirect(request, "google_not_configured");
  }

  const intent = parseGoogleOAuthIntent(request.nextUrl.searchParams.get("intent"));
  const oauthState = createGoogleOAuthState(intent);
  const redirectUri = getGoogleOAuthRedirectUri(request.nextUrl);

  let authUrl: string;
  try {
    authUrl = buildGoogleAuthUrl({
      redirectUri,
      state: oauthState.nonce,
    });
  } catch {
    return authErrorRedirect(request, "google_not_configured");
  }

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(
    GOOGLE_OAUTH_STATE_COOKIE,
    JSON.stringify(oauthState),
    googleOAuthStateCookieOptions()
  );
  return res;
}
