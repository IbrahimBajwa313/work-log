import type { Metadata } from "next";
import { Suspense } from "react";
import { AppSplash } from "@/components/app-splash";
import { WorkLogManageView } from "@/components/work-log/work-log-manage-view";

export const metadata: Metadata = {
  title: "Manage",
  description: "People, daily goals, task carry-over, and saved task templates.",
};

export default function ManagePage() {
  return (
    <Suspense fallback={<AppSplash />}>
      <WorkLogManageView />
    </Suspense>
  );
}
