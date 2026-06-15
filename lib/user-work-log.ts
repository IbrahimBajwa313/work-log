import type { Db } from "mongodb";
import {
  emptyWorkLogDay,
  serializeWorkLogDay,
  type AdminWorkLogDoc,
  type SerializedWorkLogDay,
} from "@/lib/admin-work-log";
import { PRIMARY_PERSON_ID } from "@/lib/user-work-log-settings";

export const userWorkLogCollection =
  process.env.USER_WORK_LOG_COLLECTION || "userWorkLog";

export type UserWorkLogDoc = AdminWorkLogDoc & {
  userId: string;
  /** Which tracked person this day belongs to (defaults to primary). */
  personId?: string;
};

let indexesEnsured = false;

export function resolvePersonId(personId?: string | null): string {
  return personId?.trim() || PRIMARY_PERSON_ID;
}

export async function ensureUserWorkLogIndexes(db: Db): Promise<void> {
  if (indexesEnsured) return;
  const coll = db.collection(userWorkLogCollection);
  try {
    await coll.dropIndex("userId_1_dateKey_1");
  } catch {
    // Index may not exist yet.
  }
  await coll.createIndex({ userId: 1, personId: 1, dateKey: 1 }, { unique: true });
  await coll.createIndex({ userId: 1, personId: 1, dateKey: -1 });
  indexesEnsured = true;
}

export function serializeUserWorkLogDay(doc: UserWorkLogDoc): SerializedWorkLogDay {
  return serializeWorkLogDay(doc);
}

export function emptyUserWorkLogDay(dateKey: string): SerializedWorkLogDay {
  return emptyWorkLogDay(dateKey);
}
