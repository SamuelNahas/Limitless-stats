import type { MatchRecord, TiePolicy } from "@/types/domain";

export const TIE_POLICIES: Array<{
  value: TiePolicy;
  label: string;
  formula: string;
  shortLabel: string;
}> = [
  { value: "ignore", label: "Ignorar empates", formula: "W ÷ (W + L)", shortLabel: "Ignorar" },
  { value: "loss", label: "Empates como derrotas", formula: "W ÷ (W + L + T)", shortLabel: "Derrota" },
  { value: "half", label: "Empates valem ½ vitória", formula: "(W + T ÷ 2) ÷ (W + L + T)", shortLabel: "½ vitória" },
  { value: "third", label: "Empates valem ⅓ vitória", formula: "(W + T ÷ 3) ÷ (W + L + T)", shortLabel: "⅓ vitória" },
  { value: "win", label: "Empates como vitórias", formula: "(W + T) ÷ (W + L + T)", shortLabel: "Vitória" },
];

export function recordTotal(record: MatchRecord): number {
  return record.wins + record.losses + record.ties;
}

export function resultRate(record: MatchRecord, policy: TiePolicy = "half"): number | null {
  const { wins, losses, ties } = record;
  if (policy === "ignore") {
    return wins + losses > 0 ? wins / (wins + losses) : null;
  }
  const total = wins + losses + ties;
  if (!total) return null;
  const tieWeight = policy === "win" ? 1 : policy === "half" ? 0.5 : policy === "third" ? 1 / 3 : 0;
  return (wins + ties * tieWeight) / total;
}

export function rateBand(rate: number | null): "good" | "even" | "bad" | "empty" {
  if (rate === null) return "empty";
  if (rate > 0.55) return "good";
  if (rate < 0.45) return "bad";
  return "even";
}

export function confidenceLabel(games: number): "Alta" | "Média" | "Baixa" {
  if (games >= 100) return "Alta";
  if (games >= 30) return "Média";
  return "Baixa";
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatDate(value: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
