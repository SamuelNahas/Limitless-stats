"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { MinimumMetaShareFilter, useMinimumMetaSharePreference } from "@/components/filters/minimum-meta-share-filter";
import { MinimumPlayersFilter, useMinimumPlayersPreference } from "@/components/filters/minimum-players-filter";
import { calculateFilteredMeta } from "@/lib/meta-filters";
import { DeckCard } from "./deck-card";
import type { DataManifest, Deck, Tournament, TournamentDeckStat } from "@/types/domain";

type SortKey = "share" | "result" | "top8" | "name";

type DeckCatalogProps = {
  decks: Deck[];
  manifest: DataManifest;
  tournamentDeckStats: TournamentDeckStat[];
  tournaments: Tournament[];
};

export function DeckCatalog({ decks, manifest, tournamentDeckStats, tournaments }: DeckCatalogProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("share");
  const minimumMetaSharePreference = useMinimumMetaSharePreference();
  const { minimumMetaShare } = minimumMetaSharePreference;
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
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return meta.decks
      .filter((deck) => !normalized || deck.name.toLocaleLowerCase("pt-BR").includes(normalized))
      .filter((deck) => deck.metaShare * 100 >= minimumMetaShare)
      .toSorted((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "pt-BR");
        if (sort === "result") return b.nonMirrorWinRate - a.nonMirrorWinRate;
        if (sort === "top8") return b.top8Rate - a.top8Rate;
        return b.metaShare - a.metaShare;
      });
  }, [meta.decks, minimumMetaShare, query, sort]);

  function clearFilters() {
    setQuery("");
    minimumMetaSharePreference.reset();
    minimumPlayersPreference.reset();
  }

  return (
    <>
      <div className="filter-strip meta-filter-strip">
        <span className="filter-chip"><span className="status-dot" /><strong>{manifest.scope.formatName}</strong></span>
        <span className="filter-chip">Era <strong>{manifest.scope.eraName}</strong></span>
        <span className="filter-chip">Online</span>
        <MinimumPlayersFilter id="decks-minimum-players" maximumPlayers={maximumPlayers} preference={minimumPlayersPreference} />
        <span className="filter-spacer" />
        <span className="update-note">{minimumPlayers > manifest.scope.minimumPlayers ? "Cálculo atualizado pelo filtro" : `Snapshot ${manifest.snapshotId}`}</span>
      </div>
      <div className="search-toolbar">
        <div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar Dragapult, Greninja, Festival Lead..." aria-label="Buscar deck" /></div>
        <MinimumMetaShareFilter preference={minimumMetaSharePreference} />
        <div className="sort-field"><SlidersHorizontal size={16} /><select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Ordenar decks">
          <option value="share">Maior presença</option><option value="result">Melhor resultado</option><option value="top8">Conversão em Top 8</option><option value="name">Nome A–Z</option>
        </select></div>
        <span className="result-count">{filtered.length} decks</span>
      </div>
      {filtered.length ? <div className="deck-grid catalog-grid">{filtered.map((deck) => <DeckCard key={deck.id} deck={deck} />)}</div> : (
        <div className="data-panel empty-state"><div><div className="empty-icon"><Search size={22} /></div><h3>Nenhum deck encontrado</h3><p>Tente outro nome ou remova os filtros.</p><button className="button-secondary" onClick={clearFilters}>Limpar filtros</button></div></div>
      )}
    </>
  );
}
