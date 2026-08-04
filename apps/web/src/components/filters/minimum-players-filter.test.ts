// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMinimumPlayersPreference } from "./minimum-players-filter";

describe("useMinimumPlayersPreference", () => {
  beforeEach(() => window.localStorage.clear());

  it("allows an empty field while editing and applies the next valid number", () => {
    const { result } = renderHook(() => useMinimumPlayersPreference(1));

    act(() => result.current.onChange(""));
    expect(result.current.inputValue).toBe("");
    expect(result.current.minimumPlayers).toBe(1);

    act(() => result.current.onChange("32"));
    expect(result.current.inputValue).toBe("32");
    expect(result.current.minimumPlayers).toBe(32);
  });

  it("restores the saved value on the next mount", async () => {
    window.localStorage.setItem("limitless-stats:minimum-tournament-players", "64");
    const { result } = renderHook(() => useMinimumPlayersPreference(1));

    await waitFor(() => expect(result.current.minimumPlayers).toBe(64));
    expect(result.current.inputValue).toBe("64");
  });
});
