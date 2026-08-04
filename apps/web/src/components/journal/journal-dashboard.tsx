"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, BookOpen, CalendarPlus, Check, ChevronRight, Copy, Download, Plus, Save, Shield, Swords, Trash2, Trophy, X } from "lucide-react";
import { JournalCloudPanel } from "@/components/journal/journal-cloud-panel";
import { PersonalStats } from "@/components/journal/personal-stats";
import { usePreferences } from "@/components/layout/preferences-provider";
import { PokemonArtwork } from "@/components/ui/pokemon-artwork";
import { TiePolicySelect } from "@/components/ui/tie-policy-select";
import { addJournalTombstone, createId, createRound, readJournal, writeJournal } from "@/lib/journal-storage";
import { parsePtcglDecklist } from "@/lib/ptcgl-parser";
import { percent, resultRate } from "@/lib/stats";
import type { Deck, JournalEvent, JournalResult, JournalRound, MatchRecord, TurnOrder } from "@/types/domain";

const EXAMPLE_DECKLIST = `Pokémon: 16
4 Dreepy TWM 128
4 Drakloak TWM 129
3 Dragapult ex TWM 130
2 Duskull PRE 35
1 Dusclops PRE 36
1 Dusknoir PRE 37
1 Budew PRE 4

Trainer: 35
4 Iono PAL 185
4 Arven OBF 186
4 Buddy-Buddy Poffin TEF 144
4 Ultra Ball SVI 196
3 Rare Candy SVI 191
3 Counter Catcher PAR 160
2 Night Stretcher SFA 61
2 Earthen Vessel PAR 163
2 Technical Machine Evolution PAR 178
2 Boss's Orders PAL 172
2 Professor's Research SVI 189
1 Rescue Board TEF 159
1 Unfair Stamp TWM 165
1 Jamming Tower TWM 153

Energy: 9
6 Basic Psychic Energy SVE 5
3 Basic Fire Energy SVE 2

Total Cards: 60`;

type Screen = "dashboard" | "new" | "event";

function eventRecord(event: JournalEvent): MatchRecord {
  return {
    wins: event.rounds.filter((round) => round.result === "win").length,
    losses: event.rounds.filter((round) => round.result === "loss").length,
    ties: event.rounds.filter((round) => round.result === "tie").length,
  };
}

