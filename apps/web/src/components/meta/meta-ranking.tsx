"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { usePreferences } from "@/components/layout/preferences-provider";
import { getArchetypeVisual } from "@/lib/archetype-visuals";
import { percent, rateBand, recordTotal, resultRate } from "@/lib/stats";
import type { Deck } from "@/types/domain";

export function MetaRanking({ decks }: { decks: Deck[] }) {
  const { tiePolicy } = usePreferences();
  return (
    <div className="data-panel">
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>#</th><th>Arquétipo</th><th>Meta share</th><th>Entradas</th><th>W-L-T</th><th>Result rate</th><th>Top 8</th><th /></tr></thead>
          <tbody>
            {decks.slice(0, 25).map((deck, index) => {
              const rate = resultRate(deck.record, tiePolicy);
              const visual = getArchetypeVisual(deck.id);
              return (
                <tr key={deck.id}>
                  <td><span className="rank-number">{String(index + 1).padStart(2, "0")}</span></td>
                  <td className="deck-name-cell">
                    <Link href={`/decks/${deck.id}`} className="mini-deck-cell">
                      <span className="deck-dot" style={{ background: visual.accent }} />
                      <span>{deck.name}</span>
                    </Link>
                  </td>
                  <td><span className="share-bar"><span className="share-track"><span className="share-fill" style={{ width: `${Math.min(100, deck.metaShare * 900)}%` }} /></span>{percent(deck.metaShare)}</span></td>
                  <td>{deck.entries.toLocaleString("pt-BR")}</td>
                  <td>{deck.record.wins}-{deck.record.losses}-{deck.record.ties}</td>
                  <td><span className={`rate-pill rate-${rateBand(rate)}`}>{percent(rate)}</span></td>
                  <td>{deck.top8} <span className="muted-value">({percent(deck.top8Rate)})</span></td>
                  <td><Link href={`/decks/${deck.id}`} className="table-action" aria-label={`Abrir ${deck.name}`}><ArrowUpRight size={16} /></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-footnote">Result rate calculado em {decks.reduce((sum, deck) => sum + recordTotal(deck.record), 0).toLocaleString("pt-BR")} resultados direcionais.</div>
    </div>
  );
}
