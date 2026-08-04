"use client";

import { Swords } from "lucide-react";
import { usePreferences } from "@/components/layout/preferences-provider";
import { StatCard } from "@/components/ui/stat-card";
import { percent, recordTotal, resultRate } from "@/lib/stats";
import type { MatchRecord } from "@/types/domain";

export function DeckResultRateCard({ record }: { record: MatchRecord }) {
  const { tiePolicy } = usePreferences();
  return <StatCard label="Result rate" value={percent(resultRate(record, tiePolicy))} detail={`${recordTotal(record)} partidas`} icon={Swords} tone="cyan" />;
}
