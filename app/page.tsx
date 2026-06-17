"use client";

import { useCallback, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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
  const { ready, isAuthenticated, user, signup, login, logout } = useWorkLogSessionGate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showTour, setShowTour] = useState(false);

  const authorizedInit = useCallback(
    (init?: RequestInit) => workLogAuthorizedInit(init),
    []
  );

  const inputClass =
    "w-full px-4 py-2.5 bg-white/5 border border-[var(--card-border)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/35";

  const closeTour = useCallback(() => {
    setShowTour(false);
    markTourSeen(user?.email);
  }, [user?.email]);

  const tourSteps = useMemo<SpotStep[]>(
    () => [
      {
        selector: '[data-tour="logo"]',
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
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-gradient)" }}>
        <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-cyan)]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-16"
        style={{ background: "var(--bg-gradient)" }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-float-slow absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[var(--accent-cyan)]/10 blur-[130px]" />
          <div className="animate-float-slow absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-cyan-400/10 blur-[140px] [animation-delay:-7s]" />
        </div>
        <div className="relative w-full max-w-md">
          <div className="glass-card rounded-2xl p-8">
            <div className="mb-6 text-center">
              <div className="relative mx-auto mb-4 inline-block">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-3 rounded-full bg-[var(--accent-cyan)]/15 blur-2xl"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="Work Logging by TechCognify"
                  className="relative h-14 w-auto"
                />
              </div>
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
                className="w-full rounded-lg bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-cyan-2)] py-2.5 px-4 font-extrabold text-[#070d0d] shadow-[0_0_24px_-6px_var(--accent-cyan-glow)] transition-all hover:shadow-[0_0_30px_-4px_var(--accent-cyan-glow)] hover:brightness-105 disabled:opacity-50"
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
    <>
      <WorkLogDashboard
        apiBase="/api/work-log"
        settingsApiBase="/api/work-log/settings"
        authorizedInit={authorizedInit}
        title="Work Logging"
        subtitle="Track business work, Deen, fitness, tasks & goals"
        userEmail={user?.email}
        userName={user?.name}
        onLogout={logout}
        onStartTour={() => setShowTour(true)}
      />
      <SpotlightTour open={showTour} steps={tourSteps} onClose={closeTour} />
    </>
  );
}
