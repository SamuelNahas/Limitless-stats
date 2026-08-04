"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Link2, LockKeyhole, ShieldCheck, Swords, Trophy } from "lucide-react";
import { PokemonArtwork } from "@/components/ui/pokemon-artwork";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { percent, rateBand, resultRate } from "@/lib/stats";
import type { MatchRecord, TiePolicy } from "@/types/domain";

type SharedStat = MatchRecord & { id: string; name: string };
type SharedProfile = MatchRecord & {
  displayName: string;
  tiePolicy: TiePolicy;
  events: number;
  decks: SharedStat[];
  matchups: SharedStat[];
};

const POLICIES = new Set<TiePolicy>(["ignore", "loss", "half", "third", "win"]);

function parseProfile(value: unknown): SharedProfile | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const tiePolicy = POLICIES.has(row.tiePolicy as TiePolicy) ? row.tiePolicy as TiePolicy : "half";
  const stats = (input: unknown): SharedStat[] => Array.isArray(input) ? input.filter((item) => item && typeof item === "object").map((item) => {
    const stat = item as Record<string, unknown>;
    return { id: String(stat.id || "custom"), name: String(stat.name || "Deck customizado"), wins: Number(stat.wins || 0), losses: Number(stat.losses || 0), ties: Number(stat.ties || 0) };
  }) : [];
  return {
    displayName: String(row.displayName || "Treinador"),
    tiePolicy,
    events: Number(row.events || 0),
    wins: Number(row.wins || 0),
    losses: Number(row.losses || 0),
    ties: Number(row.ties || 0),
    decks: stats(row.decks),
    matchups: stats(row.matchups),
  };
}

export function SharedProfileViewer() {
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "config">(() => isSupabaseConfigured() ? "loading" : "config");

  useEffect(() => {
    const client = createClient();
    if (!client) return;
    const id = new URLSearchParams(window.location.search).get("id");
    const secret = new URLSearchParams(window.location.hash.slice(1)).get("secret");
    if (!id || !secret) {
      const frame = window.requestAnimationFrame(() => setState("invalid"));
      return () => window.cancelAnimationFrame(frame);
    }
    void client.rpc("read_shared_profile", { p_link_id: id, p_secret: secret }).then(({ data, error }) => {
      const parsed = !error ? parseProfile(data) : null;
      if (!parsed) { setState("invalid"); return; }
      setProfile(parsed);
      setState("ready");
    });
  }, []);

  const bestDeck = useMemo(() => profile?.decks.toSorted((a, b) => (resultRate(b, profile.tiePolicy) ?? 0) - (resultRate(a, profile.tiePolicy) ?? 0))[0], [profile]);

  if (state !== "ready" || !profile) return (
    <section className="shared-profile-state">
      <div className="auth-icon">{state === "loading" ? <Link2 size={27} /> : <LockKeyhole size={27} />}</div>
      <span className="section-kicker">Perfil compartilhado</span>
      <h1>{state === "loading" ? "Validando link privado…" : state === "config" ? "Supabase ainda não configurado" : "Este link não está disponível"}</h1>
      <p>{state === "loading" ? "A chave fica no fragmento da URL e não é enviada ao GitHub Pages." : state === "config" ? "Configure as variáveis públicas do Supabase para habilitar os perfis compartilháveis." : "Ele pode ter expirado, sido revogado ou estar incompleto."}</p>
    </section>
  );

  const record: MatchRecord = { wins: profile.wins, losses: profile.losses, ties: profile.ties };
  const matches = profile.wins + profile.losses + profile.ties;
  return (
    <div className="shared-profile-page">
      <header className="shared-profile-hero">
        <div><span className="section-kicker">Perfil competitivo privado</span><h1>{profile.displayName}</h1><p>Resumo manual do Battle Journal · Standard Online</p></div>
        <span className="private-link-badge"><ShieldCheck size={17} /> Acesso somente por link</span>
      </header>
      <section className="journal-metric-grid">
        <article><span><Trophy size={16} /> Torneios</span><strong>{profile.events}</strong><small>registrados manualmente</small></article>
        <article><span><Swords size={16} /> Partidas</span><strong>{matches}</strong><small>{profile.wins}-{profile.losses}-{profile.ties} no total</small></article>
        <article><span><BarChart3 size={16} /> Result rate</span><strong>{percent(resultRate(record, profile.tiePolicy))}</strong><small>regra de empate: {profile.tiePolicy}</small></article>
        <article><span><Trophy size={16} /> Melhor deck</span><strong className="metric-deck-name">{bestDeck?.name || "—"}</strong><small>{bestDeck ? percent(resultRate(bestDeck, profile.tiePolicy)) : "sem partidas"}</small></article>
      </section>
      <div className="personal-stats-grid">
        <SharedStats title="Desempenho por deck" stats={profile.decks} tiePolicy={profile.tiePolicy} />
        <SharedStats title="Winrate contra decks" stats={profile.matchups} tiePolicy={profile.tiePolicy} />
      </div>
      <p className="shared-privacy-note"><LockKeyhole size={15} /> Este resumo nunca inclui e-mail, notas de rodada, nomes de oponentes ou o texto das listas.</p>
    </div>
  );
}

function SharedStats({ title, stats, tiePolicy }: { title: string; stats: SharedStat[]; tiePolicy: TiePolicy }) {
  return <section className="personal-stat-panel"><header><span><BarChart3 size={16} /></span><div><h3>{title}</h3><small>dados agregados</small></div></header>{stats.length ? <div className="personal-stat-list">{stats.map((stat) => { const rate = resultRate(stat, tiePolicy); const total = stat.wins + stat.losses + stat.ties; return <div className="personal-stat-row" key={stat.id}><PokemonArtwork deckId={stat.id} name={stat.name} size="mini" /><span><strong>{stat.name}</strong><small>{stat.wins}–{stat.losses}–{stat.ties} · {total} partidas</small></span><strong className={`rate-${rateBand(rate)}`}>{percent(rate)}</strong></div>; })}</div> : <p className="personal-stat-empty">Nenhuma partida compartilhada.</p>}</section>;
}
