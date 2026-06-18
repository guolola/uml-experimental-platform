// Renders DOCX style controls for generated requirement/design instruction documents.
import type {
  DocumentLineSpacing,
  DocumentParagraphStyle,
  DocumentStyleSettings,
} from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui/dialog";
import { Input } from "../../../shared/ui/input";
import { Label } from "../../../shared/ui/label";
import { ScaleToFitFrame } from "../../../shared/ui/scale-to-fit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../shared/ui/select";
import { Switch } from "../../../shared/ui/switch";
import { cloneDefaultDocumentStyle } from "../lib/document-style";

type StyleKey = "heading1" | "heading2" | "heading3" | "body" | "table" | "caption";

type DocumentStyleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DocumentStyleSettings;
  onChange: (value: DocumentStyleSettings) => void;
};

const STYLE_SECTIONS: Array<{ key: StyleKey; label: string }> = [
  { key: "heading1", label: "一级标题" },
  { key: "heading2", label: "二级标题" },
  { key: "heading3", label: "三级标题" },
  { key: "body", label: "正文" },
  { key: "table", label: "表格" },
  { key: "caption", label: "图题" },
];

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function numericValue(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? String(value) : String(fallback);
}

export function DocumentStyleDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: DocumentStyleDialogProps) {
  const updateStyle = (patch: Partial<DocumentStyleSettings>) => {
    onChange({ ...value, ...patch });
  };

  const updateParagraphStyle = (
    key: StyleKey,
    patch: Partial<DocumentParagraphStyle> & { headerBold?: boolean },
  ) => {
    onChange({
      ...value,
      [key]: {
        ...(value[key] ?? {}),
        ...patch,
      },
    });
  };

  const updateLineSpacing = (key: StyleKey, patch: Partial<DocumentLineSpacing>) => {
    const current = value[key]?.lineSpacing ?? { type: "single" as const, value: 1 };
    updateParagraphStyle(key, {
      lineSpacing: {
        ...current,
        ...patch,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>说明书样式</DialogTitle>
          <DialogDescription>
            默认使用课程设计规范，可在生成前调整目录、编号、标题、正文和表格样式。
          </DialogDescription>
        </DialogHeader>

        <ScaleToFitFrame minWidth={720} contentClassName="w-[720px]">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="doc-style-toc">自动添加目录</Label>
              <Switch
                id="doc-style-toc"
                checked={value.includeTableOfContents}
                onCheckedChange={(checked) =>
                  updateStyle({ includeTableOfContents: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="doc-style-numbering">标题自动编号</Label>
              <Switch
                id="doc-style-numbering"
                checked={value.autoNumberHeadings}
                onCheckedChange={(checked) => updateStyle({ autoNumberHeadings: checked })}
              />
            </div>
          </div>

          {STYLE_SECTIONS.map(({ key, label }) => {
            const section = value[key] ?? {};
            const spacing = section.lineSpacing ?? { type: "single" as const, value: 1 };
            return (
              <section key={key} className="grid gap-3 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{label}</h3>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`doc-style-bold-${key}`} className="text-xs">
                      加粗
                    </Label>
                    <Switch
                      id={`doc-style-bold-${key}`}
                      checked={Boolean(section.bold)}
                      onCheckedChange={(checked) =>
                        updateParagraphStyle(key, { bold: checked })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-eastasia-${key}`}>中文字体</Label>
                    <Input
                      id={`doc-style-eastasia-${key}`}
                      value={section.eastAsiaFont ?? ""}
                      onChange={(event) =>
                        updateParagraphStyle(key, {
                          eastAsiaFont: event.currentTarget.value || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-ascii-${key}`}>数字/英文字体</Label>
                    <Input
                      id={`doc-style-ascii-${key}`}
                      value={section.asciiFont ?? ""}
                      onChange={(event) =>
                        updateParagraphStyle(key, {
                          asciiFont: event.currentTarget.value || undefined,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-size-${key}`}>字号 pt</Label>
                    <Input
                      id={`doc-style-size-${key}`}
                      type="number"
                      min={6}
                      max={72}
                      step={0.5}
                      value={numericValue(section.sizePt, key === "heading3" ? 14 : 10.5)}
                      onChange={(event) =>
                        updateParagraphStyle(key, {
                          sizePt: clampNumber(Number(event.currentTarget.value), 6, 72),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="grid gap-1.5">
                    <Label>行距类型</Label>
                    <Select
                      value={spacing.type}
                      onValueChange={(next) =>
                        updateLineSpacing(key, {
                          type: next === "multiple" ? "multiple" : "single",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">单倍</SelectItem>
                        <SelectItem value="multiple">多倍</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-line-${key}`}>行距值</Label>
                    <Input
                      id={`doc-style-line-${key}`}
                      type="number"
                      min={1}
                      max={3}
                      step={0.01}
                      value={numericValue(spacing.value, 1)}
                      onChange={(event) =>
                        updateLineSpacing(key, {
                          value: clampNumber(Number(event.currentTarget.value), 1, 3),
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-before-${key}`}>段前 pt</Label>
                    <Input
                      id={`doc-style-before-${key}`}
                      type="number"
                      min={0}
                      max={72}
                      step={0.5}
                      value={numericValue(section.spacingBeforePt, 0)}
                      onChange={(event) =>
                        updateParagraphStyle(key, {
                          spacingBeforePt: clampNumber(Number(event.currentTarget.value), 0, 72),
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`doc-style-after-${key}`}>段后 pt</Label>
                    <Input
                      id={`doc-style-after-${key}`}
                      type="number"
                      min={0}
                      max={72}
                      step={0.5}
                      value={numericValue(section.spacingAfterPt, 0)}
                      onChange={(event) =>
                        updateParagraphStyle(key, {
                          spacingAfterPt: clampNumber(Number(event.currentTarget.value), 0, 72),
                        })
                      }
                    />
                  </div>
                </div>

                {key === "body" && (
                  <div className="grid w-48 gap-1.5">
                    <Label htmlFor="doc-style-body-indent">首行缩进字符</Label>
                    <Input
                      id="doc-style-body-indent"
                      type="number"
                      min={0}
                      max={4}
                      step={0.5}
                      value={numericValue(section.firstLineIndentChars, 2)}
                      onChange={(event) =>
                        updateParagraphStyle("body", {
                          firstLineIndentChars: clampNumber(
                            Number(event.currentTarget.value),
                            0,
                            4,
                          ),
                        })
                      }
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>
        </ScaleToFitFrame>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(cloneDefaultDocumentStyle())}
          >
            恢复课程设计规范
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
