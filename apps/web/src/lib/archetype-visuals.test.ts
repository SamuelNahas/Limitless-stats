import { describe, expect, it } from "vitest";
import decks from "../../public/data/v1/decks.json";
import { getArchetypeVisual, hasArchetypeArtwork } from "./archetype-visuals";

describe("archetype artwork coverage", () => {
  it("returns usable visual metadata for every classified deck in the active snapshot", () => {
    for (const deck of decks.filter((item) => item.id !== "sem-classificacao" && item.id !== "other")) {
      const visual = getArchetypeVisual(deck.id);
      expect(visual.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(Array.isArray(visual.pokemonIds)).toBe(true);
    }
  });

  it("keeps dedicated artwork for the main archetypes discovered by refreshes", () => {
    expect(hasArchetypeArtwork("wailord-ex")).toBe(true);
    expect(hasArchetypeArtwork("heatran-metang")).toBe(true);
  });

  it("falls back safely when a fresh snapshot introduces a new deck combination", () => {
    for (const deckId of ["greninja-blaziken", "reging-bolt-bellibolt"]) {
      const visual = getArchetypeVisual(deckId);
      expect(visual.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(visual.pokemonIds).toEqual([]);
    }
  });
});
