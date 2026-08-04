import { describe, expect, it } from "vitest";
import { mergeJournals, normalizeJournalIds } from "./journal-sync";
import type { JournalEvent } from "@/types/domain";

function event(id: string, updatedAt: string, name = "Liga"): JournalEvent {
  return {
    id,
    name,
    playedAt: "2026-08-03",
    formatId: "standard",
    eraId: "standard-pitch-black",
    mode: "bo1",
    ownDeckId: "dragapult",
    decklistText: "",
    rounds: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("journal cloud merge", () => {
  it("keeps the latest version of the same client event", () => {
    const id = "event_89bf6b33-c022-4b5d-a48b-6fe177de9564";
    const result = mergeJournals(
      [event(id, "2026-08-03T15:00:00Z", "Local")],
      [event(id, "2026-08-03T14:00:00Z", "Cloud")],
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Local");
  });

  it("upgrades legacy non-UUID identifiers before a sync", () => {
    const normalized = normalizeJournalIds([event("event_legacy", "2026-08-03T15:00:00Z")]);
    expect(normalized[0].id).toMatch(/^event_[0-9a-f-]{36}$/);
  });
});
