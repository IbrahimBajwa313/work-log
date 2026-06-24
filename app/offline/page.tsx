import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center safe-top safe-bottom"
      style={{ background: "var(--bg-gradient)" }}
    >
      <div className="glass-card max-w-md rounded-2xl p-8">
        <WifiOff className="mx-auto mb-4 h-12 w-12 text-[var(--accent-cyan)]" />
        <h1 className="text-xl font-bold text-white">You&apos;re offline</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          Your work log and Azkar are still available. Changes you make will sync automatically
          when you&apos;re back online.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-[2.75rem] items-center justify-center rounded-xl bg-[var(--accent-cyan)] px-6 py-3 text-sm font-bold text-[#070d0d]"
        >
          Open app
        </Link>
      </div>
    </div>
  );
}
