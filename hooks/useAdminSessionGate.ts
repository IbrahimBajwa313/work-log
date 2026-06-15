"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Restores admin UI from the `admin_session` cookie (≈24h) and supports POST `/api/admin/verify` login.
 */
export function useAdminSessionGate() {
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/session", { credentials: "include" });
        if (!cancelled && res.ok) {
          setIsAuthenticated(true);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (pwd: string) => {
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password: pwd }),
    });
    if (res.ok) {
      setPassword(pwd);
      setIsAuthenticated(true);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setPassword("");
    setIsAuthenticated(false);
  }, []);

  return { ready, isAuthenticated, setIsAuthenticated, password, setPassword, login, logout };
}
