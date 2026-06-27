import { Suspense } from "react";
import { AppSplash } from "@/components/app-splash";
import { MonthlyTargetsView } from "@/components/work-log/monthly-targets-view";

export default function MonthlyTargetsPage() {
  return (
    <Suspense fallback={<AppSplash />}>
      <MonthlyTargetsView />
    </Suspense>
  );
}
