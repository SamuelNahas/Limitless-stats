import { describe, expect, it } from "vitest";
import { calculateFilteredMeta } from "./meta-filters";
import type { Deck, Tournament, TournamentDeckStat } from "@/types/domain";

const deck = (id: string): Deck => ({
  id,
  name: id,
  entries: 3,
  metaShare: 0.3,
  tournaments: 2,
  titles: 0,
  top8: 0,
  top8Rate: 0,
  record: { wins: 0, losses: 0, ties: 0 },
  nonMirrorWinRate: 0,
  modes: {
    bo1: { entries: 0, matches: 0, scoreRate: 0 },
    bo3: { entries: 0, matches: 0, scoreRate: 0 },
  },
});

const tournament = (id: string, players: number): Tournament => ({
  id,
  players,
  playedAt: "2026-08-01",
  name: id,
  organizer: "test",
  format: "standard",
  platform: "online",
  modes: ["BO1"],
  url: "https://example.com",
});

describe("calculateFilteredMeta", () => {
  it("recalculates deck share using only tournaments that meet the player threshold", () => {
    const tournaments = [tournament("small", 8), tournament("large", 32)];
    const tournamentDeckStats: TournamentDeckStat[] = [
      { tournamentId: "small", deckId: "a", entries: 1, titles: 1, top8: 1, record: { wins: 3, losses: 0, ties: 0 } },
      { tournamentId: "large", deckId: "a", entries: 1, titles: 0, top8: 1, record: { wins: 4, losses: 1, ties: 0 } },
      { tournamentId: "large", deckId: "b", entries: 1, titles: 1, top8: 1, record: { wins: 5, losses: 0, ties: 0 } },
    ];

    const result = calculateFilteredMeta(
      [deck("a"), deck("b")],
      tournaments,
      tournamentDeckStats,
      { tournaments: 2, entries: 40, matches: 10, archetypes: 2 },
      16,
      1,
    );

    expect(result.tournaments.map((item) => item.id)).toEqual(["large"]);
    expect(result.counts.entries).toBe(32);
    expect(result.decks.map((item) => [item.id, item.metaShare])).toEqual([
      ["a", 1 / 32],
      ["b", 1 / 32],
    ]);
    expect(result.decks[0].record).toEqual({ wins: 4, losses: 1, ties: 0 });
  });

  it("returns the exact snapshot aggregates at its original minimum", () => {
    const decks = [deck("a")];
    const tournaments = [tournament("small", 8)];
    const counts = { tournaments: 1, entries: 8, matches: 3, archetypes: 1 };
    const result = calculateFilteredMeta(decks, tournaments, [], counts, 1, 1);
    expect(result).toEqual({ decks, tournaments, counts });
  });
});
