import { describe, expect, it } from "vitest";
import { resultRate } from "./stats";

describe("resultRate", () => {
  const record = { wins: 6, losses: 3, ties: 3 };
  it("aplica todas as políticas sem perder W/L/T", () => {
    expect(resultRate(record, "ignore")).toBeCloseTo(6 / 9);
    expect(resultRate(record, "loss")).toBeCloseTo(6 / 12);
    expect(resultRate(record, "half")).toBeCloseTo(7.5 / 12);
    expect(resultRate(record, "third")).toBeCloseTo(7 / 12);
    expect(resultRate(record, "win")).toBeCloseTo(9 / 12);
  });
  it("retorna null quando não há resultado elegível", () => {
    expect(resultRate({ wins: 0, losses: 0, ties: 0 }, "half")).toBeNull();
    expect(resultRate({ wins: 0, losses: 0, ties: 2 }, "ignore")).toBeNull();
  });
});
