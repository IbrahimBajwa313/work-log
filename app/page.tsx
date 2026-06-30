"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Eye, EyeOff, ListChecks, Loader2, Sparkles } from "lucide-react";
import { AppSplash } from "@/components/app-splash";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { authErrorMessage } from "@/lib/auth-errors";
import { WorkLogDashboard } from "@/components/work-log/work-log-dashboard";
import {
  SpotlightTour,
  markTourSeen,
  type SpotStep,
} from "@/components/spotlight-tour";
import {
  useWorkLogSessionGate,
  workLogAuthorizedInit,
} from "@/hooks/useWorkLogSessionGate";

function clickViewTab(view: "track" | "insights") {
  return () => {
    const el = document.querySelector(
      `[data-tour="view-tab-${view}"]`
    ) as HTMLElement | null;
    el?.click();
  };
}

/** Plan tabs only exist inside the Tracking view, so switch there first. */
function showPlan(id: "work" | "deen" | "fitness") {
  return () => {
    const viewEl = document.querySelector(
      `[data-tour="view-tab-track"]`
    ) as HTMLElement | null;
    viewEl?.click();
    setTimeout(() => {
      const el = document.querySelector(
        `[data-tour="plan-tab-${id}"]`
      ) as HTMLElement | null;
      el?.click();
    }, 90);
  };
}

