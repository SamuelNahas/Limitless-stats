import { describe, expect, it } from "vitest";
import decks from "../../public/data/v1/decks.json";
import { hasArchetypeArtwork } from "./archetype-visuals";

describe("archetype artwork coverage", () => {
  it("has a Pokémon visual for every classified deck in the active snapshot", () => {
    const missing = decks
      .filter((deck) => deck.id !== "sem-classificacao" && deck.id !== "other")
      .filter((deck) => !hasArchetypeArtwork(deck.id))
      .map((deck) => deck.id);
    expect(missing).toEqual([]);
  });
});
