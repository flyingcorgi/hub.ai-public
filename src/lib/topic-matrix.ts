import { TopicMatrixRow } from "@/lib/topic-designer-store";

export const DEFAULT_MATRIX_SCHEMA = [
  "Video Title",
  "Core Niche",
  "Scenario",
  "Twist",
  "Setting",
  "Roleplay",
];

const MATRIX_SCHEMA_STORAGE_KEY = "topic-designer-matrix-schema";

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function loadMatrixSchema(): string[] {
  try {
    const raw = localStorage.getItem(MATRIX_SCHEMA_STORAGE_KEY);
    if (!raw) return DEFAULT_MATRIX_SCHEMA;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 && parsed.every((c) => typeof c === "string")
      ? parsed
      : DEFAULT_MATRIX_SCHEMA;
  } catch (error) {
    console.error("Failed to parse saved matrix schema:", error);
    return DEFAULT_MATRIX_SCHEMA;
  }
}

export function persistMatrixSchema(schema: string[]) {
  try {
    localStorage.setItem(MATRIX_SCHEMA_STORAGE_KEY, JSON.stringify(schema));
  } catch (error) {
    console.error("Failed to save matrix schema:", error);
  }
}

function splitRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.includes("|")) {
    return trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }
  if (trimmed.includes("\t")) {
    return trimmed.split("\t").map((cell) => cell.trim());
  }
  return null;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function isHeaderRow(cells: string[], schema: string[]): boolean {
  if (cells.length < schema.length) return false;
  const targets = schema.map(normalizeLabel);
  return targets.every((target, i) => normalizeLabel(cells[i]) === target);
}

// Parses a table matching the current column schema (markdown-pipe or tab-delimited) out of an
// assistant chat message. Scans line by line and looks for the header row rather than requiring
// the whole message to be a table, since Kimi sometimes wraps the table in commentary.
export function parseTopicMatrix(text: string, schema: string[]): TopicMatrixRow[] | null {
  if (schema.length === 0) return null;
  const lines = text.split("\n");
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells && isHeaderRow(cells, schema)) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return null;

  const rows: TopicMatrixRow[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (!cells) break;
    if (isSeparatorRow(cells)) continue;
    if (cells.length < schema.length) break;
    const row: TopicMatrixRow = {};
    schema.forEach((label, i) => {
      row[label] = cells[i];
    });
    rows.push(row);
  }
  return rows.length > 0 ? rows : null;
}

export function matrixRowsToTsv(rows: TopicMatrixRow[], schema: string[]): string {
  const header = schema.join("\t");
  const body = rows.map((row) => schema.map((label) => row[label] ?? "").join("\t")).join("\n");
  return `${header}\n${body}`;
}
