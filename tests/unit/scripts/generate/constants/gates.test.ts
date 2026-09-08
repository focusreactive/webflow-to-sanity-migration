import { GATE_NAMES, generateGateStepId } from "#generate/constants/ids.ts";
import { BLOCKING_GATES, GATE_TIMEOUT_MS } from "#generate/constants/gates.ts";

describe("generate gate constants", () => {
  it("gives every gate a timeout", () => {
    for (const gate of GATE_NAMES) expect(GATE_TIMEOUT_MS[gate]).toBeGreaterThan(0);
  });

  it("treats lint as the only non-blocking gate", () => {
    expect(GATE_NAMES.filter((gate) => !BLOCKING_GATES.has(gate))).toEqual(["lint"]);
  });

  it("namespaces every gate step id under generate", () => {
    for (const gate of GATE_NAMES) expect(generateGateStepId(gate)).toBe(`generate:${gate}`);
  });
});
