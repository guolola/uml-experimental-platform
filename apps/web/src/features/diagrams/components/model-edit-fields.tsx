// Provides reusable labeled form controls for diagram model editing dialogs.
import { SelectControl } from "../../../shared/ui/select";

export function LabelTextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

export function LabelTextarea({
  label,
  value,
  onChange,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <textarea
        aria-label={label}
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

export function LabelSelect({
  label,
  value,
  options,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  const normalizedOptions = allowEmpty
    ? [{ value: "", label: "无" }, ...options]
    : options;

  return (
    <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <SelectControl
        aria-label={label}
        value={value}
        onValueChange={onChange}
        options={normalizedOptions}
        placeholder="请选择"
        className="h-9 rounded-md text-sm"
      />
    </div>
  );
}

export function LabelCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs text-foreground">
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function enumOptions(options: string[]) {
  return options.map((option) => ({ value: option, label: option }));
}

export function ordinalLabel(index: number, unit: string) {
  return `第 ${index + 1} 个${unit}`;
}

export function editorFieldLabel(ownerLabel: string, fieldLabel: string) {
  return `${ownerLabel}${fieldLabel}`;
}

export function namedActionLabel(action: string, kind: string, name: string) {
  return `${action}${kind}：${name || `未命名${kind}`}`;
}
