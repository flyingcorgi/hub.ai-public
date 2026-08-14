'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { DeleteConfirmButton } from "@/components/delete-confirm-button";
import { createEmptyGrid, DEFAULT_COLS, DEFAULT_ROWS, loadGrid, saveGrid } from "@/lib/spreadsheet-store";
import { Plus, Trash2 } from "lucide-react";

// Keeps a paste of a genuinely huge block of text from rendering tens of thousands of <input>s
// and locking up the tab — generous enough for any realistic "dump some data in" use case.
const MAX_ROWS = 1000;
const MAX_COLS = 52;

function columnLabel(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function SpreadsheetBuilder() {
  const { toast } = useToast();
  const [grid, setGrid] = useState<string[][]>(() => createEmptyGrid());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    loadGrid()
      .then(setGrid)
      .catch((error) => console.error("Failed to load saved spreadsheet:", error))
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveGrid(grid).catch((error) => console.error("Failed to persist spreadsheet:", error));
  }, [grid, hydrated]);

  const rowCount = grid.length;
  const colCount = grid[0]?.length ?? 0;

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    setGrid((prev) => prev.map((row, r) => (r === rowIdx ? row.map((cell, c) => (c === colIdx ? value : cell)) : row)));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n") && !text.includes("\t")) return; // single value — let default paste behavior handle it

    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n");
    // A copy from Sheets/Excel ends with a trailing newline — drop the resulting empty last row.
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    const pastedRows = lines.map((line) => line.split("\t"));

    const neededRows = Math.min(rowIdx + pastedRows.length, MAX_ROWS);
    const neededCols = Math.min(rowIdx < MAX_ROWS ? colIdx + Math.max(...pastedRows.map((r) => r.length)) : 0, MAX_COLS);
    const truncated =
      rowIdx + pastedRows.length > MAX_ROWS || colIdx + Math.max(...pastedRows.map((r) => r.length)) > MAX_COLS;

    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      while (next.length < neededRows) {
        next.push(Array.from({ length: Math.max(colCount, neededCols) }, () => ""));
      }
      if (neededCols > (next[0]?.length ?? 0)) {
        for (const row of next) {
          while (row.length < neededCols) row.push("");
        }
      }
      pastedRows.forEach((cells, ri) => {
        const targetRow = rowIdx + ri;
        if (targetRow >= MAX_ROWS) return;
        cells.forEach((value, ci) => {
          const targetCol = colIdx + ci;
          if (targetCol >= MAX_COLS) return;
          next[targetRow][targetCol] = value;
        });
      });
      return next;
    });

    if (truncated) {
      toast({
        title: "Pasted data was trimmed",
        description: `The spreadsheet is capped at ${MAX_ROWS} rows × ${MAX_COLS} columns.`,
      });
    }
  };

  const addRow = () => {
    setGrid((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, Array.from({ length: colCount || DEFAULT_COLS }, () => "")]));
  };

  const addColumn = () => {
    setGrid((prev) => (colCount >= MAX_COLS ? prev : prev.map((row) => [...row, ""])));
  };

  const removeRow = (rowIdx: number) => {
    setGrid((prev) => prev.filter((_, r) => r !== rowIdx));
  };

  const removeColumn = (colIdx: number) => {
    setGrid((prev) => prev.map((row) => row.filter((_, c) => c !== colIdx)));
  };

  const clearAll = () => {
    setGrid(createEmptyGrid(DEFAULT_ROWS, DEFAULT_COLS));
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Spreadsheet</CardTitle>
          <CardDescription>
            A scratch grid for dumping data into — paste straight from Excel/Sheets/a CSV and it
            splits across cells automatically, or just type into individual cells.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />
            Add row
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addColumn}>
            <Plus className="h-3.5 w-3.5" />
            Add column
          </Button>
          <DeleteConfirmButton label="Clear all cells" onConfirm={clearAll} />
        </CardContent>
      </Card>

      <Card className="p-0">
        <div className="h-[calc(100vh-16rem)] overflow-auto rounded-xl">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 w-10 border-b border-r bg-muted/80 backdrop-blur" />
                {Array.from({ length: colCount }).map((_, colIdx) => (
                  <th
                    key={colIdx}
                    className="group sticky top-0 z-10 min-w-[8rem] border-b border-r bg-muted/80 px-2 py-1 text-left text-xs font-semibold text-muted-foreground backdrop-blur"
                  >
                    <div className="flex items-center justify-between gap-1">
                      {columnLabel(colIdx)}
                      <button
                        type="button"
                        title="Remove column"
                        onClick={() => removeColumn(colIdx)}
                        className="hidden text-muted-foreground hover:text-red-500 group-hover:block"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, rowIdx) => (
                <tr key={rowIdx} className="group">
                  <th className="sticky left-0 z-10 w-10 border-b border-r bg-muted/80 px-2 py-1 text-left text-xs font-semibold text-muted-foreground backdrop-blur">
                    <div className="flex items-center justify-between gap-1">
                      {rowIdx + 1}
                      <button
                        type="button"
                        title="Remove row"
                        onClick={() => removeRow(rowIdx)}
                        className="hidden text-muted-foreground hover:text-red-500 group-hover:block"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                  {row.map((cell, colIdx) => (
                    <td key={colIdx} className="border-b border-r p-0">
                      <input
                        value={cell}
                        onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                        onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                        className="h-8 w-full min-w-[8rem] bg-transparent px-2 text-sm outline-none focus:relative focus:z-10 focus:ring-1 focus:ring-inset focus:ring-primary"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
