"use client";

import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";
import { usePreferences } from "@/components/layout/preferences-provider";
import { percent, recordTotal, resultRate } from "@/lib/stats";
import type { Deck } from "@/types/domain";
import { PokemonArtwork } from "@/components/ui/pokemon-artwork";

export function DeckCard({ deck, rank }: { deck: Deck; rank?: number }) {
  const { tiePolicy } = usePreferences();
  return (
    <Link href={`/decks/${deck.id}`} className="deck-card">
      <PokemonArtwork deckId={deck.id} name={deck.name} priority={Boolean(rank && rank <= 3)} />
      <div className="deck-card-body">
        <div className="deck-card-rank">
          {rank ? <span>#{String(rank).padStart(2, "0")}</span> : <span>ARQUÉTIPO</span>}
          {deck.titles > 0 && <span className="title-count"><Trophy size={13} /> {deck.titles}</span>}
        </div>
        <h3>{deck.name}</h3>
        <div className="deck-card-stats">
          <div><small>Meta share</small><strong>{percent(deck.metaShare)}</strong></div>
          <div><small>Result rate</small><strong>{percent(resultRate(deck.record, tiePolicy))}</strong></div>
          <div><small>Partidas</small><strong>{recordTotal(deck.record).toLocaleString("pt-BR")}</strong></div>
        </div>
        <div className="deck-card-footer"><span>Ver análise</span><ArrowUpRight size={17} /></div>
      </div>
    </Link>
  );
}
