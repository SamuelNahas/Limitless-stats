"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Grid3X3, ListFilter, LoaderCircle, Search, Swords } from "lucide-react";
import { usePreferences } from "@/components/layout/preferences-provider";
import { PokemonArtwork } from "@/components/ui/pokemon-artwork";
import { TiePolicySelect } from "@/components/ui/tie-policy-select";
import { confidenceLabel, percent, rateBand, resultRate } from "@/lib/stats";
import type { Deck, MatchMode, Matchup } from "@/types/domain";

type ViewMode = "explorer" | "matrix";

export function MatchupsExplorer({ decks, initialMatchups }: { decks: Deck[]; initialMatchups: Matchup[] }) {
  const { tiePolicy } = usePreferences();
  const [mode, setMode] = useState<MatchMode>("all");
  const [view, setView] = useState<ViewMode>("explorer");
  const [selectedDeckId, setSelectedDeckId] = useState(decks[0]?.id || "");
  const [opponentId, setOpponentId] = useState("");
  const [minimumGames, setMinimumGames] = useState(10);
  const [loadedMatchups, setLoadedMatchups] = useState<Matchup[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const deck = params.get("deck");
      const opponent = params.get("opponent");
      if (deck && decks.some((item) => item.id === deck)) setSelectedDeckId(deck);
      if (opponent && decks.some((item) => item.id === opponent)) setOpponentId(opponent);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [decks]);

  useEffect(() => {
    if (mode === "all") return;
    const controller = new AbortController();
    async function loadMode() {
      setLoading(true); setLoadError(false);
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/data/v1/matchups-${mode}.json`, { signal: controller.signal });
        if (!response.ok) throw new Error("snapshot unavailable");
        setLoadedMatchups(await response.json() as Matchup[]);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") setLoadError(true);
      } finally { setLoading(false); }
    }
    void loadMode();
    return () => controller.abort();
  }, [mode]);

  const matchups = mode === "all" ? initialMatchups : loadedMatchups;

  const deckMap = useMemo(() => Object.fromEntries(decks.map((deck) => [deck.id, deck])), [decks]);
  const selectedDeck = deckMap[selectedDeckId] || decks[0];
  const rows = useMemo(() => matchups
    .filter((item) => item.deckId === selectedDeckId && item.opponentId !== selectedDeckId)
    .map((item) => ({ ...item, games: item.wins + item.losses + item.ties, rate: resultRate(item, tiePolicy), opponent: deckMap[item.opponentId] }))
    .filter((item) => item.opponent && item.games >= minimumGames && (!opponentId || item.opponentId === opponentId))
    .toSorted((a, b) => (b.rate ?? 0) - (a.rate ?? 0)), [deckMap, matchups, minimumGames, opponentId, selectedDeckId, tiePolicy]);

  const direct = opponentId ? rows[0] : null;
  const topMatrixDecks = decks.slice(0, 15);
  const matchupIndex = useMemo(() => new Map(matchups.map((item) => [`${item.deckId}:${item.opponentId}`, item])), [matchups]);

  function selectDeck(value: string) {
    setSelectedDeckId(value); setOpponentId("");
    const url = new URL(window.location.href); url.searchParams.set("deck", value); url.searchParams.delete("opponent"); window.history.replaceState({}, "", url);
  }

  return (
    <>
      <section className="matchup-controls">
        <TiePolicySelect />
        <div className="field"><label htmlFor="match-mode">Tipo de partida</label><select id="match-mode" value={mode} onChange={(event) => setMode(event.target.value as MatchMode)}><option value="all">Geral · todas as fases</option><option value="bo1">MD1 / BO1</option><option value="bo3">MD3 / BO3</option></select><small className="field-hint">Os contadores brutos são preservados por modo.</small></div>
        <div className="field"><label htmlFor="minimum-games">Amostra mínima</label><select id="minimum-games" value={minimumGames} onChange={(event) => setMinimumGames(Number(event.target.value))}><option value={1}>1+ partida</option><option value={5}>5+ partidas</option><option value={10}>10+ partidas</option><option value={30}>30+ partidas</option><option value={50}>50+ partidas</option></select><small className="field-hint">Reduz o ruído de amostras pequenas.</small></div>
      </section>

      <div className="view-tabs" role="tablist" aria-label="Visualização de matchups">
        <button role="tab" aria-selected={view === "explorer"} className={view === "explorer" ? "active" : ""} onClick={() => setView("explorer")}><ListFilter size={16} /> Explorar um deck</button>
        <button role="tab" aria-selected={view === "matrix"} className={view === "matrix" ? "active" : ""} onClick={() => setView("matrix")}><Grid3X3 size={16} /> Matriz completa</button>
      </div>

      {loading && <div className="loading-bar"><LoaderCircle size={15} className="spin" /> Carregando recorte {mode.toUpperCase()}…</div>}
      {loadError && <div className="inline-alert"><AlertTriangle size={16} /> Não foi possível carregar este recorte. O snapshot geral continua disponível.</div>}

      {view === "explorer" ? (
        <div className="matchup-explorer-grid">
          <aside className="deck-selector-panel">
            <div className="field"><label htmlFor="own-deck">Deck analisado</label><select id="own-deck" value={selectedDeckId} onChange={(event) => selectDeck(event.target.value)}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></div>
            {selectedDeck && <><PokemonArtwork deckId={selectedDeck.id} name={selectedDeck.name} size="card" priority /><div className="selected-deck-summary"><span>DECK SELECIONADO</span><h2>{selectedDeck.name}</h2><div><strong>{percent(selectedDeck.metaShare)}</strong><small>meta share</small></div></div></>}
            <div className="field opponent-filter"><label htmlFor="opponent"><Search size={13} /> Comparar diretamente</label><select id="opponent" value={opponentId} onChange={(event) => setOpponentId(event.target.value)}><option value="">Todos os oponentes</option>{decks.filter((deck) => deck.id !== selectedDeckId).map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></div>
          </aside>

          <section className="matchup-results-panel">
            <div className="matchup-results-head"><div><span className="section-kicker">{mode === "all" ? "Todos os formatos" : mode.toUpperCase()}</span><h2>{direct ? `${selectedDeck.name} vs. ${direct.opponent.name}` : `Campo de ${selectedDeck.name}`}</h2><p>{rows.length} confrontos com ao menos {minimumGames} partida{minimumGames > 1 ? "s" : ""}.</p></div>{direct && <button className="button-ghost" onClick={() => setOpponentId("")}>Ver todos</button>}</div>
            {direct && <div className={`direct-comparison rate-${rateBand(direct.rate)}`}><div><span>RESULT RATE</span><strong>{percent(direct.rate)}</strong><small>{direct.wins} vitórias · {direct.losses} derrotas · {direct.ties} empates</small></div><Swords size={32} /><div><span>CONFIANÇA</span><strong>{confidenceLabel(direct.games)}</strong><small>{direct.games} partidas na amostra</small></div></div>}
            <div className="matchup-result-list">
              {rows.map((row, index) => (
                <button key={row.opponentId} className="matchup-result-row" onClick={() => setOpponentId(row.opponentId)}>
                  <span className="matchup-index">{String(index + 1).padStart(2, "0")}</span>
                  <PokemonArtwork deckId={row.opponent.id} name={row.opponent.name} size="mini" />
                  <span className="matchup-result-name"><strong>{row.opponent.name}</strong><small>{row.wins}-{row.losses}-{row.ties} · {row.games} jogos · confiança {confidenceLabel(row.games).toLocaleLowerCase("pt-BR")}</small></span>
                  <span className="matchup-rate-track"><span style={{ width: `${(row.rate ?? 0) * 100}%` }} /></span>
                  <span className={`rate-pill rate-${rateBand(row.rate)}`}>{percent(row.rate)}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
              {!rows.length && <div className="empty-state"><div><div className="empty-icon"><Swords size={21} /></div><h3>Amostra insuficiente</h3><p>Reduza a amostra mínima ou escolha outro recorte.</p></div></div>}
            </div>
          </section>
        </div>
      ) : (
        <section className="matrix-panel">
          <div className="matrix-help"><span><strong>Leitura:</strong> deck da linha contra deck da coluna.</span><span className="matrix-legend"><i className="legend-good" /> Favorável <i className="legend-even" /> Equilibrado <i className="legend-bad" /> Desfavorável</span></div>
          <div className="matrix-scroll"><table className="matchup-matrix"><thead><tr><th>Deck</th>{topMatrixDecks.map((deck) => <th key={deck.id} title={deck.name}>{deck.name.split(" ").slice(0, 2).join(" ")}</th>)}</tr></thead><tbody>{topMatrixDecks.map((deck) => <tr key={deck.id}><th><Link href={`/decks/${deck.id}`}>{deck.name}</Link></th>{topMatrixDecks.map((opponent) => {
            if (deck.id === opponent.id) return <td key={opponent.id} className="mirror-cell">—</td>;
            const record = matchupIndex.get(`${deck.id}:${opponent.id}`); const games = record ? record.wins + record.losses + record.ties : 0; const rate = record && games >= minimumGames ? resultRate(record, tiePolicy) : null;
            return <td key={opponent.id}><button className={`matrix-cell rate-${rateBand(rate)}`} disabled={rate === null} onClick={() => { setSelectedDeckId(deck.id); setOpponentId(opponent.id); setView("explorer"); }} title={record ? `${record.wins}-${record.losses}-${record.ties} em ${games} jogos` : "Sem dados"}><strong>{percent(rate, 0)}</strong><small>{games || "—"}</small></button></td>;
          })}</tr>)}</tbody></table></div>
        </section>
      )}
      <p className="method-note"><AlertTriangle size={13} /> Associação estatística observada, não garantia de resultado. Em cada célula, W/L/T são preservados e somente a fórmula de exibição muda.</p>
    </>
  );
}
