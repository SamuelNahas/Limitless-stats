"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import type { User } from "@supabase/supabase-js";
import { AlertCircle, CheckCircle2, Cloud, Link2, LogIn, RefreshCw, Share2, Trash2 } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { createPrivateShareLink, listPrivateShareLinks, revokePrivateShareLink, syncJournal, type ProfileShareLink } from "@/lib/supabase/journal-sync";
import type { JournalEvent, TiePolicy } from "@/types/domain";

type BusyAction = "sync" | "share" | "revoke" | null;

export function JournalCloudPanel({ events, deckNames, tiePolicy, onSynced }: { events: JournalEvent[]; deckNames: Record<string, string>; tiePolicy: TiePolicy; onSynced: (events: JournalEvent[]) => void }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [links, setLinks] = useState<ProfileShareLink[]>([]);

  useEffect(() => {
    const client = createClient();
    if (!client) return;
    void client.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = client.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    void listPrivateShareLinks().then(setLinks).catch(() => setLinks([]));
  }, [user]);

  function clearFeedback() { setError(""); setMessage(""); }

  async function synchronize(): Promise<JournalEvent[] | null> {
    clearFeedback();
    setBusy("sync");
    try {
      const result = await syncJournal(events, deckNames, tiePolicy);
      onSynced(result.events);
      setMessage(`Sincronizado às ${new Date(result.syncedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`);
      return result.events;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível sincronizar agora.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function createShare() {
    clearFeedback();
    setBusy("share");
    try {
      const synced = await syncJournal(events, deckNames, tiePolicy);
      onSynced(synced.events);
      const link = await createPrivateShareLink();
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const url = `${window.location.origin}${basePath}/shared/?id=${encodeURIComponent(link.id)}#secret=${encodeURIComponent(link.secret)}`;
      setShareUrl(url);
      try { await navigator.clipboard.writeText(url); } catch { /* O campo abaixo permite copiar manualmente. */ }
      setLinks(await listPrivateShareLinks());
      setMessage("Link privado criado e copiado. Só quem tiver a URL completa poderá abrir os agregados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o link.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    clearFeedback();
    setBusy("revoke");
    try {
      await revokePrivateShareLink(id);
      setLinks((current) => current.map((link) => link.id === id ? { ...link, revokedAt: new Date().toISOString() } : link));
      setShareUrl("");
      setMessage("Link revogado. Ele não pode mais consultar o perfil.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível revogar o link.");
    } finally {
      setBusy(null);
    }
  }

  if (!configured) return (
    <section className="sync-callout">
      <Cloud size={25} />
      <div><strong>Journal local ativo</strong><p>Para sincronizar gratuitamente, configure o projeto Supabase e o acesso por e-mail seguindo o README.</p></div>
      <NextLink href="/login" className="button-secondary">Configurar login <LogIn size={15} /></NextLink>
    </section>
  );

  if (!user) return (
    <section className="sync-callout">
      <Cloud size={25} />
      <div><strong>Sincronização opcional</strong><p>Seus dados continuam locais e privados. Entre por e-mail apenas se quiser usá-los em outros dispositivos.</p></div>
      <NextLink href="/login" className="button-secondary">Entrar com e-mail <LogIn size={15} /></NextLink>
    </section>
  );

  const activeLinks = links.filter((link) => !link.revokedAt);
  return (
    <section className="journal-cloud-card" aria-labelledby="cloud-title">
      <div className="journal-cloud-head">
        <span className="cloud-user-icon"><Cloud size={21} /></span>
        <div><span className="section-kicker">Nuvem privada</span><h2 id="cloud-title">Conectado como {user.user_metadata.full_name || user.email}</h2><p>A sincronização une a versão mais recente de cada torneio. Exclusões pendentes também são aplicadas.</p></div>
        <div className="journal-cloud-actions">
          <button className="button-secondary" onClick={() => void synchronize()} disabled={Boolean(busy)}><RefreshCw className={busy === "sync" ? "spin" : ""} size={15} /> {busy === "sync" ? "Sincronizando…" : "Sincronizar"}</button>
          <button className="button" onClick={() => void createShare()} disabled={Boolean(busy)}><Share2 size={15} /> {busy === "share" ? "Criando…" : "Compartilhar agregados"}</button>
        </div>
      </div>
      {message ? <p className="cloud-feedback success"><CheckCircle2 size={15} /> {message}</p> : null}
      {error ? <p className="cloud-feedback error"><AlertCircle size={15} /> {error}</p> : null}
      {shareUrl ? <div className="share-url-box"><Link2 size={16} /><input aria-label="Link privado do perfil" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} /><button className="button-ghost" onClick={() => void navigator.clipboard.writeText(shareUrl)}>Copiar</button></div> : null}
      {activeLinks.length ? <div className="share-link-list"><div><strong>Links ativos</strong><small>{activeLinks.length} de 10</small></div>{activeLinks.map((link) => <div key={link.id}><span><Link2 size={14} /><span>{link.label || "Perfil competitivo"}<small>criado em {new Date(link.createdAt).toLocaleDateString("pt-BR")}</small></span></span><button className="button-ghost danger-button" disabled={Boolean(busy)} onClick={() => void revoke(link.id)}><Trash2 size={14} /> Revogar</button></div>)}</div> : null}
    </section>
  );
}
