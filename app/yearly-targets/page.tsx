import { Suspense } from "react";
import { AppSplash } from "@/components/app-splash";
import { YearlyTargetsView } from "@/components/work-log/yearly-targets-view";

export default function YearlyTargetsPage() {
  return (
    <Suspense fallback={<AppSplash />}>
      <YearlyTargetsView />
    </Suspense>
  );
}
