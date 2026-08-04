"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { DeckCard } from "@/types/domain";

export function CopyDecklistButton({ cards }: { cards: DeckCard[] }) {
  const [copied, setCopied] = useState(false);
  const text = (["pokemon", "trainer", "energy"] as const).map((category) => {
    const title = category === "pokemon" ? "Pokémon" : category === "trainer" ? "Trainer" : "Energy";
    const rows = cards.filter((card) => card.category === category).map((card) => `${card.count} ${card.name}`);
    return `${title}: ${rows.reduce((sum, row) => sum + Number(row.split(" ")[0]), 0)}\n${rows.join("\n")}`;
  }).join("\n\n");
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <button className="button-secondary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copiada" : "Copiar lista"}</button>;
}
