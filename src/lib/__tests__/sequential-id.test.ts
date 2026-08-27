import { describe, it, expect } from "vitest";
import { nextSequentialId } from "../sequential-id";

describe("nextSequentialId", () => {
  it("starts at 001 when nothing exists", () => {
    expect(nextSequentialId([], "R")).toBe("R-001");
  });

  it("continues from the highest existing suffix", () => {
    expect(nextSequentialId(["R-001", "R-002", "R-003"], "R")).toBe("R-004");
  });

  it("does NOT reuse an id after a delete — the bug this replaced", () => {
    // Five created, the third deleted. Counting rows would give R-005, which is live.
    const afterDelete = ["R-001", "R-002", "R-004", "R-005"];
    expect(nextSequentialId(afterDelete, "R")).toBe("R-006");
  });

  it("ignores nulls and foreign prefixes", () => {
    expect(nextSequentialId([null, undefined, "I-009", "R-002"], "R")).toBe("R-003");
  });

  it("pads past three digits without truncating", () => {
    expect(nextSequentialId(["R-999"], "R")).toBe("R-1000");
  });

  it("handles compound prefixes used by action items", () => {
    expect(nextSequentialId(["AI-PRJ014-007"], "AI-PRJ014")).toBe("AI-PRJ014-008");
  });

  it("treats regex metacharacters in the prefix literally", () => {
    expect(nextSequentialId(["A.B-004"], "A.B")).toBe("A.B-005");
    // "A.B" must not match "AXB"
    expect(nextSequentialId(["AXB-009"], "A.B")).toBe("A.B-001");
  });
});
