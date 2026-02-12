import { describe, expect, it } from "vitest";

import { canTransition, transitionState } from "@/lib/pollState";

describe("poll state machine", () => {
  it("supports valid transitions", () => {
    expect(canTransition("DRAFT", "START")).toBe(true);
    expect(transitionState("DRAFT", "START")).toBe("LIVE");

    expect(canTransition("LIVE", "END")).toBe(true);
    expect(transitionState("LIVE", "END")).toBe("ENDED");

    expect(canTransition("ENDED", "RESET")).toBe(true);
    expect(transitionState("ENDED", "RESET")).toBe("DRAFT");
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("DRAFT", "END")).toBe(false);
    expect(() => transitionState("DRAFT", "END")).toThrowError("Invalid transition");

    expect(canTransition("ENDED", "START")).toBe(false);
    expect(() => transitionState("ENDED", "START")).toThrowError("Invalid transition");
  });
});

