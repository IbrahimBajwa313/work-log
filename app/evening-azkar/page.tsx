"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { AzkarReaderView } from "@/components/azkar/azkar-reader-view";

export default function EveningAzkarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-gradient)" }}>
          <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-cyan)]" />
        </div>
      }
    >
      <AzkarReaderView period="evening" />
    </Suspense>
  );
}
