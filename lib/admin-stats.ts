import type { Db } from "mongodb";
import { dateKeyDaysAgo, dateKeysForLastDays, localDateKey } from "@/lib/date-keys";
import { userWorkLogCollection, type UserWorkLogDoc } from "@/lib/user-work-log";
import {
  userWorkLogSettingsCollection,
  type UserWorkLogSettingsDoc,
} from "@/lib/user-work-log-settings";
import {
  worklogAccountsCollection,
  type WorklogAccountDoc,
} from "@/lib/worklog-accounts";

const ACTIVE_DAY_MINUTES = 1;

export type AdminPlatformStats = {
  users: {
    total: number;
    active: number;
    removed: number;
    signups7d: number;
    signups30d: number;
    withLogs: number;
    inactive: number;
  };
  activity: {
    dau: number;
    wau: number;
    mau: number;
    minutesToday: number;
    minutes7d: number;
    minutes30d: number;
    workMinutes30d: number;
    deenMinutes30d: number;
  };
  dailyActivity: {
    dateKey: string;
    label: string;
    workHours: number;
    deenHours: number;
    totalHours: number;
    activeUsers: number;
  }[];
  signupsByDay: {
    dateKey: string;
    label: string;
    count: number;
  }[];
};

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  status: WorklogAccountDoc["status"];
  createdAt: string;
  lastActiveAt: string | null;
  totalMinutes: number;
  workMinutes: number;
  deenMinutes: number;
  minutes7d: number;
  minutes30d: number;
  activeDays: number;
  activeDays30d: number;
  streak: number;
  logEntryCount: number;
  personCount: number;
  dailyGoalMinutes: number;
  templateCount: number;
  loggedToday: boolean;
};

type UserActivityAgg = {
  userId: string;
  totalMinutes: number;
  workMinutes: number;
  deenMinutes: number;
  minutes7d: number;
  minutes30d: number;
  activeDays: number;
  activeDays30d: number;
  logEntryCount: number;
  lastActiveAt: Date | null;
  activeDateKeys: Set<string>;
};

function combinedMinutes(doc: Pick<UserWorkLogDoc, "totalMinutes" | "deenMinutes" | "fitnessMinutes">): number {
  return (doc.totalMinutes ?? 0) + (doc.deenMinutes ?? 0) + (doc.fitnessMinutes ?? 0);
}

