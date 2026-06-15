/**
 * Admin dashboard `fetch` options: sends the HTTP-only session cookie and, when set, the legacy password header.
 */
export function adminAuthorizedInit(password: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  const trimmed = password.trim();
  if (trimmed) {
    headers.set("x-admin-password", trimmed);
  }
  return {
    ...init,
    credentials: "include",
    headers,
  };
}
