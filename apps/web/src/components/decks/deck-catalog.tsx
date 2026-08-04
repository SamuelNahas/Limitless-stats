"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { DeckCard } from "./deck-card";
import type { Deck } from "@/types/domain";

type SortKey = "share" | "result" | "top8" | "name";

export function DeckCatalog({ decks }: { decks: Deck[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("share");
  const [minimumMetaShare, setMinimumMetaShare] = useState(0);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return decks
      .filter((deck) => !normalized || deck.name.toLocaleLowerCase("pt-BR").includes(normalized))
      .filter((deck) => deck.metaShare * 100 >= minimumMetaShare)
      .toSorted((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "pt-BR");
        if (sort === "result") return b.nonMirrorWinRate - a.nonMirrorWinRate;
        if (sort === "top8") return b.top8Rate - a.top8Rate;
        return b.metaShare - a.metaShare;
      });
  }, [decks, minimumMetaShare, query, sort]);

  function clearFilters() {
    setQuery("");
    setMinimumMetaShare(0);
  }

  return (
    <>
      <div className="search-toolbar">
        <div className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar Dragapult, Greninja, Festival Lead..." aria-label="Buscar deck" /></div>
        <label className="minimum-share-field" htmlFor="minimum-meta-share">
          <span>Meta share mín.</span>
          <input id="minimum-meta-share" type="number" min="0" max="100" step="0.1" value={minimumMetaShare} onChange={(event) => setMinimumMetaShare(Math.max(0, Number(event.target.value) || 0))} />
          <span>%</span>
        </label>
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