function computeStreak(activeDateKeys: Set<string>, todayKey: string): number {
  if (activeDateKeys.size === 0) return 0;

  const cursor = new Date(`${todayKey}T12:00:00`);
  const todayActive = activeDateKeys.has(todayKey);
  if (!todayActive) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (activeDateKeys.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function loadUserActivityMap(db: Db): Promise<Map<string, UserActivityAgg>> {
  const todayKey = localDateKey(new Date());
  const key7d = dateKeyDaysAgo(6);
  const key30d = dateKeyDaysAgo(29);

  const rows = await db
    .collection<UserWorkLogDoc>(userWorkLogCollection)
    .find(
      {},
      {
        projection: {
          userId: 1,
          dateKey: 1,
          totalMinutes: 1,
          deenMinutes: 1,
          fitnessMinutes: 1,
          updatedAt: 1,
        },
      }
    )
    .toArray();

  const map = new Map<string, UserActivityAgg>();

  for (const row of rows) {
    const userId = row.userId;
    if (!userId) continue;

    const minutes = combinedMinutes(row);
    let agg = map.get(userId);
    if (!agg) {
      agg = {
        userId,
        totalMinutes: 0,
        workMinutes: 0,
        deenMinutes: 0,
        minutes7d: 0,
        minutes30d: 0,
        activeDays: 0,
        activeDays30d: 0,
        logEntryCount: 0,
        lastActiveAt: null,
        activeDateKeys: new Set(),
      };
      map.set(userId, agg);
    }

    agg.logEntryCount += 1;
    agg.totalMinutes += minutes;
    agg.workMinutes += row.totalMinutes ?? 0;
    agg.deenMinutes += row.deenMinutes ?? 0;

    if (row.dateKey >= key7d) agg.minutes7d += minutes;
    if (row.dateKey >= key30d) {
      agg.minutes30d += minutes;
      if (minutes >= ACTIVE_DAY_MINUTES) agg.activeDays30d += 1;
    }

    if (minutes >= ACTIVE_DAY_MINUTES) {
      agg.activeDays += 1;
      agg.activeDateKeys.add(row.dateKey);
    }

    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt);
    if (!agg.lastActiveAt || updatedAt > agg.lastActiveAt) {
      agg.lastActiveAt = updatedAt;
    }
  }

  return map;
}

export async function getAdminPlatformStats(db: Db): Promise<AdminPlatformStats> {
  const now = new Date();
  const todayKey = localDateKey(now);
  const key7d = dateKeyDaysAgo(6, now);
  const key30d = dateKeyDaysAgo(29, now);
  const signup7d = new Date(now);
  signup7d.setDate(signup7d.getDate() - 7);
  const signup30d = new Date(now);
  signup30d.setDate(signup30d.getDate() - 30);

  const accounts = await db
    .collection<WorklogAccountDoc>(worklogAccountsCollection)
    .find({}, { projection: { status: 1, createdAt: 1 } })
    .toArray();

  const activityMap = await loadUserActivityMap(db);
  const userIdsWithLogs = new Set(activityMap.keys());

  let activeCount = 0;
  let removedCount = 0;
  let signups7d = 0;
  let signups30d = 0;
  const signupsByDayMap = new Map<string, number>();

  for (const account of accounts) {
    if (account.status === "removed") removedCount += 1;
    else activeCount += 1;

    const createdAt =
      account.createdAt instanceof Date ? account.createdAt : new Date(account.createdAt);
    if (createdAt >= signup7d) signups7d += 1;
    if (createdAt >= signup30d) signups30d += 1;

    const signupKey = localDateKey(createdAt);
    signupsByDayMap.set(signupKey, (signupsByDayMap.get(signupKey) ?? 0) + 1);
  }

  const dauUsers = new Set<string>();
  const wauUsers = new Set<string>();
  const mauUsers = new Set<string>();
  let minutesToday = 0;
  let minutes7d = 0;
  let minutes30d = 0;
  let workMinutes30d = 0;
  let deenMinutes30d = 0;

  const dailyMap = new Map<
    string,
    { workMinutes: number; deenMinutes: number; users: Set<string> }
  >();

  const chartKeys = dateKeysForLastDays(14, now);
  for (const key of chartKeys) {
    dailyMap.set(key, { workMinutes: 0, deenMinutes: 0, users: new Set() });
  }

  const logRows = await db
    .collection<UserWorkLogDoc>(userWorkLogCollection)
    .find(
      { dateKey: { $gte: chartKeys[0] } },
      { projection: { userId: 1, dateKey: 1, totalMinutes: 1, deenMinutes: 1, fitnessMinutes: 1 } }
    )
    .toArray();

  for (const row of logRows) {
    const minutes = combinedMinutes(row);
    const work = row.totalMinutes ?? 0;
    const deen = row.deenMinutes ?? 0;

    if (row.dateKey === todayKey && minutes >= ACTIVE_DAY_MINUTES) {
      dauUsers.add(row.userId);
      minutesToday += minutes;
    }
    if (row.dateKey >= key7d) {
      if (minutes >= ACTIVE_DAY_MINUTES) wauUsers.add(row.userId);
      minutes7d += minutes;
    }
    if (row.dateKey >= key30d) {
      if (minutes >= ACTIVE_DAY_MINUTES) mauUsers.add(row.userId);
      minutes30d += minutes;
      workMinutes30d += work;
      deenMinutes30d += deen;
    }

    const day = dailyMap.get(row.dateKey);
    if (day) {
      day.workMinutes += work;
      day.deenMinutes += deen;
      if (minutes >= ACTIVE_DAY_MINUTES) day.users.add(row.userId);
    }
  }

  const dailyActivity = chartKeys.map((dateKey) => {
    const day = dailyMap.get(dateKey) ?? { workMinutes: 0, deenMinutes: 0, users: new Set() };
    const workHours = Math.round((day.workMinutes / 60) * 10) / 10;
    const deenHours = Math.round((day.deenMinutes / 60) * 10) / 10;
    const d = new Date(`${dateKey}T12:00:00`);
    return {
      dateKey,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      workHours,
      deenHours,
      totalHours: Math.round((workHours + deenHours) * 10) / 10,
      activeUsers: day.users.size,
    };
  });

  const signupChartKeys = dateKeysForLastDays(14, now);
  const signupsByDay = signupChartKeys.map((dateKey) => {
    const d = new Date(`${dateKey}T12:00:00`);
    return {
      dateKey,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: signupsByDayMap.get(dateKey) ?? 0,
    };
  });

  return {
    users: {
      total: accounts.length,
      active: activeCount,
      removed: removedCount,
      signups7d,
      signups30d,
      withLogs: userIdsWithLogs.size,
      inactive: Math.max(0, activeCount - userIdsWithLogs.size),
    },
    activity: {
      dau: dauUsers.size,
      wau: wauUsers.size,
      mau: mauUsers.size,
      minutesToday,
      minutes7d,
      minutes30d,
      workMinutes30d,
      deenMinutes30d,
    },
    dailyActivity,
    signupsByDay,
  };
}

export async function getAdminUsersList(db: Db): Promise<AdminUserRow[]> {
  const todayKey = localDateKey(new Date());
  const activityMap = await loadUserActivityMap(db);

  const [accounts, settingsRows] = await Promise.all([
    db
      .collection<WorklogAccountDoc>(worklogAccountsCollection)
      .find({})
      .sort({ createdAt: -1 })
      .toArray(),
    db
      .collection<UserWorkLogSettingsDoc>(userWorkLogSettingsCollection)
      .find({}, { projection: { userId: 1, people: 1, dailyGoalMinutes: 1, taskTemplates: 1 } })
      .toArray(),
  ]);

  const settingsMap = new Map(settingsRows.map((s) => [s.userId, s]));

  return accounts.map((account) => {
    const id = account._id.toString();
    const activity = activityMap.get(id);
    const settings = settingsMap.get(id);

    return {
      id,
      email: account.email,
      name: account.name,
      status: account.status,
      createdAt:
        account.createdAt instanceof Date
          ? account.createdAt.toISOString()
          : new Date(account.createdAt).toISOString(),
      lastActiveAt: activity?.lastActiveAt?.toISOString() ?? null,
      totalMinutes: activity?.totalMinutes ?? 0,
      workMinutes: activity?.workMinutes ?? 0,
      deenMinutes: activity?.deenMinutes ?? 0,
      minutes7d: activity?.minutes7d ?? 0,
      minutes30d: activity?.minutes30d ?? 0,
      activeDays: activity?.activeDays ?? 0,
      activeDays30d: activity?.activeDays30d ?? 0,
      streak: activity ? computeStreak(activity.activeDateKeys, todayKey) : 0,
      logEntryCount: activity?.logEntryCount ?? 0,
      personCount: settings?.people?.length ?? 1,
      dailyGoalMinutes: settings?.dailyGoalMinutes ?? 480,
      templateCount: settings?.taskTemplates?.length ?? 0,
      loggedToday: activity?.activeDateKeys.has(todayKey) ?? false,
    };
  });
}

export function formatAdminMinutes(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "0m";
}
