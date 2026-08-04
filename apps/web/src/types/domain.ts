export type MatchMode = "all" | "bo1" | "bo3";

export type TiePolicy = "ignore" | "loss" | "half" | "third" | "win";

export type MatchRecord = {
  wins: number;
  losses: number;
  ties: number;
};

export type DeckModeStats = {
  entries: number;
  matches: number;
  scoreRate: number;
};

export type Deck = {
  id: string;
  name: string;
  entries: number;
  metaShare: number;
  tournaments: number;
  titles: number;
  top8: number;
  top8Rate: number;
  record: MatchRecord;
  nonMirrorWinRate: number;
  modes: {
    bo1: DeckModeStats;
    bo3: DeckModeStats;
  };
};

export type Matchup = {
  deckId: string;
  opponentId: string;
  wins: number;
  losses: number;
  ties: number;
};

export type Tournament = {
  id: string;
  playedAt: string;
  name: string;
  organizer: string;
  players: number;
  format: string;
  platform: string;
  modes: string[];
  url: string;
};

export type PublishedList = {
  rank: number;
  player: string;
  placing: number;
  record: string;
  tournament: string;
  tournamentPlayers: number;
  playedAt: string;
  url: string;
};

export type DeckCard = {
  id: string;
  name: string;
  category: "pokemon" | "trainer" | "energy";
  count: number;
};

export type CanonicalDecklist = {
  deckId: string;
  player: string;
  record: string;
  url: string;
  cards: DeckCard[];
};

export type DataManifest = {
  schemaVersion: number;
  snapshotId: string;
  generatedAt: string;
  scope: {
    gameId: string;
    platformId: string;
    formatId: string;
    formatName: string;
    eraId: string;
    eraName: string;
    dateFrom: string;
    dateTo: string | null;
    minimumPlayers: number;
  };
  calculation: {
    rankingTiePolicy: TiePolicy;
    modelVersion: number;
  };
  counts: {
    tournaments: number;
    entries: number;
    matches: number;
    archetypes: number;
  };
  resources: Record<string, string>;
  warnings: string[];
};

export type JournalResult = "win" | "loss" | "tie";
export type TurnOrder = "first" | "second" | "unknown";

export type JournalRound = {
  id: string;
  roundNumber: number;
  opponentDeckId: string;
  opponentLabel?: string;
  result: JournalResult;
  gameWins?: number;
  gameLosses?: number;
  gameTies?: number;
  turnOrder: TurnOrder;
  notes?: string;
};

export type JournalEvent = {
  id: string;
  name: string;
  playedAt: string;
  formatId: string;
  eraId: string;
  mode: "bo1" | "bo3";
  ownDeckId: string;
  ownDeckLabel?: string;
  decklistText: string;
  rounds: JournalRound[];
  createdAt: string;
  updatedAt: string;
};

export type ParsedDeckCard = {
  line: number;
  count: number;
  name: string;
  setCode?: string;
  number?: string;
  category: "pokemon" | "trainer" | "energy" | "unknown";
};

export type DecklistParseResult = {
  cards: ParsedDeckCard[];
  total: number;
  errors: Array<{ line: number; message: string; raw: string }>;
};
