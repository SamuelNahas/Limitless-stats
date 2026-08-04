"use client";

import Link from "next/link";
import { usePreferences } from "@/components/layout/preferences-provider";
import { percent, rateBand, resultRate } from "@/lib/stats";
import type { Deck, Matchup } from "@/types/domain";

export function DeckMatchups({ matchups, deckMap }: { matchups: Matchup[]; deckMap: Record<string, Deck> }) {
  const { tiePolicy } = usePreferences();
  const ranked = matchups
    .map((matchup) => ({ matchup, rate: resultRate(matchup, tiePolicy), opponent: deckMap[matchup.opponentId] }))
    .filter((item) => item.opponent && item.rate !== null && item.matchup.wins + item.matchup.losses + item.matchup.ties >= 5)
    .toSorted((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const items = [...ranked.slice(0, 4), ...ranked.slice(-4).reverse()];
  return (
    <div className="matchup-list compact-matchup-list">
      {items.map(({ matchup, rate, opponent }, index) => (
        <Link key={opponent.id} href={`/matchups?deck=${matchup.deckId}&opponent=${opponent.id}`} className="matchup-list-row">
          <span className={`matchup-signal rate-${rateBand(rate)}`} />
          <span className="matchup-opponent"><strong>{opponent.name}</strong><small>{matchup.wins}-{matchup.losses}-{matchup.ties} · {matchup.wins + matchup.losses + matchup.ties} jogos</small></span>
          <span className={`rate-pill rate-${rateBand(rate)}`}>{percent(rate)}</span>
          {index === 3 && <span className="matchup-divider-label">Mais difíceis</span>}
        </Link>
      ))}
    </div>
  );
}
