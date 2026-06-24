/** Local-only Azkar progress when offline without an account session. */
export const AZKAR_LOCAL_USER_ID = "local-guest";

export function resolveAzkarUserId(userId?: string | null): string {
  return userId?.trim() || AZKAR_LOCAL_USER_ID;
}

export function canSyncAzkarProgress(userId: string): boolean {
  return userId !== AZKAR_LOCAL_USER_ID;
}