export function JournalDashboard({ decks, scope }: { decks: Deck[]; scope: { formatId: string; formatName: string; eraId: string; eraName: string } }) {
  const { tiePolicy } = usePreferences();
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [selectedId, setSelectedId] = useState("");
  const [ready, setReady] = useState(false);
  const deckMap = useMemo(() => Object.fromEntries(decks.map((deck) => [deck.id, deck])), [decks]);
  const deckNames = useMemo(() => Object.fromEntries(decks.map((deck) => [deck.id, deck.name])), [decks]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { setEvents(readJournal()); setReady(true); });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  function persist(next: JournalEvent[]) { setEvents(next); writeJournal(next); }
  const selected = events.find((event) => event.id === selectedId);

  const totalRecord = events.reduce<MatchRecord>((record, event) => {
    const current = eventRecord(event); return { wins: record.wins + current.wins, losses: record.losses + current.losses, ties: record.ties + current.ties };
  }, { wins: 0, losses: 0, ties: 0 });
  const roundsPlayed = totalRecord.wins + totalRecord.losses + totalRecord.ties;
  const byDeck = events.reduce<Record<string, MatchRecord>>((result, event) => {
    const current = result[event.ownDeckId] || { wins: 0, losses: 0, ties: 0 }; const record = eventRecord(event);
    result[event.ownDeckId] = { wins: current.wins + record.wins, losses: current.losses + record.losses, ties: current.ties + record.ties }; return result;
  }, {});
  const bestDeckId = Object.entries(byDeck).filter(([, record]) => record.wins + record.losses + record.ties >= 3).toSorted((a, b) => (resultRate(b[1], tiePolicy) || 0) - (resultRate(a[1], tiePolicy) || 0))[0]?.[0];

  function openEvent(id: string) { setSelectedId(id); setScreen("event"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function updateEvent(updated: JournalEvent) { persist(events.map((event) => event.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : event)); }
  function deleteEvent(id: string) { if (!window.confirm("Excluir este torneio e todas as suas rodadas? A exclusão será aplicada na nuvem na próxima sincronização.")) return; addJournalTombstone(id); persist(events.filter((event) => event.id !== id)); setScreen("dashboard"); setSelectedId(""); }

  if (screen === "new") return <NewEventForm decks={decks} scope={scope} onCancel={() => setScreen("dashboard")} onSave={(event) => { persist([event, ...events]); setSelectedId(event.id); setScreen("event"); }} />;
  if (screen === "event" && selected) return <EventDetail event={selected} decks={decks} deckMap={deckMap} onBack={() => setScreen("dashboard")} onChange={updateEvent} onDelete={() => deleteEvent(selected.id)} />;

  return (
    <>
      <section className="journal-hero-panel">
        <div><span className="section-kicker">Seu laboratório privado</span><h2>Transforme cada rodada em aprendizado.</h2><p>Cadastre torneios e matchups manualmente. Seus dados ficam somente neste dispositivo até você decidir ativar a sincronização.</p><button className="button" onClick={() => setScreen("new")}><CalendarPlus size={17} /> Registrar torneio</button></div>
        <div className="privacy-badge"><Shield size={25} /><strong>Local-first</strong><span>privado por padrão</span></div>
      </section>
      <section className="journal-metric-grid">
        <article><span><BookOpen size={16} /> Torneios</span><strong>{events.length}</strong><small>registrados manualmente</small></article>
        <article><span><Swords size={16} /> Partidas</span><strong>{roundsPlayed}</strong><small>{totalRecord.wins}-{totalRecord.losses}-{totalRecord.ties} no total</small></article>
        <article><span><BarChart3 size={16} /> Result rate</span><strong>{percent(resultRate(totalRecord, tiePolicy))}</strong><small>pela regra de empates atual</small></article>
        <article><span><Trophy size={16} /> Melhor deck</span><strong className="metric-deck-name">{bestDeckId ? deckMap[bestDeckId]?.name || "Customizado" : "—"}</strong><small>{bestDeckId ? percent(resultRate(byDeck[bestDeckId], tiePolicy)) : "mínimo de 3 partidas"}</small></article>
      </section>
      <PersonalStats events={events} decks={decks} tiePolicy={tiePolicy} />
      <section className="journal-toolbar"><div><h2>Histórico</h2><p>Listas são salvas como snapshots e não mudam retroativamente.</p></div><div><TiePolicySelect compact /><button className="button-secondary" onClick={() => exportJournal(events)} disabled={!events.length}><Download size={15} /> Exportar</button></div></section>
      {!ready ? <div className="data-panel empty-state"><div><p>Carregando diário local…</p></div></div> : events.length ? (
        <div className="event-list">{events.map((event) => {
          const deck = deckMap[event.ownDeckId]; const record = eventRecord(event);
          return <button key={event.id} className="event-row" onClick={() => openEvent(event.id)}><PokemonArtwork deckId={event.ownDeckId} name={deck?.name || event.ownDeckLabel || "Deck"} size="mini" /><span className="event-name"><strong>{event.name}</strong><small>{new Date(event.playedAt).toLocaleDateString("pt-BR")} · {deck?.name || event.ownDeckLabel} · {event.mode.toUpperCase()}</small></span><span className="event-record"><strong>{record.wins}-{record.losses}-{record.ties}</strong><small>{percent(resultRate(record, tiePolicy))}</small></span><ChevronRight size={17} /></button>;
        })}</div>
      ) : <div className="data-panel empty-state"><div><div className="empty-icon"><BookOpen size={23} /></div><h3>Seu diário começa aqui</h3><p>Registre o primeiro torneio, cole a lista exportada pelo TCG Live e adicione cada rodada em poucos segundos.</p><button className="button" onClick={() => setScreen("new")}><Plus size={16} /> Primeiro torneio</button></div></div>}
      <JournalCloudPanel events={events} deckNames={deckNames} tiePolicy={tiePolicy} onSynced={persist} />
    </>
  );
}

function NewEventForm({ decks, scope, onCancel, onSave }: { decks: Deck[]; scope: { formatId: string; eraId: string }; onCancel: () => void; onSave: (event: JournalEvent) => void }) {
  const [name, setName] = useState(""); const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 10)); const [mode, setMode] = useState<"bo1" | "bo3">("bo1"); const [ownDeckId, setOwnDeckId] = useState(decks[0]?.id || ""); const [decklistText, setDecklistText] = useState("");
  const parsed = useMemo(() => parsePtcglDecklist(decklistText), [decklistText]);
  const valid = name.trim().length >= 2 && ownDeckId && parsed.total === 60 && parsed.errors.length === 0;
  function submit(event: React.FormEvent) { event.preventDefault(); if (!valid) return; const now = new Date().toISOString(); onSave({ id: createId("event"), name: name.trim(), playedAt, formatId: scope.formatId, eraId: scope.eraId, mode, ownDeckId, decklistText: decklistText.trim(), rounds: [], createdAt: now, updatedAt: now }); }
  return <section className="journal-form-page"><div className="form-page-head"><button className="button-ghost" onClick={onCancel}><ArrowLeft size={16} /> Voltar</button><div><span className="section-kicker">Battle Journal / novo</span><h2>Registrar torneio</h2><p>Informações básicas e um snapshot da lista usada.</p></div></div><form onSubmit={submit} className="journal-event-form"><div className="journal-form-card"><h3>01 // Evento</h3><div className="form-grid"><div className="field field-wide"><label htmlFor="event-name">Nome do torneio</label><input id="event-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Liga online de segunda" required /></div><div className="field"><label htmlFor="event-date">Data</label><input id="event-date" type="date" value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} required /></div><div className="field"><label htmlFor="event-mode">Estrutura</label><select id="event-mode" value={mode} onChange={(event) => setMode(event.target.value as "bo1" | "bo3")}><option value="bo1">MD1 / BO1</option><option value="bo3">MD3 / BO3</option></select></div><div className="field field-wide"><label htmlFor="own-deck">Deck utilizado</label><select id="own-deck" value={ownDeckId} onChange={(event) => setOwnDeckId(event.target.value)}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></div></div></div><div className="journal-form-card"><div className="form-card-title"><div><h3>02 // Lista do TCG Live</h3><p>Cole exatamente o texto exportado pelo jogo.</p></div><button type="button" className="button-ghost" onClick={() => setDecklistText(EXAMPLE_DECKLIST)}><Copy size={15} /> Usar exemplo</button></div><textarea value={decklistText} onChange={(event) => setDecklistText(event.target.value)} placeholder="Pokémon: 18&#10;4 Nome da carta SET 123&#10;&#10;Trainer: 34..." rows={18} aria-label="Lista exportada do Pokémon TCG Live" /><div className={`parse-status ${parsed.total === 60 && !parsed.errors.length ? "valid" : decklistText ? "invalid" : ""}`}><span>{parsed.total === 60 && !parsed.errors.length ? <Check size={16} /> : <X size={16} />}</span><div><strong>{parsed.total} / 60 cartas</strong><small>{parsed.errors[0]?.message || (parsed.total === 60 ? "Lista pronta para salvar" : "Aguardando lista completa")}</small></div></div>{parsed.errors.filter((error) => error.line > 0).slice(0, 4).map((error) => <p key={`${error.line}-${error.raw}`} className="parse-error">Linha {error.line}: {error.message} — <code>{error.raw}</code></p>)}</div><div className="form-actions"><button type="button" className="button-ghost" onClick={onCancel}>Cancelar</button><button className="button" disabled={!valid}><Save size={16} /> Salvar e adicionar rodadas</button></div></form></section>;
}

