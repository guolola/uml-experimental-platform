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
});
