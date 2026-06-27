"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Clock,
  Flame,
  Loader2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAdminMinutes, type AdminPlatformStats, type AdminUserRow } from "@/lib/admin-stats";
import { WORK_LOG_AREA_COLORS } from "@/lib/work-log-area-colors";

type AdminDashboardProps = {
  authorizedInit: (init?: RequestInit) => RequestInit;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

type UserSortKey =
  | "name"
  | "createdAt"
  | "lastActiveAt"
  | "minutes30d"
  | "minutes7d"
  | "streak"
  | "activeDays30d";

export function AdminDashboard({ authorizedInit }: AdminDashboardProps) {
  const [stats, setStats] = useState<AdminPlatformStats | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<UserSortKey>("minutes30d");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "removed" | "inactive">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch("/api/admin/stats", authorizedInit()),
        fetch("/api/admin/users", authorizedInit()),
      ]);
      if (!statsRes.ok || !usersRes.ok) {
        throw new Error("Failed to load admin data");
      }
      const statsJson = (await statsRes.json()) as { stats: AdminPlatformStats };
      const usersJson = (await usersRes.json()) as { users: AdminUserRow[] };
      setStats(statsJson.stats);
      setUsers(usersJson.users);
    } catch {
      setError("Could not load dashboard data. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [authorizedInit]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    let rows = [...users];
    if (statusFilter === "active") rows = rows.filter((u) => u.status === "active");
    if (statusFilter === "removed") rows = rows.filter((u) => u.status === "removed");
    if (statusFilter === "inactive") {
      rows = rows.filter((u) => u.status === "active" && u.logEntryCount === 0);
    }

    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "lastActiveAt":
          cmp =
            (a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0) -
            (b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0);
          break;
        case "minutes30d":
          cmp = a.minutes30d - b.minutes30d;
          break;
        case "minutes7d":
          cmp = a.minutes7d - b.minutes7d;
          break;
        case "streak":
          cmp = a.streak - b.streak;
          break;
        case "activeDays30d":
          cmp = a.activeDays30d - b.activeDays30d;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [users, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: UserSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIndicator = (key: UserSortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-cyan)]" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-[var(--card-bg)]/80 border border-[var(--card-border)] rounded-xl p-8 text-center">
        <p className="text-red-300 mb-4">{error || "No data available"}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="bg-[var(--accent-cyan)] text-[#070d0d] font-bold px-4 py-2 rounded-md"
        >
          Retry
        </button>
      </div>
    );
  }

  const overviewCards = [
    { label: "Total users", value: String(stats.users.total), sub: `${stats.users.active} active`, Icon: Users },
    { label: "DAU / WAU / MAU", value: `${stats.activity.dau} / ${stats.activity.wau} / ${stats.activity.mau}`, Icon: Activity },
    { label: "New signups (7d)", value: String(stats.users.signups7d), sub: `${stats.users.signups30d} in 30d`, Icon: UserPlus },
    { label: "Users with logs", value: String(stats.users.withLogs), sub: `${stats.users.inactive} never logged`, Icon: UserCheck },
    { label: "Time today", value: formatAdminMinutes(stats.activity.minutesToday), Icon: Clock },
    { label: "Time (7 days)", value: formatAdminMinutes(stats.activity.minutes7d), Icon: CalendarDays },
    { label: "Time (30 days)", value: formatAdminMinutes(stats.activity.minutes30d), sub: `${formatAdminMinutes(stats.activity.workMinutes30d)} work · ${formatAdminMinutes(stats.activity.deenMinutes30d)} deen`, Icon: TrendingUp },
    { label: "Removed accounts", value: String(stats.users.removed), Icon: Flame },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewCards.map((card) => (
          <div
            key={card.label}
            className="bg-[var(--card-bg)]/80 border border-[var(--card-border)] rounded-xl p-5"
          >
            <div className="flex items-center gap-2">
              <card.Icon className="w-4 h-4 text-[var(--accent-cyan)]" />
              <p className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">{card.label}</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-white mt-1 break-words">{card.value}</p>
            {"sub" in card && card.sub ? (
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">{card.sub}</p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-[var(--card-bg)]/80 border border-[var(--card-border)] rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-1">Platform activity (14 days)</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Hours logged across all users</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                  }}
                />
                <Legend />
                <Bar dataKey="workHours" name="Work" stackId="a" fill={WORK_LOG_AREA_COLORS.work.color} radius={[0, 0, 0, 0]} />
                <Bar dataKey="deenHours" name="Deen" stackId="a" fill={WORK_LOG_AREA_COLORS.deen.color} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[var(--card-bg)]/80 border border-[var(--card-border)] rounded-xl p-5">
          <h2 className="text-lg font-bold text-white mb-1">Daily active users (14 days)</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Users with at least 1 minute logged</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="activeUsers"
                  name="Active users"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={{ fill: "#22d3ee", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-[var(--card-bg)]/80 border border-[var(--card-border)] rounded-xl p-5">
        <h2 className="text-lg font-bold text-white mb-1">New signups (14 days)</h2>
        <div className="h-48 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.signupsByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="count" name="Signups" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[var(--card-bg)]/80 border border-[var(--card-border)] rounded-xl p-5 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Users</h2>
            <p className="text-sm text-[var(--text-secondary)]">{filteredUsers.length} shown</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["all", "active", "inactive", "removed"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1 rounded-md text-xs font-semibold capitalize ${
                  statusFilter === filter
                    ? "bg-[var(--accent-cyan)] text-[#070d0d]"
                    : "bg-white/5 text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--card-border)]">
                <th className="pb-3 pr-3 font-medium">
                  <button type="button" onClick={() => toggleSort("name")} className="hover:text-white">
                    User{sortIndicator("name")}
                  </button>
                </th>
                <th className="pb-3 pr-3 font-medium">Status</th>
                <th className="pb-3 pr-3 font-medium">
                  <button type="button" onClick={() => toggleSort("createdAt")} className="hover:text-white">
                    Joined{sortIndicator("createdAt")}
                  </button>
                </th>
                <th className="pb-3 pr-3 font-medium">
                  <button type="button" onClick={() => toggleSort("lastActiveAt")} className="hover:text-white">
                    Last active{sortIndicator("lastActiveAt")}
                  </button>
                </th>
                <th className="pb-3 pr-3 font-medium">
                  <button type="button" onClick={() => toggleSort("minutes7d")} className="hover:text-white">
                    7d{sortIndicator("minutes7d")}
                  </button>
                </th>
                <th className="pb-3 pr-3 font-medium">
                  <button type="button" onClick={() => toggleSort("minutes30d")} className="hover:text-white">
                    30d{sortIndicator("minutes30d")}
                  </button>
                </th>
                <th className="pb-3 pr-3 font-medium">
                  <button type="button" onClick={() => toggleSort("streak")} className="hover:text-white">
                    Streak{sortIndicator("streak")}
                  </button>
                </th>
                <th className="pb-3 pr-3 font-medium">
                  <button type="button" onClick={() => toggleSort("activeDays30d")} className="hover:text-white">
                    Active days{sortIndicator("activeDays30d")}
                  </button>
                </th>
                <th className="pb-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[var(--text-secondary)]">
                    No users match this filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-[var(--card-border)]/60 last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-white">{user.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{user.email}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                          user.status === "active"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {user.status}
                      </span>
                      {user.loggedToday ? (
                        <span className="ml-1 inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-cyan-500/15 text-cyan-300">
                          today
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3 text-[var(--text-secondary)]">{formatDate(user.createdAt)}</td>
                    <td className="py-3 pr-3 text-[var(--text-secondary)]">{formatRelative(user.lastActiveAt)}</td>
                    <td className="py-3 pr-3 text-white tabular-nums">{formatAdminMinutes(user.minutes7d)}</td>
                    <td className="py-3 pr-3 text-white tabular-nums">{formatAdminMinutes(user.minutes30d)}</td>
                    <td className="py-3 pr-3 text-white tabular-nums">
                      {user.streak > 0 ? `${user.streak}d` : "—"}
                    </td>
                    <td className="py-3 pr-3 text-white tabular-nums">{user.activeDays30d}</td>
                    <td className="py-3 text-[var(--text-secondary)] text-xs">
                      <p>{user.personCount} profile{user.personCount === 1 ? "" : "s"}</p>
                      <p>{user.templateCount} templates</p>
                      <p>Goal {Math.round(user.dailyGoalMinutes / 60)}h/day</p>
                      <p>{user.logEntryCount} log entries</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
