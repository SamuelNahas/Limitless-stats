"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CalendarRange, Gamepad2, Layers3, Swords, Trophy } from "lucide-react";
import { DeckCard } from "@/components/decks/deck-card";
import { MinimumPlayersFilter, useMinimumPlayersPreference } from "@/components/filters/minimum-players-filter";
import { MetaRanking } from "@/components/meta/meta-ranking";
import { StatCard } from "@/components/ui/stat-card";
import { calculateFilteredMeta } from "@/lib/meta-filters";
import { compactNumber, formatDate } from "@/lib/stats";
import type { DataManifest, Deck, Tournament, TournamentDeckStat } from "@/types/domain";

type MetaDashboardProps = {
  decks: Deck[];
  manifest: DataManifest;
  tournamentDeckStats: TournamentDeckStat[];
  tournaments: Tournament[];
};

export function MetaDashboard({ decks, manifest, tournamentDeckStats, tournaments }: MetaDashboardProps) {
  const minimumPlayersPreference = useMinimumPlayersPreference(manifest.scope.minimumPlayers);
  const { minimumPlayers } = minimumPlayersPreference;
  const maximumPlayers = Math.max(...tournaments.map((tournament) => tournament.players), manifest.scope.minimumPlayers);
  const meta = useMemo(
    () => calculateFilteredMeta(
      decks,
      tournaments,
      tournamentDeckStats,
      manifest.counts,
      minimumPlayers,
      manifest.scope.minimumPlayers,
    ),
    [decks, manifest, minimumPlayers, tournamentDeckStats, tournaments],
  );
  const topDecks = meta.decks.slice(0, 6);
  const latestTournaments = meta.tournaments.slice(0, 5);
  const isFiltered = minimumPlayers > manifest.scope.minimumPlayers;

  return (
    <>
      <div className="filter-strip meta-filter-strip">
        <span className="filter-chip"><span className="status-dot" /><strong>{manifest.scope.formatName}</strong></span>
        <span className="filter-chip">Online · TCG Live</span>
        <span className="filter-chip">Era <strong>{manifest.scope.eraName}</strong></span>
        <MinimumPlayersFilter id="meta-minimum-players" maximumPlayers={maximumPlayers} preference={minimumPlayersPreference} />
        <span className="filter-spacer" />
        <span className="update-note">{isFiltered ? "Cálculo atualizado pelo filtro" : `Snapshot ${manifest.snapshotId}`}</span>
      </div>

      <section className="stats-grid" aria-label="Resumo do metagame">
        <StatCard label="Torneios" value={meta.counts.tournaments.toLocaleString("pt-BR")} detail="eventos dentro do filtro" icon={Trophy} tone="violet" />
        <StatCard label="Entradas" value={compactNumber(meta.counts.entries)} detail="jogadores nesses eventos" icon={Gamepad2} tone="cyan" />
        <StatCard label="Partidas" value={compactNumber(meta.counts.matches)} detail="resultados válidos" icon={Swords} tone="green" />
        <StatCard label="Arquétipos" value={meta.counts.archetypes.toLocaleString("pt-BR")} detail="identificados no recorte" icon={Layers3} tone="orange" />
      </section>

      <section className="section">
        <div className="section-header">
          <div><span className="section-kicker">Distribuição atual</span><h2>Decks que definem o campo</h2><p>Os arquétipos mais presentes nos torneios selecionados, com taxa recalculada pela sua regra de empates.</p></div>
          <Link href="/decks" className="section-link">Ver todos <ArrowRight size={15} /></Link>
        </div>
        {topDecks.length ? <div className="deck-grid">{topDecks.map((deck, index) => <DeckCard key={deck.id} deck={deck} rank={index + 1} />)}</div> : <div className="data-panel empty-state"><div><h3>Nenhum torneio encontrado</h3><p>Reduza o número mínimo de jogadores para ampliar a amostra.</p></div></div>}
      </section>

      <section className="section">
        <div className="section-header">
          <div><span className="section-kicker">Ranking completo</span><h2>Panorama dos arquétipos</h2><p>Popularidade, desempenho bruto e conversão em Top 8 no mesmo lugar.</p></div>
        </div>
        <MetaRanking decks={meta.decks} />
      </section>

      <section className="section page-end-section">
        <div className="section-header">
          <div><span className="section-kicker">Amostra recente</span><h2>Últimos torneios processados</h2></div>
        </div>
        <div className="tournament-list">
          {latestTournaments.map((tournament) => (
            <a key={tournament.id} href={tournament.url} target="_blank" rel="noreferrer" className="tournament-row">
              <span className="tournament-icon"><CalendarRange size={18} /></span>
              <span className="tournament-name"><strong>{tournament.name}</strong><small>{tournament.organizer} · {formatDate(tournament.playedAt)}</small></span>
              <span className="tournament-players">{tournament.players}<small>jogadores</small></span>
              <ArrowRight size={17} />
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
