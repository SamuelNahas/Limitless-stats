import type { Metadata } from "next";
import { MetaDashboard } from "@/components/meta/meta-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { decks, manifest, tournamentDeckStats, tournaments } from "@/data/snapshot";
import { formatDate } from "@/lib/stats";

export const metadata: Metadata = { title: "Metagame" };

export default function MetaPage() {
  return (
    <div className="content-container">
      <PageHeader eyebrow="Meta intelligence / live" title="O meta, sem achismo." description={`Resultados dos torneios ${manifest.scope.formatName} Online desde o início da coleção ${manifest.scope.eraName}, convertidos em sinais úteis para sua próxima escolha de deck.`} dateLabel={`${formatDate(manifest.scope.dateFrom)} — ${formatDate(manifest.scope.dateTo || manifest.generatedAt)}`} />
      <MetaDashboard decks={decks} manifest={manifest} tournamentDeckStats={tournamentDeckStats} tournaments={tournaments} />
    </div>
  );
}
