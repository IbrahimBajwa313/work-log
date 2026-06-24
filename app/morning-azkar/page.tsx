import { Suspense } from "react";
import { AppSplash } from "@/components/app-splash";
import { AzkarReaderView } from "@/components/azkar/azkar-reader-view";

export default function MorningAzkarPage() {
  return (
    <Suspense fallback={<AppSplash />}>
      <AzkarReaderView period="morning" />
    </Suspense>
  );
}
