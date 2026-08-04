import type { SupabaseClient, User } from "@supabase/supabase-js";
import { clearJournalTombstones, createId, readJournalTombstones } from "@/lib/journal-storage";
import { parsePtcglDecklist } from "@/lib/ptcgl-parser";
import type { JournalEvent, JournalResult, JournalRound, TiePolicy, TurnOrder } from "@/types/domain";
import { createClient } from "./client";

const UUID_PATTERN = /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

type CloudEventRow = {
  id: string;
  client_request_id: string;
  decklist_id: string | null;
  format_slug: string;
  name: string;
  tournament_date: string;
  match_structure: "bo1" | "bo3" | "mixed";
  own_archetype_slug: string | null;
  own_archetype_label: string | null;
  era_slug: string;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
};

type CloudRoundRow = {
  event_id: string;
  client_request_id: string;
  round_number: number;
  opponent_archetype_slug: string | null;
  opponent_archetype_label: string | null;
  result: JournalResult | "bye" | "unreported";
  game_wins: number;
  game_losses: number;
  game_ties: number;
  went_first: TurnOrder;
  notes: string | null;
};

type CloudDecklistRow = { id: string; raw_text: string };

export type JournalSyncResult = {
  events: JournalEvent[];
  user: User;
  syncedAt: string;
};

