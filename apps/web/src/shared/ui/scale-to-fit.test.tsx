// Verifies scale-to-fit primitives used by mobile visual-density layouts.
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScaledTable, ScaledToolbar, ScaleToFitFrame } from "./scale-to-fit";

function rect(width: number, height: number) {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function sizeScaleFrame({
  container,
  content,
  containerWidth,
  contentWidth,
  contentHeight,
}: {
  container: HTMLElement;
  content: HTMLElement;
  containerWidth: number;
  contentWidth: number;
  contentHeight: number;
}) {
  container.getBoundingClientRect = () => rect(containerWidth, contentHeight);
  content.getBoundingClientRect = () => rect(contentWidth, contentHeight);
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    value: containerWidth,
  });
  Object.defineProperty(content, "scrollWidth", {
    configurable: true,
    value: contentWidth,
  });
  Object.defineProperty(content, "scrollHeight", {
    configurable: true,
    value: contentHeight,
  });
}

describe("ScaleToFitFrame", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scales wide content on mobile and compensates the rendered height", () => {
    mockViewport(true);
    render(
      <ScaleToFitFrame activeBelow="md" minWidth={600} data-testid="scale-frame">
        <div>wide toolbar</div>
      </ScaleToFitFrame>,
    );

    const frame = screen.getByTestId("scale-frame");
    const content = frame.firstElementChild as HTMLElement;
    sizeScaleFrame({
      container: frame,
      content,
      containerWidth: 300,
      contentWidth: 600,
      contentHeight: 120,
    });

    act(() => window.dispatchEvent(new Event("resize")));

    expect(frame).toHaveAttribute("data-scale-to-fit", "scaled");
    expect(frame).toHaveAttribute("data-readability", "too-small");
    expect(frame).toHaveStyle({ height: "60px" });
    expect(content).toHaveStyle({ transform: "scale(0.5)" });
  });

  it("keeps natural desktop sizing for breakpoint-gated frames", () => {
    mockViewport(false);
    render(
      <ScaleToFitFrame activeBelow="md" minWidth={600} data-testid="scale-frame">
        <div>desktop toolbar</div>
      </ScaleToFitFrame>,
    );

    const frame = screen.getByTestId("scale-frame");
    const content = frame.firstElementChild as HTMLElement;
    sizeScaleFrame({
      container: frame,
      content,
      containerWidth: 300,
      contentWidth: 600,
      contentHeight: 120,
    });

    act(() => window.dispatchEvent(new Event("resize")));

    expect(frame).toHaveAttribute("data-scale-to-fit", "natural");
    expect(frame).toHaveAttribute("data-readability", "ok");
    expect(content.style.transform).toBe("");
    expect(frame.style.height).toBe("");
  });

  it("marks scaled content readable when it stays above the configured threshold", () => {
    mockViewport(true);
    render(
      <ScaleToFitFrame
        activeBelow="md"
        minReadableScale={0.7}
        minWidth={400}
        data-testid="scale-frame"
      >
        <div>compact toolbar</div>
      </ScaleToFitFrame>,
    );

    const frame = screen.getByTestId("scale-frame");
    const content = frame.firstElementChild as HTMLElement;
    sizeScaleFrame({
      container: frame,
      content,
      containerWidth: 320,
      contentWidth: 400,
      contentHeight: 80,
    });

    act(() => window.dispatchEvent(new Event("resize")));

    expect(frame).toHaveAttribute("data-scale-to-fit", "scaled");
    expect(frame).toHaveAttribute("data-readability", "ok");
    expect(content).toHaveStyle({ transform: "scale(0.8)" });
  });
});

describe("ScaledToolbar", () => {
  it("preserves a nowrap toolbar content row", () => {
    render(
      <ScaledToolbar data-testid="toolbar" minWidth={420}>
        <button type="button">筛选</button>
        <button type="button">排序</button>
      </ScaledToolbar>,
    );

    const content = screen.getByTestId("toolbar").firstElementChild;
    expect(content).toHaveClass("flex-nowrap", "w-max");
  });
});

describe("ScaledTable", () => {
  it("keeps full table width available for scale measurement", () => {
    render(
      <ScaledTable minWidth={900} data-testid="scaled-table">
        <tbody>
          <tr>
            <td>完整表格</td>
          </tr>
        </tbody>
      </ScaledTable>,
    );

    expect(screen.getByTestId("scaled-table")).toHaveStyle({
      width: "max(100%, 900px)",
    });
  });
});
