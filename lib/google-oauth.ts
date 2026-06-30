import { randomBytes } from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export const GOOGLE_OAUTH_STATE_COOKIE = "worklog_google_oauth_state";

export type GoogleOAuthIntent = "login" | "signup";

export type GoogleOAuthState = {
  nonce: string;
  intent: GoogleOAuthIntent;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

export function getGoogleOAuthRedirectUri(requestUrl: URL): string {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  return new URL("/api/auth/google/callback", requestUrl.origin).toString();
}

export function createGoogleOAuthState(intent: GoogleOAuthIntent): GoogleOAuthState {
  return {
    nonce: randomBytes(24).toString("hex"),
    intent,
  };
}

export function parseGoogleOAuthIntent(value: string | null): GoogleOAuthIntent {
  return value === "signup" ? "signup" : "login";
}

export function buildGoogleAuthUrl(params: {
  redirectUri: string;
  state: string;
}): string {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeGoogleAuthCode(params: {
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }

  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || "Token exchange failed";
    throw new Error(detail);
  }

  return { accessToken: data.access_token };
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await res.json().catch(() => ({}))) as Partial<GoogleUserInfo> & {
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message || "Failed to load Google profile");
  }

  if (!data.sub || !data.email) {
    throw new Error("Google profile is missing required fields");
  }

  if (data.email_verified === false) {
    throw new Error("Google email is not verified");
  }

  return {
    sub: data.sub,
    email: data.email,
    email_verified: data.email_verified,
    name: data.name,
    picture: data.picture,
  };
}

export function googleOAuthStateCookieOptions(maxAgeSec = 600): {
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
    path: "/api/auth/google",
    maxAge: maxAgeSec,
  };
}
