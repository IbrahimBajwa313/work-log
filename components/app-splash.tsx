"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type AppSplashProps = {
  message?: string;
};

function SplashContent({ message }: { message: string }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "var(--bg-gradient)" }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-slow absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[var(--accent-cyan)]/10 blur-[130px]" />
        <div className="animate-float-slow absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-cyan-400/10 blur-[140px] [animation-delay:-7s]" />
      </div>

      <div className="relative flex flex-col items-center px-6">
        <div className="relative mb-10 flex h-20 w-20 items-center justify-center">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-[var(--accent-cyan)]/20"
          />
          <div
            aria-hidden
            className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent-cyan)] border-r-[var(--accent-cyan)]/40"
            style={{ animationDuration: "1.1s" }}
          />
          <div
            aria-hidden
            className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-b-[var(--accent-cyan-2)]/60"
            style={{ animationDuration: "1.8s", animationDirection: "reverse" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon.png"
            alt=""
            className="relative h-9 w-9 rounded-lg"
          />
        </div>

        <p className="text-gradient-cyan text-lg font-bold tracking-tight sm:text-xl">
          Work Logging
        </p>

        <div className="mt-4 flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[var(--accent-cyan)] animate-bounce"
              style={{ animationDelay: `${i * 160}ms`, animationDuration: "0.9s" }}
            />
          ))}
        </div>

        <p className="mt-5 text-sm text-[var(--text-secondary)]">{message}</p>
      </div>
    </div>
  );
}

export function AppSplash({ message = "Loading your workspace…" }: AppSplashProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.body.dataset.appLoading = "true";
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      delete document.body.dataset.appLoading;
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  if (!mounted) {
    return (
      <div
        className="min-h-[100dvh] w-full"
        style={{ background: "var(--bg-gradient)" }}
        aria-hidden
      />
    );
  }

  return createPortal(<SplashContent message={message} />, document.body);
}
