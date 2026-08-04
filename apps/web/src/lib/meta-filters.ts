import type { DataManifest, Deck, Tournament, TournamentDeckStat } from "@/types/domain";

export type FilteredMeta = {
  decks: Deck[];
  tournaments: Tournament[];
  counts: DataManifest["counts"];
};

export function calculateFilteredMeta(
  decks: Deck[],
  tournaments: Tournament[],
  tournamentDeckStats: TournamentDeckStat[],
  baseCounts: DataManifest["counts"],
  minimumPlayers: number,
  snapshotMinimumPlayers: number,
): FilteredMeta {
  if (minimumPlayers <= snapshotMinimumPlayers) {
    return { decks, tournaments, counts: baseCounts };
  }

  const selectedTournaments = tournaments.filter((tournament) => tournament.players >= minimumPlayers);
  const tournamentIds = new Set(selectedTournaments.map((tournament) => tournament.id));
  const selectedStats = tournamentDeckStats.filter((stats) => tournamentIds.has(stats.tournamentId));
  const totalEntries = selectedTournaments.reduce((total, tournament) => total + tournament.players, 0);
  const statsByDeck = new Map<string, TournamentDeckStat[]>();

  for (const stats of selectedStats) {
    const deckStats = statsByDeck.get(stats.deckId) ?? [];
    deckStats.push(stats);
    statsByDeck.set(stats.deckId, deckStats);
  }

  const filteredDecks = decks.flatMap((deck) => {
    const deckStats = statsByDeck.get(deck.id) ?? [];
    if (!deckStats.length) return [];

    const record = deckStats.reduce(
      (total, stats) => ({
        wins: total.wins + stats.record.wins,
        losses: total.losses + stats.record.losses,
        ties: total.ties + stats.record.ties,
      }),
      { wins: 0, losses: 0, ties: 0 },
    );
    const deckEntries = deckStats.reduce((total, stats) => total + stats.entries, 0);
    const top8 = deckStats.reduce((total, stats) => total + stats.top8, 0);
    const winsAndLosses = record.wins + record.losses;

    return [{
      ...deck,
      entries: deckEntries,
      metaShare: totalEntries ? deckEntries / totalEntries : 0,
      tournaments: deckStats.length,
      titles: deckStats.reduce((total, stats) => total + stats.titles, 0),
      top8,
      top8Rate: top8 / deckEntries,
      record,
      nonMirrorWinRate: winsAndLosses ? record.wins / winsAndLosses : 0,
    }];
  }).toSorted((left, right) => right.metaShare - left.metaShare || left.name.localeCompare(right.name, "pt-BR"));

  const directionalResults = filteredDecks.reduce(
    (total, deck) => total + deck.record.wins + deck.record.losses + deck.record.ties,
    0,
  );

  return {
    decks: filteredDecks,
    tournaments: selectedTournaments,
    counts: {
      tournaments: selectedTournaments.length,
      entries: totalEntries,
      matches: Math.floor(directionalResults / 2),
      archetypes: filteredDecks.length,
    },
  };
}
