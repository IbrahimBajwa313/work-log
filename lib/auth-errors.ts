export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google sign-in is not set up yet. Use email and password, or ask the app owner to add Google OAuth credentials.",
  google_denied: "Google sign-in was cancelled.",
  google_failed: "Google sign-in failed. Please try again.",
  google_state_mismatch: "Google sign-in expired or was interrupted. Please try again.",
  google_rate_limited: "Too many Google sign-in attempts. Try again later.",
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] || "Sign-in failed. Please try again.";
}
