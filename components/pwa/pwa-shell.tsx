"use client";

import { OfflineBanner } from "@/components/pwa/offline-banner";
import { InstallPrompt } from "@/components/pwa/install-prompt";

export function PwaShell() {
  return (
    <>
      <OfflineBanner />
      <InstallPrompt />
    </>
  );
}
