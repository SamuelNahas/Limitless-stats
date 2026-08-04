import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Layers3, ShieldCheck, Trophy } from "lucide-react";
import { CopyDecklistButton } from "@/components/decks/copy-decklist-button";
import { DeckMatchups } from "@/components/decks/deck-matchups";
import { DeckResultRateCard } from "@/components/decks/deck-result-rate-card";
import { PokemonArtwork } from "@/components/ui/pokemon-artwork";
import { StatCard } from "@/components/ui/stat-card";
import { canonicalDecklists, decks, getDeck, getDeckMatchups, manifest, publishedLists } from "@/data/snapshot";
import { percent } from "@/lib/stats";
import type { DeckCard } from "@/types/domain";

export function generateStaticParams() { return decks.map((deck) => ({ id: deck.id })); }

export async function generateMetadata({ params }: PageProps<"/decks/[id]">): Promise<Metadata> {
  const { id } = await params;
  const deck = getDeck(id);
  return deck ? { title: deck.name, description: `Estatísticas, lista e matchups de ${deck.name} no Standard Online.` } : { title: "Deck não encontrado" };
}

export default async function DeckDetailPage({ params }: PageProps<"/decks/[id]">) {
  const { id } = await params;
  const deck = getDeck(id);
  if (!deck) notFound();
  const matchups = getDeckMatchups(id);
  const deckMap = Object.fromEntries(decks.map((item) => [item.id, item]));
  const canonical = canonicalDecklists[id];
  const lists = publishedLists[id] || [];
  const categories: Array<{ id: DeckCard["category"]; label: string }> = [{ id: "pokemon", label: "Pokémon" }, { id: "trainer", label: "Treinadores" }, { id: "energy", label: "Energias" }];
  return (
    <div className="content-container deck-detail-page">
      <div className="detail-back-row"><Link href="/decks" className="button-ghost"><ArrowLeft size={16} /> Todos os decks</Link><span>{manifest.scope.formatName} / {manifest.scope.eraName}</span></div>
      <section className="deck-hero">
        <div className="deck-hero-copy">
          <span className="eyebrow">Archetype dossier / {String(decks.findIndex((item) => item.id === id) + 1).padStart(2, "0")}</span>
          <h1>{deck.name}</h1>
          <p>{deck.entries.toLocaleString("pt-BR")} entradas em {deck.tournaments} torneios. Este perfil combina resultados agregados, lista representativa e confrontos observados.</p>
          <div className="hero-record"><strong>{deck.record.wins}-{deck.record.losses}-{deck.record.ties}</strong><span>recorde agregado</span></div>
          <div className="hero-actions">{canonical && <CopyDecklistButton cards={canonical.cards} />}{canonical?.url && <a className="button" href={canonical.url} target="_blank" rel="noreferrer">Abrir no Limitless <ExternalLink size={15} /></a>}</div>
        </div>
        <PokemonArtwork deckId={deck.id} name={deck.name} size="hero" priority />
      </section>
      <section className="stats-grid detail-stats">
        <StatCard label="Meta share" value={percent(deck.metaShare)} detail={`${deck.entries} entradas`} icon={Layers3} />
        <DeckResultRateCard record={deck.record} />
        <StatCard label="Top 8" value={deck.top8.toLocaleString("pt-BR")} detail={`${percent(deck.top8Rate)} das entradas`} icon={ShieldCheck} tone="green" />
        <StatCard label="Títulos" value={deck.titles.toLocaleString("pt-BR")} detail={`${deck.tournaments} eventos distintos`} icon={Trophy} tone="orange" />
      </section>
      <div className="detail-columns">
        <section className="section detail-main-column">
          <div className="section-header"><div><span className="section-kicker">Lista observada</span><h2>Construção representativa</h2><p>{canonical ? `Pilotada por ${canonical.player} (${canonical.record}).` : "Nenhuma lista completa disponível."}</p></div></div>
          {canonical ? <div className="decklist-panel">{categories.map((category) => {
            const cards = canonical.cards.filter((card) => card.category === category.id);
            const total = cards.reduce((sum, card) => sum + card.count, 0);
            return <div key={category.id} className="decklist-category"><h3>{category.label}<span>{total}</span></h3><ul>{cards.map((card) => <li key={card.id}><span className="card-count">{card.count}</span><span>{card.name}</span></li>)}</ul></div>;
          })}</div> : <div className="data-panel empty-state"><div><h3>Lista indisponível</h3><p>O arquétipo possui resultados, mas nenhuma lista completa publicada.</p></div></div>}
        </section>
        <aside className="section detail-side-column">
          <div className="section-header"><div><span className="section-kicker">Head to head</span><h2>Melhores e piores</h2></div><Link href={`/matchups?deck=${deck.id}`} className="section-link">Matriz</Link></div>
          <DeckMatchups matchups={matchups} deckMap={deckMap} />
          <div className="section-header list-results-header"><div><span className="section-kicker">Resultados publicados</span><h2>Melhores listas</h2></div></div>
          <div className="published-list">{lists.slice(0, 5).map((list) => <a key={`${list.url}-${list.rank}`} href={list.url} target="_blank" rel="noreferrer"><span className="placing">#{list.placing}</span><span><strong>{list.player}</strong><small>{list.record} · {list.tournamentPlayers} jogadores</small></span><ExternalLink size={14} /></a>)}</div>
        </aside>
      </div>
    </div>
  );
}
