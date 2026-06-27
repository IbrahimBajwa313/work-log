"use client";

import Link from "next/link";
import { Loader2, Moon, Sun, Target } from "lucide-react";
import { useAdminSessionGate } from "@/hooks/useAdminSessionGate";
import { adminAuthorizedInit } from "@/lib/admin-api";

type AdminShellProps = {
  active: "dashboard" | "work-log";
  title: string;
  subtitle?: string;
  /** Skip padded main wrapper (for full-page embeds like WorkLogDashboard). */
  bare?: boolean;
  children: (ctx: {
    authorizedInit: (init?: RequestInit) => RequestInit;
    logout: () => Promise<void>;
  }) => React.ReactNode;
};

const inputClass =
  "w-full px-4 py-2.5 bg-white/5 border border-[var(--card-border)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35";

const navLinkClass = (isActive: boolean) =>
  `inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
    isActive
      ? "bg-[var(--accent-cyan)] text-[#070d0d]"
      : "text-[var(--text-secondary)] hover:text-white hover:bg-white/5"
  }`;

export function AdminShell({ active, title, subtitle, bare, children }: AdminShellProps) {
  const { ready, isAuthenticated, password, setPassword, login, logout } = useAdminSessionGate();

  const authorizedInit = (init?: RequestInit) => adminAuthorizedInit(password, init);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await login(password);
    if (!ok) alert("Invalid password");
  };

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
            Sign in to view users, activity, and manage the platform
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
    <div className="min-h-screen" style={{ background: "var(--bg-gradient)" }}>
      <header className="border-b border-[var(--card-border)] bg-[var(--card-bg)]/60 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-[var(--accent-cyan)] to-teal-300 bg-clip-text text-transparent">
              {title}
            </h1>
            {subtitle ? <p className="text-sm text-[var(--text-secondary)] mt-0.5">{subtitle}</p> : null}
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            <Link href="/admin" className={navLinkClass(active === "dashboard")}>
              Admin
            </Link>
            <Link href="/admin/work-log" className={navLinkClass(active === "work-log")}>
              Work log
            </Link>
            <span className="hidden h-4 w-px bg-[var(--card-border)] sm:block" aria-hidden />
            <Link href="/" className={navLinkClass(false)}>
              Dashboard
            </Link>
            <Link href="/monthly-targets" className={navLinkClass(false)}>
              <Target className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Monthly</span>
            </Link>
            <Link href="/morning-azkar" className={navLinkClass(false)}>
              <Sun className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Morning</span>
            </Link>
            <Link href="/evening-azkar" className={navLinkClass(false)}>
              <Moon className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Evening</span>
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="px-3 py-1.5 rounded-md text-sm font-semibold text-red-300 hover:bg-red-500/10"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>
      {bare ? (
        children({ authorizedInit, logout })
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children({ authorizedInit, logout })}</main>
      )}
    </div>
  );
}
