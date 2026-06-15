"use client";

import { useCallback, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { WorkLogDashboard } from "@/components/work-log/work-log-dashboard";
import {
  useWorkLogSessionGate,
  workLogAuthorizedInit,
} from "@/hooks/useWorkLogSessionGate";

export default function HomePage() {
  const { ready, isAuthenticated, user, signup, login, logout } = useWorkLogSessionGate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const authorizedInit = useCallback(
    (init?: RequestInit) => workLogAuthorizedInit(init),
    []
  );

  const inputClass =
    "w-full px-4 py-2.5 bg-white/5 border border-[var(--card-border)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "signup"
          ? await signup(name, email, password)
          : await login(email, password);
      if (!result.ok) {
        setError(result.error);
      }
    } finally {
      setSubmitting(false);
    }
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
        <div className="w-full max-w-md">
          <div className="bg-[var(--card-bg)]/90 border border-[var(--card-border)] rounded-xl p-8">
            <div className="mb-6 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Work Logging by TechCognify"
                className="mx-auto mb-4 h-14 w-auto"
              />
              <p className="text-[var(--text-secondary)] text-sm mt-2">
                Create a free account to track your daily work, tasks, and goals.
              </p>
            </div>

            <div className="mb-6 flex rounded-lg border border-[var(--card-border)] bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
                  mode === "login"
                    ? "bg-[var(--accent-cyan)] text-[#070d0d]"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
                  mode === "signup"
                    ? "bg-[var(--accent-cyan)] text-[#070d0d]"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" ? (
                <div>
                  <label htmlFor="name" className="block text-[var(--text-secondary)] text-sm font-medium mb-2">
                    Full name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                    required
                    minLength={2}
                    autoComplete="name"
                  />
                </div>
              ) : null}

              <div>
                <label htmlFor="email" className="block text-[var(--text-secondary)] text-sm font-medium mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-[var(--text-secondary)] text-sm font-medium mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-11`}
                    required
                    minLength={mode === "signup" ? 6 : 1}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error ? (
                <p className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[var(--accent-cyan)] hover:opacity-90 text-[#070d0d] font-extrabold py-2.5 px-4 rounded-md disabled:opacity-50"
              >
                {submitting ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WorkLogDashboard
      apiBase="/api/work-log"
      settingsApiBase="/api/work-log/settings"
      authorizedInit={authorizedInit}
      title="Work Logging"
      subtitle="Track business work, Deen, fitness, tasks & goals"
      userEmail={user?.email}
      userName={user?.name}
      onLogout={logout}
    />
  );
}
