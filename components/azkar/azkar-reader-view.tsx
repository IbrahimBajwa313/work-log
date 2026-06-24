"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Minus,
  Moon,
  Plus,
  Sun,
  Type,
} from "lucide-react";
import type { AdhkarItem, AzkarPeriod } from "@/lib/azkar";
import { AZKAR_PERIOD_CONFIG, getAdhkarForPeriod } from "@/lib/data/azkar-config";
import { useWorkLogSessionGate } from "@/hooks/useWorkLogSessionGate";
import { fetchAzkarState, patchAzkar } from "@/lib/offline/azkar-api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { AppSplash } from "@/components/app-splash";

type AzkarApiState = {
  items: AdhkarItem[];
  tickedIds: string[];
  complete: boolean;
  total: number;
  read: number;
  secondsSpent: number;
};

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildInitialAzkarState(period: AzkarPeriod): AzkarApiState {
  const items = getAdhkarForPeriod(period);
  return {
    items,
    tickedIds: [],
    complete: false,
    total: items.length,
    read: 0,
    secondsSpent: 0,
  };
}
const AZKAR_FONT_SIZE_KEY = "azkar-arabic-font-size";
const AZKAR_FONT_SIZES_PX = [18, 22, 26, 30, 34, 38] as const;
const AZKAR_FONT_SIZE_DEFAULT_INDEX = 1;

