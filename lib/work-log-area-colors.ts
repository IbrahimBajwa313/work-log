export type WorkLogArea = "work" | "deen" | "fitness";

export type WorkLogAreaColorSet = {
  color: string;
  border: string;
  softBg: string;
  btnText: string;
};

/**
 * Work / deen / fitness palette — distinct hues, contemporary saturation,
 * tuned for dark UI (not neon, not muddy legacy tones).
 */
export const WORK_LOG_AREA_COLORS: Record<WorkLogArea, WorkLogAreaColorSet> = {
  work: {
    color: "#7289FF",
    border: "rgba(114, 137, 255, 0.34)",
    softBg: "rgba(114, 137, 255, 0.12)",
    btnText: "#0A0D18",
  },
  deen: {
    color: "#3DD6B0",
    border: "rgba(61, 214, 176, 0.34)",
    softBg: "rgba(61, 214, 176, 0.12)",
    btnText: "#071612",
  },
  fitness: {
    color: "#F0886B",
    border: "rgba(240, 136, 107, 0.34)",
    softBg: "rgba(240, 136, 107, 0.12)",
    btnText: "#160C09",
  },
};

export const WORK_LOG_CUSTOM_PLAN_COLOR = "#A78BFA";

export function workLogAreaColor(area: WorkLogArea): string {
  return WORK_LOG_AREA_COLORS[area].color;
}

export function workLogAreaColorForKind(kind: string | undefined): string {
  if (kind === "deen") return WORK_LOG_AREA_COLORS.deen.color;
  if (kind === "fitness") return WORK_LOG_AREA_COLORS.fitness.color;
  if (kind === "work") return WORK_LOG_AREA_COLORS.work.color;
  return WORK_LOG_CUSTOM_PLAN_COLOR;
}

export function workLogAreaColorsForKind(
  kind: string | undefined
): WorkLogAreaColorSet | { color: string; border: string; softBg: string; btnText: string } {
  if (kind === "deen") return WORK_LOG_AREA_COLORS.deen;
  if (kind === "fitness") return WORK_LOG_AREA_COLORS.fitness;
  if (kind === "work") return WORK_LOG_AREA_COLORS.work;
  return {
    color: WORK_LOG_CUSTOM_PLAN_COLOR,
    border: "rgba(167, 139, 250, 0.34)",
    softBg: "rgba(167, 139, 250, 0.12)",
    btnText: "#0D0A14",
  };
}
