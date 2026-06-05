// Keeps graph edge labels compact while preserving the full relationship wording.
const DEFAULT_LABEL_MAX_LENGTH = 18;
const LONG_LABEL_MIN_LENGTH = 24;
const LONG_TEXT_SEPARATORS = /[|｜；;。]/;
const SEGMENT_SPLIT = /\s*(?:[|｜；;。]|，|,)\s*/u;

export function compactDiagramText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim()
    : "";
}

function trimTrailingPunctuation(value: string) {
  return value.replace(/[，,。；;：:\s]+$/u, "").trim();
}

function truncateLabel(value: string, maxLength: number) {
  const compacted = trimTrailingPunctuation(value);
  if (compacted.length <= maxLength) return compacted;
  return `${trimTrailingPunctuation(compacted.slice(0, Math.max(1, maxLength - 1)))}…`;
}

export function shortDiagramLabel(value: unknown, maxLength = DEFAULT_LABEL_MAX_LENGTH) {
  const text = compactDiagramText(value);
  if (!text) return "";

  const segment = text
    .split(SEGMENT_SPLIT)
    .map(trimTrailingPunctuation)
    .find(Boolean);
  return truncateLabel(segment || text, maxLength);
}

export function shouldMoveLongDiagramText(value: unknown, maxLength = DEFAULT_LABEL_MAX_LENGTH) {
  const text = compactDiagramText(value);
  if (!text) return false;
  return text.length > LONG_LABEL_MIN_LENGTH || text.length > maxLength || LONG_TEXT_SEPARATORS.test(text);
}

export function mergeDescription(existing: unknown, addition: string) {
  const existingText = compactDiagramText(existing);
  const additionText = compactDiagramText(addition);
  if (!additionText) return existingText || undefined;
  if (!existingText) return additionText;
  if (existingText.includes(additionText)) return existingText;
  return `${existingText}\n${additionText}`;
}

export function normalizeLongDiagramTextField(
  record: Record<string, unknown>,
  key: string,
  maxLength = DEFAULT_LABEL_MAX_LENGTH,
) {
  const value = compactDiagramText(record[key]);
  if (!value || !shouldMoveLongDiagramText(value, maxLength)) {
    if (value) record[key] = value;
    return record;
  }

  record[key] = shortDiagramLabel(value, maxLength);
  record.description = mergeDescription(record.description, value);
  return record;
}