export default function HomePage() {
  const { ready, isAuthenticated, user, signup, login, logout, signInWithGoogle, refreshSession } =
    useWorkLogSessionGate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/google/status");
        if (!res.ok) return;
        const data = (await res.json()) as { enabled?: boolean };
        if (!cancelled) setGoogleEnabled(Boolean(data.enabled));
      } catch {
        // Google button stays hidden when status cannot be loaded
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    const oauthSuccess = params.get("oauth") === "success";
    const isNewUser = params.get("new") === "1";

    if (authError) {
      setError(authErrorMessage(authError));
    }

    if (oauthSuccess) {
      void refreshSession().then((ok) => {
        if (ok && isNewUser) {
          setShowTour(true);
        }
      });
    }

    if (authError || oauthSuccess) {
      params.delete("auth_error");
      params.delete("oauth");
      params.delete("new");
      const next = params.toString();
      const nextUrl = next ? `${window.location.pathname}?${next}` : window.location.pathname;
      window.history.replaceState({}, "", nextUrl);
    }
  }, [ready, refreshSession]);

  const authorizedInit = useCallback(
    (init?: RequestInit) => workLogAuthorizedInit(init),
    []
  );

  const inputClass =
    "w-full px-4 py-3.5 bg-white/5 border border-[var(--card-border)] rounded-lg text-base text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35";

  const loginFeatures = [
    { Icon: Clock, text: "Track your work, faith & fitness time" },
    { Icon: ListChecks, text: "Tick off daily tasks as you go" },
    { Icon: Sparkles, text: "Morning & evening Azkar built in" },
  ] as const;

  const closeTour = useCallback(() => {
    setShowTour(false);
    markTourSeen(user?.email);
  }, [user?.email]);

  const tourSteps = useMemo<SpotStep[]>(
    () => [
      {
        selector: '[data-tour="dashboard-header"]',
        title: "Welcome to Work Logging 👋",
        body: "This is your daily dashboard. Here you track your time, tick off tasks, and build good habits. Let's take a 60-second tour of what each part does.",
        before: clickViewTab("track"),
        beforeDelay: 200,
      },
      {
        selector: '[data-tour="view-tab-track"]',
        title: "Two views: Tracking & Insights",
        body: "Use “Tracking” to log your day — timers, tasks, goals and notes. Switch to “Insights” when you want the charts, stats and full history. We'll visit both.",
        before: clickViewTab("track"),
        beforeDelay: 200,
      },
      {
        selector: '[data-tour="plan-tabs"]',
        title: "Your three daily areas",
        body: "Switch between Business (your work), Deen (faith), and Fitness. Each area keeps its own timer and to-do list.",
        before: showPlan("work"),
        beforeDelay: 320,
      },
      {
        selector: '[data-tour="timer"]',
        title: "Start & stop the timer",
        body: "Press Start when you begin and Stop when you finish — the app counts the minutes for you. No time to run it live? Type the hours/minutes under “Manual time”.",
        before: showPlan("work"),
        beforeDelay: 320,
      },
      {
        selector: '[data-tour="subtasks"]',
        title: "Add tasks for the day",
        body: "List what you want to get done, then tap the circle to mark each one complete. You can tag a task High/Medium/Low and add a time estimate.",
        before: showPlan("work"),
        beforeDelay: 320,
      },
      {
        selector: '[data-tour="azkar"]',
        title: "Morning & Evening Azkar",
        body: "Inside Deen you'll find the daily Azkar (morning & evening remembrances). Open one to read each du'ā in Arabic with its English meaning and reward, then tap as you recite — your progress is saved for the day.",
        before: showPlan("deen"),
        beforeDelay: 420,
      },
      {
        selector: '[data-tour="daily-goal"]',
        title: "Your daily goal",
        body: "Set a time goal for the day (say, 4 hours). This bar fills up as you log time so you always know how you're doing. Tap it to change the goal.",
        before: clickViewTab("track"),
        beforeDelay: 220,
      },
      {
        selector: '[data-tour="templates"]',
        title: "Saved task templates",
        body: "Have a routine you repeat daily? Save it once, then add all those tasks with a single tap instead of retyping them.",
        before: clickViewTab("track"),
        beforeDelay: 220,
      },
      {
        selector: '[data-tour="person-tabs"]',
        title: "Track more than one person",
        body: "Manage separate profiles from the same account — handy if you're logging time for a team or family.",
      },
      {
        selector: '[data-tour="notes"]',
        title: "Day notes",
        body: "Jot down anything worth remembering about the day — wins, blockers, or reminders.",
        before: clickViewTab("track"),
        beforeDelay: 220,
      },
      {
        selector: '[data-tour="stats"]',
        title: "Your numbers at a glance",
        body: "Flip to “Insights” for the big picture: today's total, the last 7 days, this month, your day streak 🔥, and how many tasks you've completed.",
        before: clickViewTab("insights"),
        beforeDelay: 260,
      },
      {
        selector: '[data-tour="chart"]',
        title: "See your progress",
        body: "This chart shows your hours for the last 14 days, split by Business, Deen, and Fitness, so you can spot your best days.",
        before: clickViewTab("insights"),
        beforeDelay: 220,
      },
      {
        selector: '[data-tour="history"]',
        title: "Look back anytime",
        body: "Every past day is saved here. Tap any day to expand it and see exactly what you did.",
        before: clickViewTab("insights"),
        beforeDelay: 220,
      },
      {
        selector: '[data-tour="tour-btn"]',
        title: "Replay this anytime",
        body: "That's it! Click “Tour” here whenever you'd like to see this walkthrough again. Enjoy logging your day 🎉",
      },
    ],
    []
  );

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
      } else if (mode === "signup") {
        setShowTour(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return <AppSplash />;
  }

  if (!isAuthenticated) {
    return (
      <div
        className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden px-3 py-6 safe-top safe-bottom sm:px-4 sm:py-16"
        style={{ background: "var(--bg-gradient)" }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-float-slow absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[var(--accent-cyan)]/10 blur-[130px]" />
          <div className="animate-float-slow absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-cyan-400/10 blur-[140px] [animation-delay:-7s]" />
        </div>
        <div className="relative w-full max-w-lg">
          <div className="glass-card rounded-2xl p-5 sm:p-10">
            <div className="mb-6 text-center sm:mb-8">
              <div className="relative mx-auto mb-4 inline-block sm:mb-5">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-3 rounded-full bg-[var(--accent-cyan)]/15 blur-2xl"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="Work Logging by TechCognify"
                  className="relative h-14 w-auto sm:h-16"
                />
              </div>
              <h1 className="text-2xl font-bold text-white sm:text-[1.65rem]">
                Your simple daily planner
              </h1>
              <p className="text-[var(--text-secondary)] text-base mt-2 leading-relaxed">
                {mode === "signup"
                  ? "Create a free account — it only takes a minute."
                  : "Welcome back! Sign in to continue your day."}
              </p>
            </div>

            <ul className="mb-6 space-y-2.5 rounded-xl border border-[var(--card-border)] bg-white/[0.03] p-3.5 sm:mb-8 sm:space-y-3 sm:p-4">
              {loginFeatures.map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-white/90">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-cyan)]/25 bg-[var(--accent-cyan)]/10 sm:h-8 sm:w-8">
                    <Icon className="h-4 w-4 text-[var(--accent-cyan)]" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>

            <div className="mb-6 flex flex-col gap-2 rounded-xl border border-[var(--card-border)] bg-white/5 p-1.5 sm:flex-row sm:gap-0">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-lg py-3.5 text-base font-semibold transition-colors touch-target sm:py-2.5 ${
                  mode === "login"
                    ? "bg-[var(--accent-cyan)] text-[#070d0d]"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                <span className="sm:hidden">Sign in</span>
                <span className="hidden sm:inline">I have an account</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-lg py-3.5 text-base font-semibold transition-colors touch-target sm:py-2.5 ${
                  mode === "signup"
                    ? "bg-[var(--accent-cyan)] text-[#070d0d]"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                <span className="sm:hidden">Create account</span>
                <span className="hidden sm:inline">New here? Sign up</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {googleEnabled ? (
                <>
                  <GoogleSignInButton
                    intent={mode}
                    disabled={submitting}
                    onClick={signInWithGoogle}
                  />
                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-[var(--card-border)]" />
                    <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                      or
                    </span>
                    <div className="h-px flex-1 bg-[var(--card-border)]" />
                  </div>
                </>
              ) : null}

              {mode === "signup" ? (
                <div>
                  <label htmlFor="name" className="block text-white text-sm font-medium mb-2">
                    Your name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Sarah Ahmed"
                    required
                    minLength={2}
                    autoComplete="name"
                  />
                </div>
              ) : null}

              <div>
                <label htmlFor="email" className="block text-white text-sm font-medium mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-white text-sm font-medium mb-2">
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
                    placeholder={mode === "signup" ? "At least 6 characters" : "Enter your password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-secondary)] hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {mode === "signup" ? (
                  <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                    Pick something you&apos;ll remember — at least 6 characters.
                  </p>
                ) : null}
              </div>

              {error ? (
                <p className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-cyan-2)] py-3.5 px-4 text-base font-extrabold text-[#070d0d] shadow-[0_0_24px_-6px_var(--accent-cyan-glow)] transition-all hover:shadow-[0_0_30px_-4px_var(--accent-cyan-glow)] hover:brightness-105 disabled:opacity-50"
              >
                {submitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Please wait…
                  </span>
                ) : mode === "signup" ? (
                  "Create my free account"
                ) : (
                  "Sign in to my planner"
                )}
              </button>
            </form>

            <p className="mt-5 flex flex-col items-center gap-1.5 text-center text-xs leading-relaxed text-[var(--text-secondary)] sm:mt-6 sm:flex-row sm:justify-center sm:gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400 sm:mt-0.5" />
              <span>Free to use · Private · No credit card</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <WorkLogDashboard
        apiBase="/api/work-log"
        settingsApiBase="/api/work-log/settings"
        authorizedInit={authorizedInit}
        title="Work Logging"
        subtitle="Log your day in three simple areas: Work, Deen & Fitness"
        userEmail={user?.email}
        userName={user?.name}
        offlineUserId={user?.id}
        onLogout={logout}
        onStartTour={() => setShowTour(true)}
      />
      <SpotlightTour open={showTour} steps={tourSteps} onClose={closeTour} />
    </>
  );
}
