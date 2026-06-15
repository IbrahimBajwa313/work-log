"use client";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminShell } from "@/components/admin/admin-shell";

export default function AdminDashboardPage() {
  return (
    <AdminShell
      active="dashboard"
      title="Admin Dashboard"
      subtitle="Users, activity & platform overview"
    >
      {({ authorizedInit }) => <AdminDashboard authorizedInit={authorizedInit} />}
    </AdminShell>
  );
}
