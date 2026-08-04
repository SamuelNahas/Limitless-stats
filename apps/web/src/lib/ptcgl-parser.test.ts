import { describe, expect, it } from "vitest";
import { parsePtcglDecklist } from "./ptcgl-parser";

describe("parsePtcglDecklist", () => {
  it("aceita seções em português e uma lista de 60 cartas", () => {
    const parsed = parsePtcglDecklist("Pokémon: 4\n4 Dreepy TWM 128\n\nTreinadores: 4\n4 Iono PAL 185\n\nEnergias: 52\n52 Basic Psychic Energy SVE 5\nTotal Cards: 60");
    expect(parsed.total).toBe(60);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.cards.map((card) => card.category)).toEqual(["pokemon", "trainer", "energy"]);
  });
  it("informa a linha e o total quando a lista é inválida", () => {
    const parsed = parsePtcglDecklist("Pokémon: 1\nlinha quebrada");
    expect(parsed.total).toBe(0);
    expect(parsed.errors.some((error) => error.line === 2)).toBe(true);
    expect(parsed.errors.some((error) => error.message.includes("0 cartas"))).toBe(true);
  });
});
