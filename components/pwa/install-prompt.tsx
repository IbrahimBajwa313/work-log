"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa_install_dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // ignore
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferred(null);
  }, [deferred]);

  if (!visible || !deferred) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm safe-bottom">
      <div className="glass-card rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" className="h-12 w-12 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">Install Work Logging</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              Add to your home screen for quick access and offline use on mobile.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void install()}
                className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-lg bg-[var(--accent-cyan)] px-3 py-2 text-xs font-bold text-[#070d0d]"
              >
                <Download className="h-3.5 w-3.5" />
                Install
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-lg px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-white"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 rounded-md p-1 text-[var(--text-secondary)] hover:text-white"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
