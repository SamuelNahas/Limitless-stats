import "server-only";

import canonicalDecklistsData from "../../public/data/v1/canonical-decklists.json";
import decksData from "../../public/data/v1/decks.json";
import listsData from "../../public/data/v1/lists.json";
import manifestData from "../../public/data/v1/manifest.json";
import matchupsAllData from "../../public/data/v1/matchups-all.json";
import tournamentsData from "../../public/data/v1/tournaments.json";
import type {
  CanonicalDecklist,
  DataManifest,
  Deck,
  Matchup,
  PublishedList,
  Tournament,
} from "@/types/domain";

export const manifest = manifestData as DataManifest;
export const decks = (decksData as Deck[]).filter((deck) => deck.id !== "sem-classificacao" && deck.id !== "other");
export const matchupsAll = matchupsAllData as Matchup[];
export const tournaments = tournamentsData as Tournament[];
export const publishedLists = listsData as Record<string, PublishedList[]>;
export const canonicalDecklists = canonicalDecklistsData as Record<string, CanonicalDecklist>;

export function getDeck(deckId: string): Deck | undefined {
  return decks.find((deck) => deck.id === deckId);
}

export function getDeckMatchups(deckId: string): Matchup[] {
  return matchupsAll.filter((matchup) => matchup.deckId === deckId && matchup.opponentId !== deckId);
}
