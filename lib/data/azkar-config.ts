import type { AzkarPeriod } from "@/lib/azkar";
import { EVENING_ADHKAR, EVENING_ADHKAR_INTRO } from "@/lib/data/evening-azkar";
import { MORNING_ADHKAR, MORNING_ADHKAR_INTRO } from "@/lib/data/morning-azkar";

export type AzkarPeriodConfig = {
  period: AzkarPeriod;
  title: string;
  intro: string;
  label: string;
  completeLabel: string;
  signInMessage: string;
  accentText: string;
  accentBorder: string;
  accentBg: string;
  accentMuted: string;
  progressFrom: string;
  progressTo: string;
  headerIcon: "sun" | "moon";
};

export const AZKAR_PERIOD_CONFIG: Record<AzkarPeriod, AzkarPeriodConfig> = {
  morning: {
    period: "morning",
    title: "Morning Adhkar",
    intro: MORNING_ADHKAR_INTRO,
    label: "Deen · Morning",
    completeLabel: "Morning Azkar complete",
    signInMessage: "Sign in to track your morning adhkār.",
    accentText: "text-emerald-300",
    accentBorder: "border-emerald-400/35",
    accentBg: "bg-emerald-400/5",
    accentMuted: "text-emerald-400",
    progressFrom: "from-emerald-400",
    progressTo: "to-[var(--accent-cyan)]",
    headerIcon: "sun",
  },
  evening: {
    period: "evening",
    title: "Evening Adhkar",
    intro: EVENING_ADHKAR_INTRO,
    label: "Deen · Evening",
    completeLabel: "Evening Azkar complete",
    signInMessage: "Sign in to track your evening adhkār.",
    accentText: "text-indigo-300",
    accentBorder: "border-indigo-400/35",
    accentBg: "bg-indigo-400/5",
    accentMuted: "text-indigo-400",
    progressFrom: "from-indigo-400",
    progressTo: "to-violet-400",
    headerIcon: "moon",
  },
};

export function getAdhkarForPeriod(period: AzkarPeriod) {
  return period === "morning" ? MORNING_ADHKAR : EVENING_ADHKAR;
}
