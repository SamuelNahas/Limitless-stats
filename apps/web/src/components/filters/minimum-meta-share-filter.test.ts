// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMinimumMetaSharePreference } from "./minimum-meta-share-filter";

describe("useMinimumMetaSharePreference", () => {
  beforeEach(() => window.localStorage.clear());

  it("allows editing and saves the next valid percentage", () => {
    const { result } = renderHook(() => useMinimumMetaSharePreference());

    act(() => result.current.onChange(""));
    expect(result.current.inputValue).toBe("");

    act(() => result.current.onChange("2.5"));
    expect(result.current.minimumMetaShare).toBe(2.5);
    expect(window.localStorage.getItem("sh-meta-games:minimum-meta-share")).toBe("2.5");
  });

  it("restores the saved percentage on the next mount", async () => {
    window.localStorage.setItem("sh-meta-games:minimum-meta-share", "1.2");
    const { result } = renderHook(() => useMinimumMetaSharePreference());

    await waitFor(() => expect(result.current.minimumMetaShare).toBe(1.2));
    expect(result.current.inputValue).toBe("1.2");
  });
});
