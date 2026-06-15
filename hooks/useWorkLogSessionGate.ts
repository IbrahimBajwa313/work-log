"use client";

import { useCallback, useEffect, useState } from "react";

export type WorklogUser = {
  id: string;
  email: string;
  name: string;
};

/**
 * Restores WorkLog UI from the `worklog_session` cookie and supports signup/login.
 */
export function useWorkLogSessionGate() {
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<WorklogUser | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { user?: WorklogUser };
        if (data.user) {
          setUser(data.user);
          setIsAuthenticated(true);
          return true;
        }
      }
      setUser(null);
      setIsAuthenticated(false);
      return false;
    } catch {
      setUser(null);
      setIsAuthenticated(false);
      return false;
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
      } else {
        await refreshSession();
      }
      return { ok: true as const };
    },
    [refreshSession]
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  return { ready, isAuthenticated, user, signup, login, logout };
}

export function workLogAuthorizedInit(init: RequestInit = {}): RequestInit {
  return { ...init, credentials: "include" };
}
