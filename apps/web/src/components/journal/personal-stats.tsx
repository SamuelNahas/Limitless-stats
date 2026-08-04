"use client";

import { BarChart3, Crosshair, Layers3 } from "lucide-react";
import { PokemonArtwork } from "@/components/ui/pokemon-artwork";
import { percent, rateBand, resultRate } from "@/lib/stats";
import type { Deck, JournalEvent, MatchRecord, TiePolicy } from "@/types/domain";

type PersonalStat = MatchRecord & { id: string; name: string; matches: number };

function accumulate(target: Map<string, PersonalStat>, id: string, name: string, result: "win" | "loss" | "tie") {
  const current = target.get(id) ?? { id, name, wins: 0, losses: 0, ties: 0, matches: 0 };
  current[result === "win" ? "wins" : result === "loss" ? "losses" : "ties"] += 1;
  current.matches += 1;
  target.set(id, current);
}

export function PersonalStats({ events, decks, tiePolicy }: { events: JournalEvent[]; decks: Deck[]; tiePolicy: TiePolicy }) {
  const deckNames = new Map(decks.map((deck) => [deck.id, deck.name]));
  const own = new Map<string, PersonalStat>();
  const opponents = new Map<string, PersonalStat>();
  for (const event of events) {
    for (const round of event.rounds) {
      accumulate(own, event.ownDeckId, deckNames.get(event.ownDeckId) || event.ownDeckLabel || "Deck customizado", round.result);
      accumulate(opponents, round.opponentDeckId, deckNames.get(round.opponentDeckId) || round.opponentLabel || "Deck customizado", round.result);
    }
  }
  if (!opponents.size) return null;
  const ownStats = [...own.values()].toSorted((a, b) => (resultRate(b, tiePolicy) ?? 0) - (resultRate(a, tiePolicy) ?? 0) || b.matches - a.matches);
  const opponentStats = [...opponents.values()].toSorted((a, b) => b.matches - a.matches || (resultRate(b, tiePolicy) ?? 0) - (resultRate(a, tiePolicy) ?? 0));

  return (
    <section className="personal-stats-section" aria-labelledby="personal-stats-title">
      <div className="section-header">
        <div><span className="section-kicker">Análise pessoal</span><h2 id="personal-stats-title">Seu desempenho, sem achismos.</h2><p>Winrates recalculados com a mesma regra de empates selecionada em Matchups.</p></div>
        <BarChart3 size={21} />
      </div>
      <div className="personal-stats-grid">
        <PersonalStatPanel title="Seus decks" icon={<Layers3 size={16} />} stats={ownStats} tiePolicy={tiePolicy} empty="Registre partidas com mais de um deck." />
        <PersonalStatPanel title="Contra cada deck" icon={<Crosshair size={16} />} stats={opponentStats} tiePolicy={tiePolicy} empty="Adicione o deck adversário às rodadas." />
      </div>
    </section>
  );
}

function PersonalStatPanel({ title, icon, stats, tiePolicy, empty }: { title: string; icon: React.ReactNode; stats: PersonalStat[]; tiePolicy: TiePolicy; empty: string }) {
  return (
    <article className="personal-stat-panel">
      <header><span>{icon}</span><div><h3>{title}</h3><small>W–L–T e result rate</small></div></header>
      {stats.length ? <div className="personal-stat-list">{stats.slice(0, 12).map((stat) => {
        const rate = resultRate(stat, tiePolicy);
        return <div className="personal-stat-row" key={stat.id}>
          <PokemonArtwork deckId={stat.id} name={stat.name} size="mini" />
          <span><strong>{stat.name}</strong><small>{stat.wins}–{stat.losses}–{stat.ties} · {stat.matches} {stat.matches === 1 ? "partida" : "partidas"}</small></span>
          <strong className={`rate-${rateBand(rate)}`}>{percent(rate)}</strong>
        </div>;
      })}</div> : <p className="personal-stat-empty">{empty}</p>}
    </article>
  );
}
