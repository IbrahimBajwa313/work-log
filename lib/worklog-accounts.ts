import type { Db } from "mongodb";

export const worklogAccountsCollection =
  process.env.WORKLOG_ACCOUNTS_COLLECTION || "worklogAccounts";

export type WorklogAccountStatus = "active" | "removed";

export type WorklogAccountDoc = {
  email: string;
  name: string;
  passwordHash: string;
  status: WorklogAccountStatus;
  createdAt: Date;
  updatedAt: Date;
};

let indexesEnsured = false;

export async function ensureWorklogAccountIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  await db.collection(worklogAccountsCollection).createIndex({ email: 1 }, { unique: true });
  indexesEnsured = true;
}

export function normalizeWorklogEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeWorklogName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
