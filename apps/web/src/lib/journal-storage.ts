import type { JournalEvent, JournalRound } from "@/types/domain";

const STORAGE_KEY = "limitless-stats:journal:v1";
const TOMBSTONE_KEY = "limitless-stats:journal-deleted:v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function readJournal(): JournalEvent[] {
  if (!canUseStorage()) return [];
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as JournalEvent[]) : [];
  } catch {
    return [];
  }
}

export function writeJournal(events: JournalEvent[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function readJournalTombstones(): string[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TOMBSTONE_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function addJournalTombstone(eventId: string): void {
  if (!canUseStorage()) return;
  const ids = new Set(readJournalTombstones());
  ids.add(eventId);
  window.localStorage.setItem(TOMBSTONE_KEY, JSON.stringify([...ids]));
}

export function clearJournalTombstones(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(TOMBSTONE_KEY);
}

export function createId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}_${random}`;
}

export function createRound(roundNumber: number): JournalRound {
  return {
    id: createId("round"),
    roundNumber,
    opponentDeckId: "",
    result: "win",
    turnOrder: "unknown",
  };
}