export type ProfileShareLink = {
  id: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

function getClientUuid(id: string): string | null {
  return id.match(UUID_PATTERN)?.[1]?.toLowerCase() ?? null;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeJournalIds(events: JournalEvent[]): JournalEvent[] {
  return events.map((event) => ({
    ...event,
    id: getClientUuid(event.id) ? event.id : createId("event"),
    rounds: event.rounds.map((round) => ({
      ...round,
      id: getClientUuid(round.id) ? round.id : createId("round"),
    })),
  }));
}

export function mergeJournals(local: JournalEvent[], cloud: JournalEvent[]): JournalEvent[] {
  const merged = new Map<string, JournalEvent>();
  for (const event of cloud) merged.set(event.id, event);
  for (const event of local) {
    const remote = merged.get(event.id);
    if (!remote || timestamp(event.updatedAt) >= timestamp(remote.updatedAt)) merged.set(event.id, event);
  }
  return [...merged.values()].sort((a, b) => {
    const byDate = b.playedAt.localeCompare(a.playedAt);
    return byDate || timestamp(b.updatedAt) - timestamp(a.updatedAt);
  });
}

async function authenticatedClient(): Promise<{ client: SupabaseClient; user: User }> {
  const client = createClient();
  if (!client) throw new Error("Supabase ainda não foi configurado.");
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Entre com seu e-mail antes de sincronizar.");
  return { client, user: data.user };
}

async function readCloudJournal(client: SupabaseClient, userId: string): Promise<JournalEvent[]> {
  const [eventsResult, roundsResult, decklistsResult] = await Promise.all([
    client.from("journal_events").select("id,client_request_id,decklist_id,format_slug,name,tournament_date,match_structure,own_archetype_slug,own_archetype_label,era_slug,created_at,updated_at,client_updated_at").eq("user_id", userId),
    client.from("journal_rounds").select("event_id,client_request_id,round_number,opponent_archetype_slug,opponent_archetype_label,result,game_wins,game_losses,game_ties,went_first,notes").eq("user_id", userId),
    client.from("user_decklists").select("id,raw_text").eq("user_id", userId),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (roundsResult.error) throw roundsResult.error;
  if (decklistsResult.error) throw decklistsResult.error;

  const eventRows = (eventsResult.data ?? []) as CloudEventRow[];
  const roundRows = (roundsResult.data ?? []) as CloudRoundRow[];
  const decklistRows = (decklistsResult.data ?? []) as CloudDecklistRow[];
  const decklists = new Map(decklistRows.map((row) => [row.id, row.raw_text]));
  const rounds = new Map<string, JournalRound[]>();
  for (const row of roundRows) {
    if (row.result !== "win" && row.result !== "loss" && row.result !== "tie") continue;
    const values = rounds.get(row.event_id) ?? [];
    values.push({
      id: `round_${row.client_request_id}`,
      roundNumber: row.round_number,
      opponentDeckId: row.opponent_archetype_slug || "custom",
      opponentLabel: row.opponent_archetype_label || undefined,
      result: row.result,
      gameWins: row.game_wins || undefined,
      gameLosses: row.game_losses || undefined,
      gameTies: row.game_ties || undefined,
      turnOrder: row.went_first,
      notes: row.notes || undefined,
    });
    rounds.set(row.event_id, values);
  }

  return eventRows.map((row) => ({
    id: `event_${row.client_request_id}`,
    name: row.name,
    playedAt: row.tournament_date,
    formatId: row.format_slug || "standard",
    eraId: row.era_slug || "standard-pitch-black",
    mode: row.match_structure === "bo3" ? "bo3" : "bo1",
    ownDeckId: row.own_archetype_slug || "custom",
    ownDeckLabel: row.own_archetype_label || undefined,
    decklistText: row.decklist_id ? decklists.get(row.decklist_id) || "" : "",
    rounds: (rounds.get(row.id) ?? []).toSorted((a, b) => a.roundNumber - b.roundNumber),
    createdAt: row.created_at,
    updatedAt: row.client_updated_at || row.updated_at,
  }));
}

async function resolveScope(client: SupabaseClient, formatSlug: string, eraSlug: string): Promise<{ formatId: string; seasonId: string }> {
  const formatResult = await client.from("formats").select("id").eq("slug", formatSlug).single();
  if (formatResult.error) throw formatResult.error;
  const seasonResult = await client.from("seasons").select("id").eq("format_id", formatResult.data.id).eq("slug", eraSlug).single();
  if (seasonResult.error) throw seasonResult.error;
  return { formatId: formatResult.data.id as string, seasonId: seasonResult.data.id as string };
}

async function writeCloudJournal(client: SupabaseClient, user: User, events: JournalEvent[], deckNames: Record<string, string>): Promise<void> {
  const scopes = new Map<string, { formatId: string; seasonId: string }>();
  for (const event of events) {
    const scopeKey = `${event.formatId}:${event.eraId}`;
    let scope = scopes.get(scopeKey);
    if (!scope) {
      scope = await resolveScope(client, event.formatId, event.eraId);
      scopes.set(scopeKey, scope);
    }
    const eventUuid = getClientUuid(event.id);
    if (!eventUuid) throw new Error(`Identificador local inválido no torneio “${event.name}”.`);
    const parsed = parsePtcglDecklist(event.decklistText);
    const decklistResult = await client.from("user_decklists").upsert({
      user_id: user.id,
      client_request_id: eventUuid,
      format_id: scope.formatId,
      format_slug: event.formatId,
      season_id: scope.seasonId,
      name: `${event.name} — ${deckNames[event.ownDeckId] || event.ownDeckLabel || event.ownDeckId}`,
      source: "ptcgl_text",
      raw_text: event.decklistText,
      parse_status: parsed.total === 60 && parsed.errors.length === 0 ? "valid" : "invalid",
      parse_errors: parsed.errors,
      card_count: Math.min(parsed.total, 60),
      created_at: event.createdAt,
      updated_at: event.updatedAt,
    }, { onConflict: "user_id,client_request_id" }).select("id").single();
    if (decklistResult.error) throw decklistResult.error;

    const cloudEventResult = await client.from("journal_events").upsert({
      user_id: user.id,
      client_request_id: eventUuid,
      format_id: scope.formatId,
      format_slug: event.formatId,
      season_id: scope.seasonId,
      decklist_id: decklistResult.data.id,
      own_archetype_slug: event.ownDeckId,
      own_archetype_label: deckNames[event.ownDeckId] || event.ownDeckLabel || event.ownDeckId,
      era_slug: event.eraId,
      name: event.name,
      tournament_date: event.playedAt,
      environment: "online",
      platform: "ptcgl",
      match_structure: event.mode,
      status: "completed",
      created_at: event.createdAt,
      updated_at: event.updatedAt,
      client_updated_at: event.updatedAt,
    }, { onConflict: "user_id,client_request_id" }).select("id").single();
    if (cloudEventResult.error) throw cloudEventResult.error;
    const cloudEventId = cloudEventResult.data.id as string;

    const existingRounds = await client.from("journal_rounds").select("id,client_request_id").eq("event_id", cloudEventId);
    if (existingRounds.error) throw existingRounds.error;
    const localRoundIds = new Set(event.rounds.map((round) => getClientUuid(round.id)).filter(Boolean));
    const staleRoundIds = (existingRounds.data ?? []).filter((row) => !localRoundIds.has(row.client_request_id as string)).map((row) => row.id as string);
    if (staleRoundIds.length) {
      const deleted = await client.from("journal_rounds").delete().in("id", staleRoundIds);
      if (deleted.error) throw deleted.error;
    }

    if (event.rounds.length) {
      const payload = event.rounds.map((round) => {
        const roundUuid = getClientUuid(round.id);
        if (!roundUuid) throw new Error(`Identificador inválido na rodada ${round.roundNumber} de “${event.name}”.`);
        return {
          user_id: user.id,
          client_request_id: roundUuid,
          event_id: cloudEventId,
          format_id: scope.formatId,
          round_number: round.roundNumber,
          match_structure: event.mode,
          opponent_archetype_slug: round.opponentDeckId,
          opponent_archetype_label: deckNames[round.opponentDeckId] || round.opponentLabel || round.opponentDeckId,
          result: round.result,
          game_wins: round.gameWins || 0,
          game_losses: round.gameLosses || 0,
          game_ties: round.gameTies || 0,
          went_first: round.turnOrder,
          notes: round.notes || null,
        };
      });
      const roundsResult = await client.from("journal_rounds").upsert(payload, { onConflict: "user_id,client_request_id" });
      if (roundsResult.error) throw roundsResult.error;
    }
  }
}

export async function syncJournal(events: JournalEvent[], deckNames: Record<string, string>, tiePolicy: TiePolicy): Promise<JournalSyncResult> {
  const { client, user } = await authenticatedClient();
  const profileResult = await client.from("profiles").update({ tie_rule: tiePolicy }).eq("id", user.id);
  if (profileResult.error) throw profileResult.error;
  const tombstones = readJournalTombstones();
  for (const id of tombstones) await deleteCloudEvent(client, user.id, id);
  const local = normalizeJournalIds(events);
  const cloud = await readCloudJournal(client, user.id);
  const merged = mergeJournals(local, cloud);
  await writeCloudJournal(client, user, merged, deckNames);
  clearJournalTombstones();
  return { events: merged, user, syncedAt: new Date().toISOString() };
}

async function deleteCloudEvent(client: SupabaseClient, userId: string, localEventId: string): Promise<void> {
  const clientUuid = getClientUuid(localEventId);
  if (!clientUuid) return;
  const found = await client.from("journal_events").select("id,decklist_id").eq("user_id", userId).eq("client_request_id", clientUuid).maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) return;
  const deleted = await client.from("journal_events").delete().eq("id", found.data.id);
  if (deleted.error) throw deleted.error;
  if (found.data.decklist_id) {
    const decklistDeleted = await client.from("user_decklists").delete().eq("id", found.data.decklist_id);
    if (decklistDeleted.error) throw decklistDeleted.error;
  }
}

export async function deleteCloudJournalEvent(localEventId: string): Promise<void> {
  const { client, user } = await authenticatedClient();
  await deleteCloudEvent(client, user.id, localEventId);
}

export async function createPrivateShareLink(label = "Meu perfil competitivo"): Promise<{ id: string; secret: string }> {
  const { client } = await authenticatedClient();
  const result = await client.rpc("create_profile_share_link", { p_label: label, p_expires_at: null });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row?.link_id || !row?.secret) throw new Error("O servidor não retornou o link privado.");
  return { id: row.link_id as string, secret: row.secret as string };
}

export async function listPrivateShareLinks(): Promise<ProfileShareLink[]> {
  const { client, user } = await authenticatedClient();
  const result = await client.from("profile_share_links").select("id,label,created_at,expires_at,revoked_at").eq("user_id", user.id).order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => ({ id: row.id, label: row.label, createdAt: row.created_at, expiresAt: row.expires_at, revokedAt: row.revoked_at }));
}

export async function revokePrivateShareLink(id: string): Promise<void> {
  const { client, user } = await authenticatedClient();
  const result = await client.from("profile_share_links").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (result.error) throw result.error;
}
