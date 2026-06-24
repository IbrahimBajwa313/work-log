import { Loader2 } from "lucide-react";

type AppSplashProps = {
  /** Covers the entire viewport (hides footer/chrome) during boot. */
  fullScreen?: boolean;
  className?: string;
};

export function AppSplash({ fullScreen = true, className = "" }: AppSplashProps) {
  const rootClass = fullScreen
    ? "fixed inset-0 z-[100] relative flex flex-col items-center justify-center safe-top safe-bottom"
    : "relative flex min-h-[100dvh] flex-col items-center justify-center safe-top safe-bottom";

  return (
    <div className={`${rootClass} ${className}`} style={{ background: "var(--bg-gradient)" }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-slow absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[var(--accent-cyan)]/10 blur-[130px]" />
        <div className="animate-float-slow absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-cyan-400/10 blur-[140px] [animation-delay:-7s]" />
      </div>

      <div className="relative flex flex-col items-center px-6">
        <div className="relative mb-8 inline-block">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-8 rounded-full bg-[var(--accent-cyan)]/15 blur-3xl"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Work Logging by TechCognify"
            className="relative w-full max-w-[min(92vw,22rem)] h-auto sm:max-w-[26rem]"
          />
        </div>
        <Loader2 className="h-9 w-9 animate-spin text-[var(--accent-cyan)]" aria-label="Loading" />
      </div>
    </div>
  );
}
