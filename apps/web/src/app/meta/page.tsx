import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarRange, Gamepad2, Layers3, Swords, Trophy } from "lucide-react";
import { DeckCard } from "@/components/decks/deck-card";
import { MetaRanking } from "@/components/meta/meta-ranking";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { decks, manifest, tournaments } from "@/data/snapshot";
import { compactNumber, formatDate } from "@/lib/stats";

export const metadata: Metadata = { title: "Metagame" };

export default function MetaPage() {
  const topDecks = decks.slice(0, 6);
  const latestTournaments = tournaments.slice(0, 5);
  return (
    <div className="content-container">
      <PageHeader eyebrow="Meta intelligence / live" title="O meta, sem achismo." description={`Resultados dos torneios ${manifest.scope.formatName} Online desde o início da coleção ${manifest.scope.eraName}, convertidos em sinais úteis para sua próxima escolha de deck.`} dateLabel={`${formatDate(manifest.scope.dateFrom)} — ${formatDate(manifest.scope.dateTo || manifest.generatedAt)}`} />
      <div className="filter-strip">
        <span className="filter-chip"><span className="status-dot" /><strong>{manifest.scope.formatName}</strong></span>
        <span className="filter-chip">Online · TCG Live</span>
        <span className="filter-chip">Era <strong>{manifest.scope.eraName}</strong></span>
        <span className="filter-chip">Todos os tamanhos</span>
        <span className="filter-spacer" />
        <span className="update-note">Snapshot {manifest.snapshotId}</span>
      </div>

      <section className="stats-grid" aria-label="Resumo do metagame">
        <StatCard label="Torneios" value={manifest.counts.tournaments.toLocaleString("pt-BR")} detail="eventos online concluídos" icon={Trophy} tone="violet" />
        <StatCard label="Entradas" value={compactNumber(manifest.counts.entries)} detail="listas classificadas" icon={Gamepad2} tone="cyan" />
        <StatCard label="Partidas" value={compactNumber(manifest.counts.matches)} detail="resultados válidos" icon={Swords} tone="green" />
        <StatCard label="Arquétipos" value={manifest.counts.archetypes.toLocaleString("pt-BR")} detail="identificados pelo Limitless" icon={Layers3} tone="orange" />
      </section>

      <section className="section">
        <div className="section-header">
          <div><span className="section-kicker">Distribuição atual</span><h2>Decks que definem o campo</h2><p>Os arquétipos mais presentes da era, com taxa recalculada pela sua regra de empates.</p></div>
          <Link href="/decks" className="section-link">Ver todos <ArrowRight size={15} /></Link>
        </div>
        <div className="deck-grid">{topDecks.map((deck, index) => <DeckCard key={deck.id} deck={deck} rank={index + 1} />)}</div>
      </section>

      <section className="section">
        <div className="section-header">
          <div><span className="section-kicker">Ranking completo</span><h2>Panorama dos arquétipos</h2><p>Popularidade, desempenho bruto e conversão em Top 8 no mesmo lugar.</p></div>
        </div>
        <MetaRanking decks={decks} />
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
    </div>
  );
}
