import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

function parseSvgLength(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function InlineSvg({
  svg,
  highlightLabel,
  scale = 1,
  className,
}: {
  svg: string;
  highlightLabel?: string;
  scale?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>("");
  const sanitizedSvg = svg
    .replace(/<\?xml[^?]*\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  useEffect(() => {
    setError("");
  }, [sanitizedSvg]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !sanitizedSvg) return;
    const svgEl = root.querySelector("svg");
    if (!svgEl) {
      setError("SVG 内容无效");
      return;
    }

    if (!svgEl.getAttribute("viewBox")) {
      const width = parseSvgLength(svgEl.getAttribute("width"));
      const height = parseSvgLength(svgEl.getAttribute("height"));
      if (width && height) {
        svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
      }
    }

    const existingStyle = (svgEl.getAttribute("style") ?? "").trim();
    const layoutStyle = `width:${Math.round(scale * 10000) / 100}%;max-width:none;height:auto;display:block;overflow:visible;`;
    svgEl.setAttribute(
      "style",
      existingStyle ? `${existingStyle}${existingStyle.endsWith(";") ? "" : ";"}${layoutStyle}` : layoutStyle,
    );

    svgEl
      .querySelectorAll<SVGElement>(".pum-highlight, .pum-dim")
      .forEach((n) => n.classList.remove("pum-highlight", "pum-dim"));

    if (!highlightLabel) return;

    const target = highlightLabel.trim();
    const texts = Array.from(svgEl.querySelectorAll<SVGTextElement>("text"));
    const matches = texts.filter(
      (t) => (t.textContent ?? "").trim() === target,
    );
    if (matches.length === 0) return;

    const highlightNodes = new Set<Element>();
    for (const t of matches) {
      highlightNodes.add(t);
      const g = t.closest("g");
      if (g) highlightNodes.add(g);
      const prev = t.previousElementSibling;
      if (
        prev &&
        ["rect", "ellipse", "circle", "polygon", "path"].includes(
          prev.tagName.toLowerCase(),
        )
      ) {
        highlightNodes.add(prev);
      }
    }
    highlightNodes.forEach((n) => n.classList.add("pum-highlight"));

    const first = matches[0];
    if (first && "scrollIntoView" in first) {
      try {
        first.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      } catch {
        /* ignore */
      }
    }
  }, [sanitizedSvg, highlightLabel, scale]);

  if (!sanitizedSvg) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 尚未生成 SVG
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        渲染失败：{error}
      </div>
    );
  }

  return (
    <>
      <style>{`
        .pum-highlight rect,
        .pum-highlight ellipse,
        .pum-highlight circle,
        .pum-highlight polygon,
        .pum-highlight path,
        rect.pum-highlight,
        ellipse.pum-highlight,
        circle.pum-highlight,
        polygon.pum-highlight,
        path.pum-highlight {
          stroke: hsl(var(--primary, 222 47% 51%)) !important;
          stroke-width: 3px !important;
          filter: drop-shadow(0 0 6px hsl(var(--primary, 222 47% 51%) / 0.55));
        }
        text.pum-highlight {
          fill: hsl(var(--primary, 222 47% 51%)) !important;
          font-weight: 600;
        }
      `}</style>
      <div
        ref={containerRef}
        className={className}
        dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
      />
    </>
  );
}
