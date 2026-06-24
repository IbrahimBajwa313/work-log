import { Suspense } from "react";
import { AppSplash } from "@/components/app-splash";
import { AzkarReaderView } from "@/components/azkar/azkar-reader-view";

export default function EveningAzkarPage() {
  return (
    <Suspense fallback={<AppSplash />}>
      <AzkarReaderView period="evening" />
    </Suspense>
  );
}