function useAzkarFontSize() {
  const [sizeIndex, setSizeIndex] = useState(AZKAR_FONT_SIZE_DEFAULT_INDEX);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AZKAR_FONT_SIZE_KEY);
      if (stored === null) return;
      const parsed = Number.parseInt(stored, 10);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed < AZKAR_FONT_SIZES_PX.length) {
        setSizeIndex(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const decrease = useCallback(() => {
    setSizeIndex((current) => {
      const next = Math.max(0, current - 1);
      try {
        window.localStorage.setItem(AZKAR_FONT_SIZE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const increase = useCallback(() => {
    setSizeIndex((current) => {
      const next = Math.min(AZKAR_FONT_SIZES_PX.length - 1, current + 1);
      try {
        window.localStorage.setItem(AZKAR_FONT_SIZE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  return {
    arabicFontSizePx: AZKAR_FONT_SIZES_PX[sizeIndex],
    canDecrease: sizeIndex > 0,
    canIncrease: sizeIndex < AZKAR_FONT_SIZES_PX.length - 1,
    decrease,
    increase,
  };
}

function AzkarFontSizeControls({
  arabicFontSizePx,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
  layout = "default",
}: {
  arabicFontSizePx: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  layout?: "default" | "sidebar";
}) {
  const buttonClass =
    "inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] bg-white/5 text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
  const buttonSize = layout === "sidebar" ? "h-9 w-9" : "h-10 w-10";

  return (
    <div
      className={
        layout === "sidebar"
          ? "flex items-center justify-between gap-2"
          : "flex items-center gap-2"
      }
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={!canDecrease}
        className={`${buttonClass} ${buttonSize}`}
        aria-label="Decrease azkar text size"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span
        className={`tabular-nums font-bold text-white ${
          layout === "sidebar" ? "min-w-[4rem] text-center text-sm" : "min-w-[3.5rem] text-center text-sm"
        }`}
        aria-live="polite"
      >
        {arabicFontSizePx}px
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        className={`${buttonClass} ${buttonSize}`}
        aria-label="Increase azkar text size"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function AzkarDesktopSidebar({
  state,
  config,
  progressPct,
  totalSecondsSpent,
  fontSize,
}: {
  state: AzkarApiState;
  config: (typeof AZKAR_PERIOD_CONFIG)[AzkarPeriod];
  progressPct: number;
  totalSecondsSpent: number;
  fontSize: ReturnType<typeof useAzkarFontSize>;
}) {
  return (
    <aside
      className="hidden sm:block shrink-0 sticky top-0 h-[100dvh] w-[11.5rem] md:w-52 lg:w-60 xl:w-64 py-6 pl-4 md:pl-6"
      aria-label="Reading progress and settings"
    >
      <div className="glass-card flex max-h-[calc(100dvh-3rem)] flex-col gap-4 overflow-y-auto rounded-2xl p-4 md:p-5">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Progress
          </p>
          <div className="flex items-center gap-3 md:gap-4">
            <div
              className="relative h-28 w-3 shrink-0 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10 md:h-36 lg:h-44"
              aria-hidden
            >
              <AzkarProgressFill progressPct={progressPct} config={config} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-extrabold tabular-nums leading-none text-white md:text-3xl">
                {state.read}
                <span className="text-lg font-bold text-[var(--text-secondary)] md:text-xl">
                  /{state.total}
                </span>
              </p>
              <p className="mt-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                {Math.round(progressPct)}% complete
              </p>
              {state.complete ? (
                <span
                  className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${config.accentText} ${config.accentBorder} ${config.accentBg}`}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Done
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className={`rounded-xl border p-3 ${config.accentBorder} ${config.accentBg}`}>
          <div className="mb-1 flex items-center gap-1.5 text-[var(--text-secondary)]">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-wide">Time spent</span>
          </div>
          <p className="text-lg font-bold tabular-nums text-white md:text-xl">
            {formatDuration(totalSecondsSpent)}
          </p>
        </div>

        <div className="border-t border-[var(--card-border)] pt-4">
          <div className="mb-3 flex items-center gap-2">
            <Type className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
              Arabic text size
            </span>
          </div>
          <AzkarFontSizeControls
            arabicFontSizePx={fontSize.arabicFontSizePx}
            canDecrease={fontSize.canDecrease}
            canIncrease={fontSize.canIncrease}
            onDecrease={fontSize.decrease}
            onIncrease={fontSize.increase}
            layout="sidebar"
          />
        </div>
      </div>
    </aside>
  );
}

function AzkarMobileFontSizeBar({
  arabicFontSizePx,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
}: {
  arabicFontSizePx: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--card-border)] bg-[#070d0d]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_32px_rgba(0,0,0,0.45)] sm:hidden"
      role="toolbar"
      aria-label="Azkar text size"
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Type className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-semibold text-white">Text size</span>
        </div>
        <AzkarFontSizeControls
          arabicFontSizePx={arabicFontSizePx}
          canDecrease={canDecrease}
          canIncrease={canIncrease}
          onDecrease={onDecrease}
          onIncrease={onIncrease}
        />
      </div>
    </div>,
    document.body
  );
}

function AdhkarCard({
  item,
  index,
  ticked,
  busy,
  onToggle,
  config,
  arabicFontSizePx,
}: {
  item: AdhkarItem;
  index: number;
  ticked: boolean;
  busy: boolean;
  onToggle: () => void;
  config: (typeof AZKAR_PERIOD_CONFIG)[AzkarPeriod];
  arabicFontSizePx: number;
}) {
  const [openTranslation, setOpenTranslation] = useState(false);
  const [openVirtue, setOpenVirtue] = useState(false);
  const hasVirtue = item.virtue.trim().length > 0;

  const doneButtonClass = ticked
    ? `flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${config.accentBorder} ${config.accentText} bg-white/5 hover:bg-white/10`
    : config.period === "morning"
      ? "flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-extrabold bg-gradient-to-r from-emerald-400 to-[var(--accent-cyan)] text-[#06120c] shadow-[0_0_14px_-4px_rgba(52,211,153,0.45)] hover:brightness-110 transition-all disabled:cursor-not-allowed disabled:opacity-60"
      : "flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-extrabold bg-gradient-to-r from-indigo-400 to-violet-400 text-white shadow-[0_0_14px_-4px_rgba(129,140,248,0.4)] hover:brightness-110 transition-all disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <article
      className={`rounded-xl border p-5 transition-colors ${
        ticked ? `${config.accentBorder} ${config.accentBg}` : "border-[var(--card-border)] bg-[var(--card-bg)]/80"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-bold text-[var(--text-secondary)]">#{index + 1}</span>
          <h2 className="text-base font-bold text-white">{item.title}</h2>
          <span className={`text-xs font-semibold rounded-full border px-2 py-0.5 ${config.accentText} border-current/30 bg-white/5`}>
            {item.repeatCount}x
          </span>
        </div>
        <p
          className="leading-loose text-right text-white whitespace-pre-line transition-[font-size] duration-200"
          style={{ fontSize: `${arabicFontSizePx}px` }}
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

          <div className="flex w-full sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={onToggle}
              className={doneButtonClass}
              aria-label={ticked ? "Mark as unread" : "Mark as done"}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : ticked ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              ) : null}
              {ticked ? "Done" : "Mark done"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function AzkarProgressFill({
  progressPct,
  config,
}: {
  progressPct: number;
  config: (typeof AZKAR_PERIOD_CONFIG)[AzkarPeriod];
}) {
  const scale = Math.max(0, Math.min(1, progressPct / 100));
  return (
    <div
      className={`absolute inset-0 bg-gradient-to-b ${config.progressFrom} ${config.progressTo} transition-transform duration-500 ease-out`}
      style={{ transform: `scaleY(${scale})`, transformOrigin: "top" }}
    />
  );
}

export function AzkarReaderView({ period }: { period: AzkarPeriod }) {
  const config = AZKAR_PERIOD_CONFIG[period];
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, isAuthenticated, user } = useWorkLogSessionGate();
  const online = useOnlineStatus();

  const dateKey = searchParams.get("date") || localDateKey();
  const personId = searchParams.get("personId") || "primary";

  const [state, setState] = useState<AzkarApiState | null>(() => buildInitialAzkarState(period));
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fontSize = useAzkarFontSize();

  // Reading-time tracking. `baseSeconds` is the server total at load time;
  // `sessionSeconds` is the time accrued (while the tab is visible) this visit.
  const [baseSeconds, setBaseSeconds] = useState(0);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const baseLoadedRef = useRef(false);
  const sessionElapsedRef = useRef(0);
  const pendingRef = useRef(0);
  const flushingRef = useRef(false);

  const flushPending = useCallback(
    (useBeacon: boolean) => {
      const secs = Math.min(3600, Math.floor(pendingRef.current));
      if (secs < 1) return;
      if (flushingRef.current && !useBeacon) return;
      pendingRef.current -= secs;

      const userId = user?.id;
      const body = { action: "addTime", seconds: secs };

      if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon && userId) {
        const qs = personId ? `?personId=${encodeURIComponent(personId)}` : "";
        const url = `/api/work-log/${dateKey}/azkar/${period}${qs}`;
        const payload = JSON.stringify({ action: "addTime", seconds: secs });
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      }

      flushingRef.current = true;
      void patchAzkar(dateKey, period, personId, userId, body)
        .then((result) => {
          if (!result.ok) pendingRef.current += secs;
        })
        .catch(() => {
          pendingRef.current += secs;
        })
        .finally(() => {
          flushingRef.current = false;
        });
    },
    [dateKey, period, personId, user?.id]
  );

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const result = await fetchAzkarState(dateKey, period, personId, user?.id);
      if (!result.ok || !result.state) {
        throw new Error(result.error ?? "Failed to load");
      }
      const data = result.state;
      const secondsSpent = data.secondsSpent ?? 0;
      setState({
        items: data.items as AdhkarItem[],
        tickedIds: data.tickedIds ?? [],
        complete: Boolean(data.complete),
        total: data.total ?? 0,
        read: data.read ?? 0,
        secondsSpent,
      });
      if (!baseLoadedRef.current) {
        baseLoadedRef.current = true;
        setBaseSeconds(secondsSpent);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to load ${period} azkar`);
    } finally {
      setLoading(false);
    }
  }, [dateKey, personId, period, user?.id]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  // Count reading time only while the tab is visible; flush periodically and
  // when the page is hidden, navigated away, or unmounted.
  useEffect(() => {
    if (!ready) return;

    let last = Date.now();
    const countId = setInterval(() => {
      const now = Date.now();
      const visible =
        typeof document === "undefined" || document.visibilityState === "visible";
      if (visible) {
        // Clamp to guard against device sleep / throttled timers.
        const delta = Math.min(5, (now - last) / 1000);
        sessionElapsedRef.current += delta;
        pendingRef.current += delta;
        setSessionSeconds(Math.floor(sessionElapsedRef.current));
      }
      last = now;
    }, 1000);

    const flushId = setInterval(() => flushPending(false), 30000);

    const onVisibility = () => {
      last = Date.now();
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        flushPending(true);
      }
    };
    const onPageHide = () => flushPending(true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      clearInterval(countId);
      clearInterval(flushId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      flushPending(true);
    };
  }, [ready, flushPending]);

  const totalSecondsSpent = baseSeconds + sessionSeconds;

  const goBackToWork = useCallback(() => {
    flushPending(true);
    router.push("/?tab=deen");
  }, [flushPending, router]);

  const tickedSet = useMemo(() => new Set(state?.tickedIds ?? []), [state?.tickedIds]);

  const toggle = async (adhkarId: string) => {
    setBusyId(adhkarId);
    try {
      const result = await patchAzkar(dateKey, period, personId, user?.id, {
        action: "toggle",
        adhkarId,
      });
      if (!result.ok || !result.state) throw new Error("Failed to save progress");
      const data = result.state;
      setState({
        items: (data.items as AdhkarItem[]) ?? state?.items ?? [],
        tickedIds: data.tickedIds ?? [],
        complete: Boolean(data.complete),
        total: data.total ?? 0,
        read: data.read ?? 0,
        secondsSpent: data.secondsSpent ?? state?.secondsSpent ?? 0,
      });
    } catch {
      setError("Could not save progress. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const HeaderIcon = config.headerIcon === "sun" ? Sun : Moon;

  if (!ready) {
    return <AppSplash />;
  }

  const progressPct = state?.total ? (state.read / state.total) * 100 : 0;

  return (
    <div
      className="min-h-[100dvh] text-white pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:pb-16"
      style={{ background: "var(--bg-gradient)" }}
    >
      {state ? (
        <div className="fixed left-0 top-0 z-10 h-screen w-2 sm:hidden" aria-hidden>
          <div className="relative h-full overflow-hidden rounded-r-full bg-white/10">
            <AzkarProgressFill progressPct={progressPct} config={config} />
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-7xl items-start">
        {state ? (
          <AzkarDesktopSidebar
            state={state}
            config={config}
            progressPct={progressPct}
            totalSecondsSpent={totalSecondsSpent}
            fontSize={fontSize}
          />
        ) : null}

        <div className="min-w-0 flex-1 px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <button
          type="button"
          onClick={goBackToWork}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Work Log
        </button>

        {!isAuthenticated && !online ? (
          <p className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            Offline mode — progress is saved on this device. Sign in when online to sync with your account.
          </p>
        ) : null}

        <header className="mb-6 lg:mb-8">
          <div className="flex items-center gap-2 mb-2">
            <HeaderIcon className={`w-5 h-5 ${config.accentMuted}`} />
            <p className={`text-xs uppercase tracking-wider font-bold ${config.accentText}`}>{config.label}</p>
          </div>
          <h1 className={`text-3xl font-extrabold bg-gradient-to-r sm:text-4xl lg:text-[2.5rem] lg:leading-tight ${config.progressFrom} ${config.progressTo} bg-clip-text text-transparent`}>
            {config.title}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed lg:max-w-2xl lg:text-base">{config.intro}</p>
          {state ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:hidden">
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="font-bold text-white tabular-nums">
                  {state.read}/{state.total}
                </span>{" "}
                read
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-white/5 px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                <Clock className="w-3.5 h-3.5" />
                {formatDuration(totalSecondsSpent)}
              </span>
              {state.complete ? (
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${config.accentText} border-current/40 bg-white/5`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {config.completeLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </header>

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
                arabicFontSizePx={fontSize.arabicFontSizePx}
              />
            ))}

            {state && state.items.length > 0 ? (
              <div className="mt-8 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/80 p-6 text-center">
                {state.complete ? (
                  <p className={`mb-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold ${config.accentText}`}>
                    <CheckCircle2 className="w-4 h-4" />
                    {config.completeLabel}
                  </p>
                ) : (
                  <p className="mb-1 text-sm font-semibold text-white">
                    You&apos;ve reached the end of the {config.label.split("· ")[1] ?? ""} adhkār.
                  </p>
                )}
                <p className="mb-4 inline-flex items-center justify-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <Clock className="w-3.5 h-3.5" />
                  Time spent: {formatDuration(totalSecondsSpent)}
                </p>
                <div>
                  <button
                    type="button"
                    onClick={goBackToWork}
                    className={
                      period === "morning"
                        ? "inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-extrabold bg-gradient-to-r from-emerald-400 to-[var(--accent-cyan)] text-[#06120c] shadow-[0_0_18px_-4px_rgba(52,211,153,0.5)] hover:brightness-110 transition-all"
                        : "inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-extrabold bg-gradient-to-r from-indigo-400 to-violet-400 text-white shadow-[0_0_18px_-4px_rgba(129,140,248,0.45)] hover:brightness-110 transition-all"
                    }
                  >
                    Back to Work Log
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
        </div>
      </div>

      {!loading && !error ? (
        <AzkarMobileFontSizeBar
          arabicFontSizePx={fontSize.arabicFontSizePx}
          canDecrease={fontSize.canDecrease}
          canIncrease={fontSize.canIncrease}
          onDecrease={fontSize.decrease}
          onIncrease={fontSize.increase}
        />
      ) : null}
    </div>
  );
}
