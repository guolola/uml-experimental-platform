// Hosts the legacy standalone global settings dialog around the reusable settings panel.
import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../shared/ui/dialog";
import { ScaleToFitFrame } from "../../../shared/ui/scale-to-fit";
import { GlobalSettingsPanel } from "./global-settings-panel";

type SettingsDialogProps = {
  onNavigate?: (route: string) => void;
};

export function SettingsDialog({ onNavigate }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-transparent text-muted-foreground shadow-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5"
          title="全局设置"
          aria-label="全局设置"
        >
          <Settings className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[88vh] overflow-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <ScaleToFitFrame minWidth={640} contentClassName="w-[640px]">
          <GlobalSettingsPanel
            active={open}
            onNavigate={(route) => {
              setOpen(false);
              onNavigate?.(route);
            }}
            onSaved={() => setOpen(false)}
          />
        </ScaleToFitFrame>
      </DialogContent>
    </Dialog>
  );
}
