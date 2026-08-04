"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { TiePolicy } from "@/types/domain";

type Preferences = {
  tiePolicy: TiePolicy;
  setTiePolicy: (policy: TiePolicy) => void;
};

const PreferencesContext = createContext<Preferences | null>(null);
const allowed = new Set<TiePolicy>(["ignore", "loss", "half", "third", "win"]);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [tiePolicy, setPolicy] = useState<TiePolicy>("half");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const queryValue = new URLSearchParams(window.location.search).get("ties") as TiePolicy | null;
      const stored = window.localStorage.getItem("limitless-stats:tie-policy") as TiePolicy | null;
      if (queryValue && allowed.has(queryValue)) setPolicy(queryValue);
      else if (stored && allowed.has(stored)) setPolicy(stored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function setTiePolicy(policy: TiePolicy) {
    setPolicy(policy);
    window.localStorage.setItem("limitless-stats:tie-policy", policy);
    const url = new URL(window.location.href);
    url.searchParams.set("ties", policy);
    window.history.replaceState({}, "", url);
  }

  const value = useMemo(() => ({ tiePolicy, setTiePolicy }), [tiePolicy]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences precisa de PreferencesProvider");
  return value;
}
