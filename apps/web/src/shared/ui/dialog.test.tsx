// Verifies dialog side-effect cleanup does not remove React-owned portal nodes.
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.body.style.removeProperty("pointer-events");
  document.body.removeAttribute("data-scroll-locked");
});

describe("Dialog side-effect cleanup", () => {
  it("clears global locks without removing overlay nodes owned by Radix Portal", () => {
    vi.useFakeTimers();
    const overlay = document.createElement("div");
    overlay.setAttribute("data-slot", "dialog-overlay");
    document.body.appendChild(overlay);
    const hidden = document.createElement("main");
    hidden.setAttribute("aria-hidden", "true");
    hidden.setAttribute("data-aria-hidden", "true");
    document.body.appendChild(hidden);
    document.body.style.pointerEvents = "none";
    document.body.setAttribute("data-scroll-locked", "1");

    render(<Dialog open={false} />);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(overlay.isConnected).toBe(true);
    expect(document.body.style.pointerEvents).toBe("");
    expect(document.body).not.toHaveAttribute("data-scroll-locked");
    expect(hidden).not.toHaveAttribute("aria-hidden");
    expect(hidden).not.toHaveAttribute("data-aria-hidden");
  });
});
