"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Settings, Sparkles } from "lucide-react";
import { AppSplash } from "@/components/app-splash";
import {
  WorkLogSettingsContent,
  type WorkLogSettings,
} from "@/components/work-log/work-log-extras";
import { fetchWorkLogSettings, patchWorkLogSettings } from "@/lib/offline/work-log-api";
import {
  useWorkLogSessionGate,
  workLogAuthorizedInit,
} from "@/hooks/useWorkLogSessionGate";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export function WorkLogManageView() {
  const router = useRouter();
  const { ready, isAuthenticated, user } = useWorkLogSessionGate();
  const authorizedInit = useCallback(
    (init?: RequestInit) => workLogAuthorizedInit(init),
    []
  );

  const [settings, setSettings] = useState<WorkLogSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace("/");
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;
    const id = hash.slice(1);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [loading, settings]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const load = useCallback(async () => {
    if (!user?.id) return;
    setErrorMsg(null);
    if (!settingsRef.current) setLoading(true);
    try {
      const result = await fetchWorkLogSettings("/api/work-log/settings", user.id, authorizedInit);
      if (result.ok && result.data?.settings) {
        setSettings(result.data.settings as WorkLogSettings);
      } else {
        setSettings(null);
        setErrorMsg(result.error ?? "Failed to load settings.");
      }
    } catch {
      setErrorMsg("Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, authorizedInit]);

  useEffect(() => {
    if (user?.id) void load();
  }, [load, user?.id]);

  const handleSynced = useCallback(() => {
    void load();
  }, [load]);

  useOfflineSync({ authorizedInit, onSynced: handleSynced });

  const patchSettings = async (body: Record<string, unknown>) => {
    if (!user?.id) return false;
    setBusy(true);
    try {
      const result = await patchWorkLogSettings(
        "/api/work-log/settings",
        user.id,
        body,
        authorizedInit
      );
      if (!result.ok) {
        setErrorMsg(result.error ?? "Could not save.");
        return false;
      }
      if (result.data?.settings) {
        setSettings(result.data.settings as WorkLogSettings);
      }
      return true;
    } catch {
      setErrorMsg("Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <AppSplash />;

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden pb-16 pt-2 sm:pb-20">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float absolute -left-24 top-0 h-80 w-80 rounded-full bg-[var(--accent-cyan)]/10 blur-[120px]" />
        <div className="animate-float-slow absolute top-1/4 -right-20 h-96 w-96 rounded-full bg-[var(--accent-cyan)]/10 blur-[130px] [animation-delay:-4s]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 pt-2 sm:mb-8 sm:pt-4"
        >
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>

          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent-cyan)]">
            <Sparkles className="h-3.5 w-3.5" />
            Manage
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gradient-cyan sm:text-4xl">
            Work Logging settings
          </h1>
          <p className="mt-2 max-w-lg text-sm text-[var(--text-secondary)] sm:text-base">
            People you track, daily goals, task carry-over, and saved task templates.
          </p>
        </motion.header>

        {errorMsg ? (
          <p className="mb-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            {errorMsg}
          </p>
        ) : null}

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-cyan)]" />
          </div>
        ) : settings ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <WorkLogSettingsContent settings={settings} busy={busy} onPatch={patchSettings} />
          </motion.div>
        ) : (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Settings className="mx-auto mb-3 h-8 w-8 text-[var(--text-secondary)]" />
            <p className="text-sm text-[var(--text-secondary)]">Settings could not be loaded.</p>
          </div>
        )}
      </div>
    </div>
  );
}
