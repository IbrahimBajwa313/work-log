"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  Moon,
  Sun,
} from "lucide-react";
import type { AdhkarItem, AzkarPeriod } from "@/lib/azkar";
import { AZKAR_PERIOD_CONFIG } from "@/lib/data/azkar-config";
import { useWorkLogSessionGate } from "@/hooks/useWorkLogSessionGate";

type AzkarApiState = {
  items: AdhkarItem[];
  tickedIds: string[];
  complete: boolean;
  total: number;
  read: number;
};

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function AdhkarCard({
  item,
  index,
  ticked,
  busy,
  onToggle,
  config,
}: {
  item: AdhkarItem;
  index: number;
  ticked: boolean;
  busy: boolean;
  onToggle: () => void;
  config: (typeof AZKAR_PERIOD_CONFIG)[AzkarPeriod];
}) {
  const [openTranslation, setOpenTranslation] = useState(false);
  const [openVirtue, setOpenVirtue] = useState(false);
  const hasVirtue = item.virtue.trim().length > 0;

  return (
    <article
      className={`rounded-xl border p-5 transition-colors ${
        ticked ? `${config.accentBorder} ${config.accentBg}` : "border-[var(--card-border)] bg-[var(--card-bg)]/80"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className="shrink-0 mt-0.5"
          aria-label={ticked ? "Mark as unread" : "Mark as read"}
        >
          {ticked ? (
            <CheckCircle2 className={`w-6 h-6 ${config.accentMuted}`} />
          ) : (
            <Circle className="w-6 h-6 text-[var(--text-secondary)]" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-bold text-[var(--text-secondary)]">#{index + 1}</span>
            <h2 className="text-base font-bold text-white">{item.title}</h2>
            <span className={`text-xs font-semibold rounded-full border px-2 py-0.5 ${config.accentText} border-current/30 bg-white/5`}>
              {item.repeatCount}x
            </span>
          </div>
          <p
            className="text-xl leading-loose text-right text-white whitespace-pre-line"
            dir="rtl"
            lang="ar"
          >
            {item.arabic}
          </p>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => setOpenTranslation((v) => !v)}
              className="w-full flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm font-semibold text-[var(--accent-cyan)] hover:bg-white/10"
            >
              Translation
              {openTranslation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {openTranslation ? (
              <p className="text-sm leading-relaxed text-[var(--text-secondary)] px-1">{item.translation}</p>
            ) : null}

            {hasVirtue ? (
              <>
                <button
                  type="button"
                  onClick={() => setOpenVirtue((v) => !v)}
                  className={`w-full flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-white/5 px-3 py-2 text-sm font-semibold ${config.accentText} hover:bg-white/10`}
                >
                  Virtue
                  {openVirtue ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {openVirtue ? (
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)] px-1">{item.virtue}</p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export function AzkarReaderView({ period }: { period: AzkarPeriod }) {
  const config = AZKAR_PERIOD_CONFIG[period];
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, isAuthenticated } = useWorkLogSessionGate();

  const dateKey = searchParams.get("date") || localDateKey();
  const personId = searchParams.get("personId") || "primary";

  const [state, setState] = useState<AzkarApiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = personId ? `?personId=${encodeURIComponent(personId)}` : "";
      const res = await fetch(`/api/work-log/${dateKey}/azkar/${period}${qs}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : "Failed to load"
        );
      }
      setState({
        items: (data as AzkarApiState).items,
        tickedIds: (data as AzkarApiState).tickedIds ?? [],
        complete: Boolean((data as AzkarApiState).complete),
        total: (data as AzkarApiState).total ?? 0,
        read: (data as AzkarApiState).read ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to load ${period} azkar`);
    } finally {
      setLoading(false);
    }
  }, [dateKey, personId, period]);

  useEffect(() => {
    if (ready && isAuthenticated) void load();
  }, [ready, isAuthenticated, load]);

  const tickedSet = useMemo(() => new Set(state?.tickedIds ?? []), [state?.tickedIds]);

  const toggle = async (adhkarId: string) => {
    setBusyId(adhkarId);
    try {
      const qs = personId ? `?personId=${encodeURIComponent(personId)}` : "";
      const res = await fetch(`/api/work-log/${dateKey}/azkar/${period}${qs}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", adhkarId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error("Failed to save progress");
      setState({
        items: (data as AzkarApiState).items ?? state?.items ?? [],
        tickedIds: (data as AzkarApiState).tickedIds ?? [],
        complete: Boolean((data as AzkarApiState).complete),
        total: (data as AzkarApiState).total ?? 0,
        read: (data as AzkarApiState).read ?? 0,
      });
    } catch {
      setError("Could not save progress. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const HeaderIcon = config.headerIcon === "sun" ? Sun : Moon;

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-gradient)" }}>
        <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-cyan)]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg-gradient)" }}>
        <div className="text-center max-w-md">
          <p className="text-white mb-4">{config.signInMessage}</p>
          <Link href="/" className="text-[var(--accent-cyan)] font-semibold hover:underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white pb-16" style={{ background: "var(--bg-gradient)" }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Work Log
        </button>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <HeaderIcon className={`w-5 h-5 ${config.accentMuted}`} />
            <p className={`text-xs uppercase tracking-wider font-bold ${config.accentText}`}>{config.label}</p>
          </div>
          <h1 className={`text-3xl font-extrabold bg-gradient-to-r ${config.progressFrom} ${config.progressTo} bg-clip-text text-transparent`}>
            {config.title}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">{config.intro}</p>
        </header>

        {state ? (
          <div className="mb-6 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Progress:{" "}
                <span className="font-bold text-white">
                  {state.read} / {state.total}
                </span>{" "}
                adhkār read
              </p>
              {state.complete ? (
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${config.accentText} border-current/40 bg-white/5`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {config.completeLabel}
                </span>
              ) : null}
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${config.progressFrom} ${config.progressTo} transition-all`}
                style={{ width: state.total ? `${(state.read / state.total) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-cyan)]" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-6 text-center">
            <p className="text-red-300 mb-4">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="bg-[var(--accent-cyan)] text-[#070d0d] font-bold px-4 py-2 rounded-md"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {state?.items.map((item, index) => (
              <AdhkarCard
                key={item.id}
                item={item}
                index={index}
                ticked={tickedSet.has(item.id)}
                busy={busyId === item.id}
                onToggle={() => void toggle(item.id)}
                config={config}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
