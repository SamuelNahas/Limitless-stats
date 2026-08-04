import type { Metadata } from "next";
import { MatchupsExplorer } from "@/components/matchups/matchups-explorer";
import { PageHeader } from "@/components/ui/page-header";
import { decks, manifest, matchupsAll } from "@/data/snapshot";
import { formatDate } from "@/lib/stats";

export const metadata: Metadata = { title: "Matchups" };

export default function MatchupsPage() {
  return (
    <div className="content-container">
      <PageHeader eyebrow="Head-to-head laboratory" title="Matchups sob controle." description="Troque a regra de empates, escolha um arquétipo e descubra onde os dados apontam vantagem — sem esconder o tamanho da amostra." dateLabel={`${manifest.scope.formatName} Online · ${formatDate(manifest.scope.dateFrom)} até ${formatDate(manifest.scope.dateTo || manifest.generatedAt)}`} />
      <div className="filter-strip"><span className="filter-chip"><span className="status-dot" /><strong>{manifest.scope.formatName}</strong></span><span className="filter-chip">{manifest.scope.eraName}</span><span className="filter-chip">Matriz direcional</span><span className="filter-spacer" /><span className="update-note">W = vitória · L = derrota · T = empate</span></div>
      <MatchupsExplorer decks={decks} initialMatchups={matchupsAll} />
    </div>
  );
}
