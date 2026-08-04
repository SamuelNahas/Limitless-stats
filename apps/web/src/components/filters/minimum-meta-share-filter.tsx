"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "sh-meta-games:minimum-meta-share";
const preferenceListeners = new Set<() => void>();

function subscribe(listener: () => void) {
  preferenceListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    preferenceListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readPreference() {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored >= 0 && stored <= 100 ? stored : 0;
  } catch {
    return 0;
  }
}

function writePreference(value: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // O filtro continua funcionando durante a sessão se o storage estiver indisponível.
  }
  preferenceListeners.forEach((listener) => listener());
}

type MetaSharePreference = {
  inputValue: string;
  minimumMetaShare: number;
  onBlur: () => void;
  onChange: (value: string) => void;
  reset: () => void;
};

export function useMinimumMetaSharePreference(): MetaSharePreference {
  const getServerSnapshot = useCallback(() => 0, []);
  const minimumMetaShare = useSyncExternalStore(subscribe, readPreference, getServerSnapshot);
  const [draft, setDraft] = useState<string | null>(null);
  const inputValue = draft ?? String(minimumMetaShare);

  function onChange(value: string) {
    setDraft(value);
    if (value === "") return;

    const nextValue = Number(value);
    if (!Number.isFinite(nextValue) || nextValue < 0 || nextValue > 100) return;
    writePreference(nextValue);
  }

  function onBlur() {
    setDraft(null);
  }

  function reset() {
    setDraft(null);
    writePreference(0);
  }

  return { inputValue, minimumMetaShare, onBlur, onChange, reset };
}

export function MinimumMetaShareFilter({ preference }: { preference: MetaSharePreference }) {
  return (
    <label className="minimum-share-field" htmlFor="minimum-meta-share">
      <span>Meta share mín.</span>
      <input
        id="minimum-meta-share"
        type="number"
        min="0"
        max="100"
        step="0.1"
        inputMode="decimal"
        value={preference.inputValue}
        onBlur={preference.onBlur}
        onChange={(event) => preference.onChange(event.target.value)}
      />
      <span>%</span>
    </label>
  );
}
