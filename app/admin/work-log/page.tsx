"use client";

import { WorkLogDashboard } from "@/components/work-log/work-log-dashboard";
import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminWorkLogPage() {
  return (
    <AdminShell
      active="work-log"
      title="Admin Work Logging"
      subtitle="Personal admin work tracking"
      bare
    >
      {({ authorizedInit }) => (
        <WorkLogDashboard
          apiBase="/api/admin/work-log"
          settingsApiBase="/api/admin/work-log/settings"
          authorizedInit={authorizedInit}
          backHref="/admin"
          backLabel="Dashboard"
          title="Work Logging"
          subtitle="Track business work, Deen, fitness, tasks & goals"
        />
      )}
    </AdminShell>
  );
}
