import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineSvg } from "./inline-svg";

describe("InlineSvg", () => {
  it("shows an empty state when svg is missing", () => {
    render(<InlineSvg svg="" />);

    expect(screen.getByText("尚未生成 SVG")).toBeInTheDocument();
  });

  it("shows an error when markup does not contain a root svg", async () => {
    render(<InlineSvg svg={"<div>invalid</div>"} />);

    await waitFor(() => {
      expect(screen.getByText("渲染失败：SVG 内容无效")).toBeInTheDocument();
    });
  });

  it("keeps a visible root svg layout when width and height are present", async () => {
    const { container } = render(
      <InlineSvg
        svg={
          '<svg width="209px" height="111px"><text x="10" y="20">usecase</text></svg>'
        }
      />,
    );

    await waitFor(() => {
      const svgEl = container.querySelector("svg");
      expect(svgEl).not.toBeNull();
      expect(svgEl?.getAttribute("viewBox")).toBe("0 0 209 111");
      expect(svgEl?.getAttribute("style")).toContain("width:100%");
      expect(svgEl?.getAttribute("style")).toContain("height:auto");
      expect(svgEl?.getAttribute("style")).toContain("display:block");
      expect(svgEl?.getAttribute("style")).toContain("overflow:visible");
    });
  });

  it("marks the matching SVG text and shape with a high contrast highlight", async () => {
    const { container } = render(
      <InlineSvg
        svg={
          '<svg width="160" height="80"><g><rect width="120" height="40"></rect><text x="10" y="25">提交订单</text></g><text x="10" y="65">其它节点</text></svg>'
        }
        highlightLabel="提交订单"
      />,
    );

    await waitFor(() => {
      const matchedText = container.querySelector("text.pum-highlight");
      const matchedShape = container.querySelector("rect.pum-highlight");
      const matchedGroup = container.querySelector("g.pum-highlight");

      expect(matchedText?.textContent).toBe("提交订单");
      expect(matchedShape).not.toBeNull();
      expect(matchedGroup).not.toBeNull();
      expect(container.querySelector(".uml-inline-svg")).not.toBeNull();
    });
  });

  it("uses the dedicated light blue highlight style instead of the primary token", () => {
    render(<InlineSvg svg="<svg><text>ok</text></svg>" />);

    const styleText = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(styleText).toContain("--uml-highlight: #38bdf8");
    expect(styleText).toContain("--uml-highlight-strong: #0284c7");
    expect(styleText).toContain("stroke-width: 4px");
    expect(styleText).not.toContain("--primary");
  });
});
