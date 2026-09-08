export const GENERATE_SCAFFOLD_STEP_ID = "generate:scaffold";

export const GATE_NAMES = ["install", "types", "format", "seed", "typecheck", "build", "lint"] as const;
export type GateName = (typeof GATE_NAMES)[number];

export function generateGateStepId(gate: GateName): string {
  return `generate:${gate}`;
}
