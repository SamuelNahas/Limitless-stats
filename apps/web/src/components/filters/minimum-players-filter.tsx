"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { UsersRound } from "lucide-react";

const STORAGE_KEY = "limitless-stats:minimum-tournament-players";
const preferenceListeners = new Set<() => void>();

function subscribe(listener: () => void) {
  preferenceListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    preferenceListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readPreference(fallback: number) {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(stored) && stored >= fallback ? stored : fallback;
  } catch {
    return fallback;
  }
}

function writePreference(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // O filtro ainda é aplicado durante a sessão se o storage estiver indisponível.
  }
  preferenceListeners.forEach((listener) => listener());
}

type MinimumPlayersPreference = {
  inputValue: string;
  minimumPlayers: number;
  onBlur: () => void;
  onChange: (value: string) => void;
  reset: () => void;
};

export function useMinimumPlayersPreference(fallback: number): MinimumPlayersPreference {
  const getSnapshot = useCallback(() => readPreference(fallback), [fallback]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  const minimumPlayers = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [draft, setDraft] = useState<string | null>(null);
  const inputValue = draft ?? String(minimumPlayers);

  function onChange(value: string) {
    setDraft(value);
    if (value === "") return;

    const nextValue = Number(value);
    if (!Number.isInteger(nextValue) || nextValue < fallback) return;

    writePreference(nextValue);
  }

  function onBlur() {
    setDraft(null);
  }

  function reset() {
    setDraft(null);
    writePreference(fallback);
  }

  return { inputValue, minimumPlayers, onBlur, onChange, reset };
}

export function MinimumPlayersFilter({
  id,
  maximumPlayers,
  preference,
}: {
  id: string;
  maximumPlayers: number;
  preference: MinimumPlayersPreference;
}) {
  return (
    <label className="filter-number" htmlFor={id}>
      <UsersRound size={14} />
      <span>Torneios com pelo menos</span>
      <input
        id={id}
        type="number"
        min="1"
        max={maximumPlayers}
        step="1"
        inputMode="numeric"
        value={preference.inputValue}
        onBlur={preference.onBlur}
        onChange={(event) => preference.onChange(event.target.value)}
      />
      <span>jogadores</span>
    </label>
  );
}
