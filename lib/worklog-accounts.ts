import type { Db } from "mongodb";

export const worklogAccountsCollection =
  process.env.WORKLOG_ACCOUNTS_COLLECTION || "worklogAccounts";

export type WorklogAccountStatus = "active" | "removed";

export type WorklogAuthProvider = "password" | "google";

export type WorklogAccountDoc = {
  email: string;
  name: string;
  picture?: string;
  passwordHash?: string;
  googleId?: string;
  authProviders?: WorklogAuthProvider[];
  status: WorklogAccountStatus;
  createdAt: Date;
  updatedAt: Date;
};

let indexesEnsured = false;

export async function ensureWorklogAccountIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  const collection = db.collection(worklogAccountsCollection);
  await collection.createIndex({ email: 1 }, { unique: true });
  await collection.createIndex({ googleId: 1 }, { unique: true, sparse: true });
  indexesEnsured = true;
}

export function normalizeWorklogEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeWorklogName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
