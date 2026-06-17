// Provides a lightweight, accessible wrapper around native MP4 playback.
import type { VideoHTMLAttributes } from "react";
import { Film, Info } from "lucide-react";
import { cn } from "./utils";

type VideoPlayerProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src?: string;
  title: string;
  description?: string;
  caption?: string;
  className?: string;
  mediaClassName?: string;
};

export function VideoPlayer({
  src,
  title,
  description,
  caption,
  className,
  mediaClassName,
  ...props
}: VideoPlayerProps) {
  const videoSrc = src?.trim();

  return (
    <figure
      data-testid="video-player"
      className={cn("overflow-hidden rounded-lg border border-border bg-background", className)}
    >
      <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
        {videoSrc ? (
          <video
            aria-label={title}
            className={cn("h-full w-full bg-black object-contain", mediaClassName)}
            controls
            playsInline
            preload="metadata"
            {...props}
          >
            <source src={videoSrc} type="video/mp4" />
            你的浏览器不支持在线播放视频。
          </video>
        ) : (
          <div
            role="status"
            className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
          >
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Film className="size-5" />
            </span>
            <span className="font-medium text-foreground">视频地址未配置</span>
            <span className="max-w-md leading-6">
              请检查对应的 VITE 视频 URL 配置，或确认 OSS 文件已提供长期可访问地址。
            </span>
          </div>
        )}
      </div>
      {(caption || description) && (
        <figcaption className="flex items-start gap-2 px-4 py-3 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            {caption}
            {caption && description ? "：" : ""}
            {description}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
