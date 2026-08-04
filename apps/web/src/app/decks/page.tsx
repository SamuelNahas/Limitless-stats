import type { Metadata } from "next";
import { DeckCatalog } from "@/components/decks/deck-catalog";
import { PageHeader } from "@/components/ui/page-header";
import { decks, manifest, tournamentDeckStats, tournaments } from "@/data/snapshot";
import { formatDate } from "@/lib/stats";

export const metadata: Metadata = { title: "Decks" };

export default function DecksPage() {
  return (
    <div className="content-container">
      <PageHeader eyebrow="Archetype database" title="Escolha seu próximo deck." description={`Explore todos os arquétipos observados no ${manifest.scope.formatName} Online, compare presença, desempenho, listas representativas e seus melhores confrontos.`} dateLabel={`Dados até ${formatDate(manifest.scope.dateTo || manifest.generatedAt)}`} />
      <DeckCatalog decks={decks} manifest={manifest} tournamentDeckStats={tournamentDeckStats} tournaments={tournaments} />
    </div>
  );
}
