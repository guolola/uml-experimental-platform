// Renders the reusable automatic/manual project background selector.
import { useState } from "react";
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import { Check, Images } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { cn } from "../../../shared/ui/utils";
import {
  PROJECT_BACKGROUND_OPTIONS,
  resolveProjectBackground,
} from "../lib/project-backgrounds";

type ProjectBackgroundPickerProps = {
  name: string;
  value: ProjectBackgroundKey | null;
  onChange: (value: ProjectBackgroundKey | null) => void;
  disabled?: boolean;
};

export function ProjectBackgroundPicker({
  name,
  value,
  onChange,
  disabled = false,
}: ProjectBackgroundPickerProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const selectedBackground = resolveProjectBackground({ name, backgroundKey: value });

  const selectBackground = (backgroundKey: ProjectBackgroundKey | null) => {
    onChange(backgroundKey);
    setGalleryOpen(false);
  };

  return (
    <div className="grid gap-3">
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="relative aspect-[16/7] min-h-28 overflow-hidden">
          <img
            data-testid="project-background-preview-image"
            src={selectedBackground.imageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/92 via-background/58 to-background/16" />
          <div className="absolute inset-x-4 bottom-4">
            <span className="text-sm font-semibold text-foreground">
              {selectedBackground.label}
            </span>
          </div>
          <Button
            type="button"
            size="default"
            variant="default"
            disabled={disabled}
            className="absolute left-1/2 top-1/2 border border-primary/20 shadow-lg shadow-primary/30 -translate-x-1/2 -translate-y-1/2"
            onClick={() => setGalleryOpen(true)}
          >
            <Images className="size-3.5" />
            选择背景图
          </Button>
        </div>
      </div>
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-h-[86vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>选择项目背景图</DialogTitle>
            <DialogDescription>
              选择后会保存为项目背景；也可以恢复自动匹配。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 overflow-hidden">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 p-3">
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                当前：{selectedBackground.label}
              </span>
              <Button
                type="button"
                size="sm"
                variant={value === null ? "secondary" : "outline"}
                aria-pressed={value === null}
                onClick={() => selectBackground(null)}
              >
                自动匹配
              </Button>
            </div>
            <div
              data-testid="project-background-gallery"
              role="listbox"
              aria-label="项目背景图"
              className="grid max-h-[56vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3"
            >
              {PROJECT_BACKGROUND_OPTIONS.map((background) => {
                const selected = value === background.key;
                return (
                  <button
                    key={background.key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "group relative min-h-24 overflow-hidden rounded-md border text-left outline-none transition-[border-color,box-shadow,opacity] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35",
                      selected ? "border-primary shadow-sm" : "border-border/70 hover:border-primary/50",
                    )}
                    onClick={() => selectBackground(background.key)}
                  >
                    <img
                      src={background.imageUrl}
                      alt=""
                      className="absolute inset-0 size-full object-cover transition-transform group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                    <span className="absolute inset-0 bg-gradient-to-t from-background/92 via-background/35 to-transparent" />
                    <span className="relative flex h-full min-h-24 items-end justify-between gap-2 p-2">
                      <span className="line-clamp-2 min-w-0 text-[11px] font-medium leading-4 text-foreground">
                        {background.label}
                      </span>
                      {selected && (
                        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3" />
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
