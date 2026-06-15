import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/** WorkLog: simple rule — at least 6 characters. */
export function isWorklogPasswordValid(password: string): boolean {
  return password.length >= 6 && password.length <= 200;
}

export async function hashWorklogPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyWorklogPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
