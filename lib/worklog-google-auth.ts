import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { GoogleUserInfo } from "@/lib/google-oauth";
import {
  ensureWorklogAccountIndexes,
  normalizeWorklogEmail,
  normalizeWorklogName,
  type WorklogAccountDoc,
  worklogAccountsCollection,
} from "@/lib/worklog-accounts";

export type GoogleSignInResult = {
  id: string;
  email: string;
  name: string;
  isNewUser: boolean;
};

function accountNameFromGoogle(profile: GoogleUserInfo): string {
  const fromProfile = profile.name?.trim();
  if (fromProfile) return normalizeWorklogName(fromProfile);
  const localPart = profile.email.split("@")[0]?.trim();
  if (localPart) return normalizeWorklogName(localPart.replace(/[._-]+/g, " "));
  return "Google User";
}

function hasGoogleProvider(account: { googleId?: unknown; authProviders?: unknown }): boolean {
  if (typeof account.googleId === "string" && account.googleId.length > 0) return true;
  return (
    Array.isArray(account.authProviders) &&
    account.authProviders.some((provider) => provider === "google")
  );
}

export async function signInWithGoogleAccount(
  db: Db,
  profile: GoogleUserInfo
): Promise<GoogleSignInResult> {
  await ensureWorklogAccountIndexes(db);

  const emailNorm = normalizeWorklogEmail(profile.email);
  const googleId = profile.sub;
  const now = new Date();
  const collection = db.collection(worklogAccountsCollection);

  const byGoogleId = await collection.findOne({ googleId });
  if (byGoogleId) {
    if (byGoogleId.status === "removed") {
      throw new Error("This account is no longer active.");
    }

    const id =
      byGoogleId._id instanceof ObjectId
        ? byGoogleId._id
        : new ObjectId(String(byGoogleId._id));

    await collection.updateOne(
      { _id: id },
      {
        $set: {
          email: emailNorm,
          updatedAt: now,
          ...(typeof byGoogleId.name !== "string" || !byGoogleId.name.trim()
            ? { name: accountNameFromGoogle(profile) }
            : {}),
        },
        $addToSet: { authProviders: "google" },
      }
    );

    return {
      id: id.toHexString(),
      email: emailNorm,
      name:
        typeof byGoogleId.name === "string" && byGoogleId.name.trim()
          ? byGoogleId.name
          : accountNameFromGoogle(profile),
      isNewUser: false,
    };
  }

  const byEmail = await collection.findOne({ email: emailNorm });
  if (byEmail) {
    if (byEmail.status === "removed") {
      throw new Error("This account is no longer active.");
    }

    const id =
      byEmail._id instanceof ObjectId ? byEmail._id : new ObjectId(String(byEmail._id));

    await collection.updateOne(
      { _id: id },
      {
        $set: {
          googleId,
          updatedAt: now,
        },
        $addToSet: { authProviders: "google" },
      }
    );

    return {
      id: id.toHexString(),
      email: emailNorm,
      name: typeof byEmail.name === "string" ? byEmail.name : accountNameFromGoogle(profile),
      isNewUser: false,
    };
  }

  const name = accountNameFromGoogle(profile);
  const doc: WorklogAccountDoc = {
    email: emailNorm,
    name,
    googleId,
    authProviders: ["google"],
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  let insertedId: ObjectId;
  try {
    const result = await collection.insertOne(doc);
    insertedId = result.insertedId;
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code: number }).code : 0;
    if (code === 11000) {
      const existing = await collection.findOne({
        $or: [{ googleId }, { email: emailNorm }],
      });
      if (existing) {
        return signInWithGoogleAccount(db, profile);
      }
    }
    throw e;
  }

  return {
    id: insertedId.toHexString(),
    email: emailNorm,
    name,
    isNewUser: true,
  };
}

export function accountUsesGoogleOnly(account: {
  passwordHash?: unknown;
  googleId?: unknown;
  authProviders?: unknown;
}): boolean {
  const hasPassword = typeof account.passwordHash === "string" && account.passwordHash.length > 0;
  return !hasPassword && hasGoogleProvider(account);
}
