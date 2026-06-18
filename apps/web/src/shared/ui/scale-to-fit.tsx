// Provides measured scale-to-fit primitives for preserving desktop composition on narrow viewports.
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
} from "react";
import { cn } from "./utils";

const MOBILE_SCALE_QUERY = "(max-width: 767px)";

function mobileScaleActive() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(MOBILE_SCALE_QUERY).matches;
}

type ScaleToFitFrameProps = {
  children: ReactNode;
  minWidth?: number;
  minReadableScale?: number;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  activeBelow?: "md" | "always";
  "data-testid"?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">;

type ScaleState = {
  contentHeight: number;
  scale: number;
};

export function ScaleToFitFrame({
  children,
  minWidth = 0,
  minReadableScale = 0.68,
  className,
  contentClassName,
  disabled = false,
  activeBelow = "always",
  "data-testid": dataTestId,
  style,
  ...frameProps
}: ScaleToFitFrameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const measureFrameRef = useRef<number | null>(null);
  const [scaleState, setScaleState] = useState<ScaleState>({
    contentHeight: 0,
    scale: 1,
  });

  const measure = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content || disabled) {
      setScaleState((current) =>
        current.scale === 1 && current.contentHeight === 0
          ? current
          : { contentHeight: 0, scale: 1 },
      );
      return;
    }

    const scaleEnabled =
      activeBelow === "always" || mobileScaleActive();
    const containerWidth =
      container.getBoundingClientRect().width ||
      container.clientWidth ||
      container.offsetWidth;
    if (containerWidth <= 0) {
      return;
    }

    const contentRect = content.getBoundingClientRect();
    const contentWidth = Math.max(
      minWidth,
      content.scrollWidth,
      contentRect.width,
    );
    const contentHeight = Math.max(
      content.scrollHeight,
      contentRect.height,
    );
    const nextScale =
      scaleEnabled && containerWidth > 0 && contentWidth > containerWidth
        ? containerWidth / contentWidth
        : 1;

    setScaleState((current) => {
      const roundedScale = Number(nextScale.toFixed(4));
      const roundedHeight = Math.ceil(contentHeight);
      if (
        current.scale === roundedScale &&
        current.contentHeight === roundedHeight
      ) {
        return current;
      }
      return { contentHeight: roundedHeight, scale: roundedScale };
    });
  }, [activeBelow, disabled, minWidth]);

  const scheduleMeasure = useCallback(
    (frames = 1) => {
      if (measureFrameRef.current !== null) {
        window.cancelAnimationFrame(measureFrameRef.current);
      }

      measure();
      let remainingFrames = frames;
      const runMeasure = () => {
        measure();
        remainingFrames -= 1;
        measureFrameRef.current =
          remainingFrames > 0
            ? window.requestAnimationFrame(runMeasure)
            : null;
      };

      measureFrameRef.current = window.requestAnimationFrame(runMeasure);
    },
    [measure],
  );

  useLayoutEffect(() => {
    measure();
    scheduleMeasure(3);
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const handleDeferredMeasure = () => scheduleMeasure(2);
    const handleViewportSettle = () => scheduleMeasure(3);
    const resizeObserver = new ResizeObserver(handleDeferredMeasure);
    const visualViewport = window.visualViewport;
    resizeObserver.observe(container);
    resizeObserver.observe(content);
    window.addEventListener("resize", handleDeferredMeasure);
    window.addEventListener("orientationchange", handleViewportSettle);
    window.addEventListener("pageshow", handleViewportSettle);
    visualViewport?.addEventListener("resize", handleDeferredMeasure);
    visualViewport?.addEventListener("scroll", handleDeferredMeasure);
    return () => {
      if (measureFrameRef.current !== null) {
        window.cancelAnimationFrame(measureFrameRef.current);
        measureFrameRef.current = null;
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleDeferredMeasure);
      window.removeEventListener("orientationchange", handleViewportSettle);
      window.removeEventListener("pageshow", handleViewportSettle);
      visualViewport?.removeEventListener("resize", handleDeferredMeasure);
      visualViewport?.removeEventListener("scroll", handleDeferredMeasure);
    };
  }, [measure, scheduleMeasure]);

  const scaled = scaleState.scale < 1;
  const wrapperStyle: CSSProperties | undefined = scaled
    ? { height: Math.ceil(scaleState.contentHeight * scaleState.scale) }
    : undefined;
  const frameStyle = wrapperStyle ? { ...style, ...wrapperStyle } : style;
  const contentStyle: CSSProperties = {
    minWidth: minWidth > 0 ? `${minWidth}px` : undefined,
    transform: scaled ? `scale(${scaleState.scale})` : undefined,
    transformOrigin: "top left",
  };
  const readability =
    scaled && scaleState.scale < minReadableScale ? "too-small" : "ok";

  return (
    <div
      ref={containerRef}
      data-testid={dataTestId}
      data-scale-to-fit={scaled ? "scaled" : "natural"}
      data-readability={readability}
      className={cn("relative max-w-full overflow-hidden", className)}
      style={frameStyle}
      {...frameProps}
    >
      <div
        ref={contentRef}
        className={cn(
          "origin-top-left",
          scaled && "absolute left-0 top-0",
          contentClassName,
        )}
        style={contentStyle}
      >
        {children}
      </div>
    </div>
  );
}

type ScaledToolbarProps = {
  children: ReactNode;
  minWidth?: number;
  minReadableScale?: number;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  "data-testid"?: string;
};

export function ScaledToolbar({
  children,
  minWidth = 0,
  minReadableScale = 0.72,
  className,
  contentClassName,
  disabled,
  "data-testid": dataTestId,
}: ScaledToolbarProps) {
  return (
    <ScaleToFitFrame
      minWidth={minWidth}
      minReadableScale={minReadableScale}
      className={className}
      contentClassName={cn(
        "flex w-max max-w-none flex-nowrap items-center gap-2",
        contentClassName,
      )}
      disabled={disabled}
      data-testid={dataTestId}
    >
      {children}
    </ScaleToFitFrame>
  );
}

type ScaledTableProps = TableHTMLAttributes<HTMLTableElement> & {
  minWidth: number;
  minReadableScale?: number;
  wrapperClassName?: string;
};

export function ScaledTable({
  minWidth,
  minReadableScale = 0.6,
  wrapperClassName,
  className,
  style,
  children,
  ...props
}: ScaledTableProps) {
  return (
    <ScaleToFitFrame
      minWidth={minWidth}
      minReadableScale={minReadableScale}
      className={wrapperClassName}
      contentClassName="max-w-none"
    >
      <table
        className={cn("w-full", className)}
        style={{
          width: `max(100%, ${minWidth}px)`,
          ...style,
        }}
        {...props}
      >
        {children}
      </table>
    </ScaleToFitFrame>
  );
}

export type { ScaleToFitFrameProps };
