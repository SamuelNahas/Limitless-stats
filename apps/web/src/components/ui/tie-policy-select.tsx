"use client";

import { CircleHelp } from "lucide-react";
import { usePreferences } from "@/components/layout/preferences-provider";
import { TIE_POLICIES } from "@/lib/stats";
import type { TiePolicy } from "@/types/domain";

export function TiePolicySelect({ compact = false }: { compact?: boolean }) {
  const { tiePolicy, setTiePolicy } = usePreferences();
  const selected = TIE_POLICIES.find((item) => item.value === tiePolicy)!;
  return (
    <div className={`tie-policy ${compact ? "compact" : ""}`}>
      <div className="field-label-row">
        <label htmlFor="tie-policy">Cálculo da taxa de resultado</label>
        <span className="help-icon" title="W = vitórias, L = derrotas, T = empates"><CircleHelp size={15} /></span>
      </div>
      <select id="tie-policy" value={tiePolicy} onChange={(event) => setTiePolicy(event.target.value as TiePolicy)}>
        {TIE_POLICIES.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.formula}</option>)}
      </select>
      {!compact && <small>Fórmula aplicada: <code>{selected.formula}</code></small>}
    </div>
  );
}
