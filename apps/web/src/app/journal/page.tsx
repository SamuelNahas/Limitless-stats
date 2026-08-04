import type { Metadata } from "next";
import { JournalDashboard } from "@/components/journal/journal-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { decks, manifest } from "@/data/snapshot";

export const metadata: Metadata = { title: "Battle Journal" };

export default function JournalPage() {
  return <div className="content-container"><PageHeader eyebrow="Personal performance log" title="Battle Journal." description="Registre torneios e listas do TCG Live, acompanhe seus matchups pessoais e descubra onde seu jogo realmente evolui." /><div className="filter-strip"><span className="filter-chip"><span className="status-dot" /><strong>Modo local ativo</strong></span><span className="filter-chip">Privado</span><span className="filter-chip">{manifest.scope.formatName} · {manifest.scope.eraName}</span></div><JournalDashboard decks={decks} scope={manifest.scope} /></div>;
}
