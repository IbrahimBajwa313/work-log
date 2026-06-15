"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Flame, X } from "lucide-react";

export type SpotStep = {
  /** CSS selector for the element to highlight. */
  selector: string;
  title: string;
  body: string;
  /** Optional side-effect to run before measuring (e.g. switch a tab). */
  before?: () => void;
  /** Extra wait (ms) after `before` so the DOM can update. */
  beforeDelay?: number;
};

type Rect = { top: number; left: number; width: number; height: number };

const HIGHLIGHT_PAD = 8;
const TOOLTIP_WIDTH = 340;
const GAP = 14;

export function SpotlightTour({
  open,
  steps,
  onClose,
}: {
  open: boolean;
  steps: SpotStep[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (open) {
      setIndex(0);
      setRect(null);
    }
  }, [open]);

  const measure = useCallback(() => {
    const step = steps[index];
    if (!step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    setViewport({ w: window.innerWidth, h: window.innerHeight });
  }, [steps, index]);

  // When the step changes: run its side-effect, scroll the target into view, then measure.
  useEffect(() => {
    if (!open) return;
    const step = steps[index];
    if (!step) return;

    step.before?.();
    const delay = step.before ? step.beforeDelay ?? 260 : 0;

    const timer = setTimeout(() => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      // Allow the smooth scroll to settle before measuring.
      setTimeout(measure, 360);
    }, delay);

    return () => clearTimeout(timer);
  }, [open, index, steps, measure]);

  // Keep the highlight aligned while the user scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const handler = () => measure();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  if (!open || steps.length === 0) return null;

  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const step = steps[index];

  function next() {
    if (index < steps.length - 1) setIndex((i) => i + 1);
    else onClose();
  }
  function prev() {
    if (index > 0) setIndex((i) => i - 1);
  }

  // Highlight box (padded around the target).
  const box = rect
    ? {
        top: Math.max(rect.top - HIGHLIGHT_PAD, 6),
        left: Math.max(rect.left - HIGHLIGHT_PAD, 6),
        width: rect.width + HIGHLIGHT_PAD * 2,
        height: rect.height + HIGHLIGHT_PAD * 2,
      }
    : null;

  // Tooltip placement: below the element if there's room, otherwise above; centered if no target.
  let tooltipStyle: React.CSSProperties;
  if (!box) {
    tooltipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else {
    const placeBelow = box.top + box.height + 240 < viewport.h;
    const left = Math.min(
      Math.max(box.left, 16),
      Math.max(viewport.w - TOOLTIP_WIDTH - 16, 16)
    );
    tooltipStyle = placeBelow
      ? { top: box.top + box.height + GAP, left }
      : { top: undefined, bottom: viewport.h - box.top + GAP, left };
  }

  return (
    <div className="fixed inset-0 z-[120]" aria-live="polite">
      {/* Click-blocker so the page underneath isn't interacted with mid-tour. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Dimmed overlay with a transparent cut-out around the target. */}
      {box ? (
        <motion.div
          initial={false}
          animate={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="absolute rounded-xl"
          style={{
            boxShadow:
              "0 0 0 9999px rgba(2, 8, 8, 0.78), 0 0 0 2px var(--accent-cyan), 0 0 22px 4px rgba(0, 255, 204, 0.35)",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(2,8,8,0.82)]" />
      )}

      {/* Tooltip / step card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 0.96, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          className="absolute w-[340px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl"
          style={tooltipStyle}
        >
          <div
            className="h-1 w-full"
            style={{
              background: `linear-gradient(90deg, var(--accent-cyan) ${
                ((index + 1) / steps.length) * 100
              }%, rgba(255,255,255,0.08) ${((index + 1) / steps.length) * 100}%)`,
            }}
          />
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-cyan)]">
                Step {index + 1} of {steps.length}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="End tour"
                className="rounded-md p-1 text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <h3 className="mt-2 text-lg font-extrabold text-white">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              {step.body}
            </p>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {steps.map((s, i) => (
                  <button
                    key={s.selector + i}
                    type="button"
                    aria-label={`Go to step ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === index ? "w-5 bg-[var(--accent-cyan)]" : "w-1.5 bg-white/20"
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {!isFirst ? (
                  <button
                    type="button"
                    onClick={prev}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--card-border)] px-2.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/5"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-white"
                  >
                    Skip
                  </button>
                )}
                <button
                  type="button"
                  onClick={next}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-cyan)] px-3.5 py-1.5 text-sm font-extrabold text-[#070d0d] transition-opacity hover:opacity-90"
                >
                  {isLast ? (
                    <>
                      Done <Flame className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Next <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const STORAGE_PREFIX = "worklog_tour_seen:";

export function tourStorageKey(userKey?: string) {
  return `${STORAGE_PREFIX}${userKey ?? "anon"}`;
}

export function hasSeenTour(userKey?: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(tourStorageKey(userKey)) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(userKey?: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tourStorageKey(userKey), "1");
  } catch {
    /* ignore */
  }
}
