"use client";

import { useCallback, useEffect, useState } from "react";
import { cacheUser, clearCachedUser, getCachedUser } from "@/lib/offline/store";

export type WorklogUser = {
  id: string;
  email: string;
  name: string;
  picture?: string;
};

/**
 * Restores WorkLog UI from the `worklog_session` cookie and supports signup/login.
 * Caches the user locally so the app stays usable offline after a successful sign-in.
 */
export function useWorkLogSessionGate() {
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<WorklogUser | null>(null);

  const refreshSession = useCallback(async () => {
    const tryCachedUser = async () => {
      const cached = await getCachedUser();
      if (cached) {
        setUser(cached);
        setIsAuthenticated(true);
        return true;
      }
      return false;
    };

    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline) {
      const ok = await tryCachedUser();
      if (!ok) {
        setUser(null);
        setIsAuthenticated(false);
      }
      return ok;
    }

    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { user?: WorklogUser };
        if (data.user) {
          setUser(data.user);
          setIsAuthenticated(true);
          await cacheUser(data.user);
          return true;
        }
      }

      const ok = await tryCachedUser();
      if (!ok) {
        setUser(null);
        setIsAuthenticated(false);
      }
      return ok;
    } catch {
      const ok = await tryCachedUser();
      if (!ok) {
        setUser(null);
        setIsAuthenticated(false);
      }
      return ok;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshSession();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; user?: WorklogUser };
      if (!res.ok) {
        return { ok: false as const, error: data.error || "Signup failed" };
      }
      if (data.user) {
        setUser(data.user);
        setIsAuthenticated(true);
        await cacheUser(data.user);
      } else {
        await refreshSession();
      }
      return { ok: true as const };
    },
    [refreshSession]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; user?: WorklogUser };
      if (!res.ok) {
        return { ok: false as const, error: data.error || "Login failed" };
      }
      if (data.user) {
        setUser(data.user);
        setIsAuthenticated(true);
        await cacheUser(data.user);
      } else {
        await refreshSession();
      }
      return { ok: true as const };
    },
    [refreshSession]
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // still clear local session when offline
    }
    await clearCachedUser();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const signInWithGoogle = useCallback((intent: "login" | "signup" = "login") => {
    const params = new URLSearchParams({ intent });
    window.location.assign(`/api/auth/google?${params.toString()}`);
  }, []);

  return { ready, isAuthenticated, user, signup, login, logout, signInWithGoogle, refreshSession };
}

export function workLogAuthorizedInit(init: RequestInit = {}): RequestInit {
  return { ...init, credentials: "include" };
}