function EventDetail({ event, decks, deckMap, onBack, onChange, onDelete }: { event: JournalEvent; decks: Deck[]; deckMap: Record<string, Deck>; onBack: () => void; onChange: (event: JournalEvent) => void; onDelete: () => void }) {
  const { tiePolicy } = usePreferences(); const [round, setRound] = useState<JournalRound>(() => createRound(event.rounds.length + 1)); const ownDeck = deckMap[event.ownDeckId]; const record = eventRecord(event);
  function addRound(submitEvent: React.FormEvent) { submitEvent.preventDefault(); if (!round.opponentDeckId) return; onChange({ ...event, rounds: [...event.rounds, round] }); setRound(createRound(event.rounds.length + 2)); }
  function removeRound(id: string) { if (!window.confirm("Excluir esta rodada?")) return; onChange({ ...event, rounds: event.rounds.filter((item) => item.id !== id).map((item, index) => ({ ...item, roundNumber: index + 1 })) }); }
  return <section className="journal-detail"><div className="detail-back-row"><button className="button-ghost" onClick={onBack}><ArrowLeft size={16} /> Histórico</button><button className="button-ghost danger-button" onClick={onDelete}><Trash2 size={15} /> Excluir torneio</button></div><div className="journal-event-hero"><PokemonArtwork deckId={event.ownDeckId} name={ownDeck?.name || "Deck"} size="card" /><div><span className="section-kicker">{event.mode.toUpperCase()} · {event.formatId.toUpperCase()} ONLINE</span><h2>{event.name}</h2><p>{new Date(event.playedAt).toLocaleDateString("pt-BR", { dateStyle: "long" })} · {ownDeck?.name}</p><div className="event-hero-stats"><span><strong>{record.wins}-{record.losses}-{record.ties}</strong> recorde</span><span><strong>{percent(resultRate(record, tiePolicy))}</strong> result rate</span><span><strong>{event.rounds.length}</strong> rodadas</span></div></div></div><div className="journal-detail-grid"><section><div className="section-header"><div><span className="section-kicker">Entrada rápida</span><h2>Próxima rodada</h2><p>Salve o essencial agora; notas continuam opcionais.</p></div></div><form className="round-form" onSubmit={addRound}><div className="round-number">R{String(round.roundNumber).padStart(2, "0")}</div><div className="field"><label htmlFor="opponent-deck">Deck adversário</label><select id="opponent-deck" value={round.opponentDeckId} onChange={(e) => setRound({ ...round, opponentDeckId: e.target.value })} required><option value="">Selecionar arquétipo…</option>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></div><SegmentedResult value={round.result} onChange={(result) => setRound({ ...round, result })} /><div className="field"><label htmlFor="turn-order">Ordem de jogo</label><select id="turn-order" value={round.turnOrder} onChange={(e) => setRound({ ...round, turnOrder: e.target.value as TurnOrder })}><option value="unknown">Não informado</option><option value="first">Comecei</option><option value="second">Oponente começou</option></select></div><div className="score-grid"><div className="field"><label htmlFor="game-wins">Games vencidos</label><input id="game-wins" type="number" min="0" max="3" value={round.gameWins ?? ""} onChange={(e) => setRound({ ...round, gameWins: e.target.value ? Number(e.target.value) : undefined })} /></div><div className="field"><label htmlFor="game-losses">Games perdidos</label><input id="game-losses" type="number" min="0" max="3" value={round.gameLosses ?? ""} onChange={(e) => setRound({ ...round, gameLosses: e.target.value ? Number(e.target.value) : undefined })} /></div></div><div className="field"><label htmlFor="round-notes">Notas opcionais</label><textarea id="round-notes" value={round.notes || ""} onChange={(e) => setRound({ ...round, notes: e.target.value })} placeholder="Techs, decisões importantes, motivo da derrota..." rows={3} /></div><button className="button" disabled={!round.opponentDeckId}><Plus size={16} /> Salvar e próxima rodada</button></form></section><aside><div className="section-header"><div><span className="section-kicker">Match log</span><h2>Rodadas</h2></div></div>{event.rounds.length ? <div className="round-list">{event.rounds.map((item) => <article key={item.id}><span className={`round-result result-${item.result}`}>{item.result === "win" ? "W" : item.result === "loss" ? "L" : "T"}</span><span><strong>R{item.roundNumber} · {deckMap[item.opponentDeckId]?.name || item.opponentLabel}</strong><small>{item.turnOrder === "first" ? "começou" : item.turnOrder === "second" ? "foi segundo" : "ordem não informada"}{item.gameWins !== undefined ? ` · ${item.gameWins}-${item.gameLosses || 0}` : ""}</small></span><button onClick={() => removeRound(item.id)} aria-label={`Excluir rodada ${item.roundNumber}`}><Trash2 size={14} /></button></article>)}</div> : <div className="data-panel empty-state small-empty"><div><p>Nenhuma rodada registrada.</p></div></div>}</aside></div></section>;
}

function SegmentedResult({ value, onChange }: { value: JournalResult; onChange: (value: JournalResult) => void }) { return <fieldset className="segmented-field"><legend>Resultado</legend><div>{([{ value: "win", label: "Vitória" }, { value: "loss", label: "Derrota" }, { value: "tie", label: "Empate" }] as const).map((option) => <label key={option.value} className={value === option.value ? `active result-${option.value}` : ""}><input type="radio" name="result" value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />{option.label}</label>)}</div></fieldset>; }

function exportJournal(events: JournalEvent[]) { const blob = new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), events }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `limitless-journal-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); }
