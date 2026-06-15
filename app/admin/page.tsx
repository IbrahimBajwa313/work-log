"use client";

import { useCallback } from "react";
import { Loader2 } from "lucide-react";
import { WorkLogDashboard } from "@/components/work-log/work-log-dashboard";
import { useAdminSessionGate } from "@/hooks/useAdminSessionGate";
import { adminAuthorizedInit } from "@/lib/admin-api";

export default function AdminWorkLogPage() {
  const { ready, isAuthenticated, password, setPassword, login } = useAdminSessionGate();

  const authorizedInit = useCallback(
    (init?: RequestInit) => adminAuthorizedInit(password, init),
    [password]
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await login(password);
    if (!ok) alert("Invalid password");
  };

  const inputClass =
    "w-full px-4 py-2.5 bg-white/5 border border-[var(--card-border)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35";

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-gradient)" }}>
        <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-cyan)]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4 py-16"
        style={{ background: "var(--bg-gradient)" }}
      >
        <div className="w-full max-w-md bg-[var(--card-bg)]/90 border border-[var(--card-border)] rounded-xl p-8">
          <h1 className="text-2xl font-extrabold text-white mb-2">Admin login</h1>
          <p className="text-[var(--text-secondary)] text-sm mb-6">
            Sign in to track business work, Ilme Deen, tasks & goals
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-[var(--text-secondary)] text-sm font-medium mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-[var(--accent-cyan)] hover:opacity-90 text-[#070d0d] font-extrabold py-2.5 px-4 rounded-md"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <WorkLogDashboard
      apiBase="/api/admin/work-log"
      settingsApiBase="/api/admin/work-log/settings"
      authorizedInit={authorizedInit}
      backHref="/"
      backLabel="Home"
      title="WorkLog Admin"
      subtitle="Track business work, Ilme Deen, tasks & goals"
    />
  );
}
