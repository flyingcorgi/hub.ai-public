'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Shared shape between ArticleFormatTemplate and BriefFormatTemplate — this dialog doesn't care
// which kind it's editing, only the copy passed in via props differs.
export interface InstructionTemplate {
  id: string;
  label: string;
  instructions: string;
  category?: string;
}

export function InstructionTemplateDialog({
  open,
  onOpenChange,
  initial,
  categories,
  onSave,
  noun = "format",
  namePlaceholder = "e.g. YouTube Script",
  instructionsPlaceholder = "Write your own instructions here — whatever structure, tone, or length you want the AI to follow. Nothing is imposed for you.",
  datalistId = "instruction-template-categories",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: InstructionTemplate | null;
  categories: string[];
  onSave: (data: Omit<InstructionTemplate, "id">, id?: string) => void;
  /** e.g. "article format" or "brief format" — used in dialog copy. */
  noun?: string;
  namePlaceholder?: string;
  instructionsPlaceholder?: string;
  datalistId?: string;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setCategory(initial?.category ?? "");
    setInstructions(initial?.instructions ?? "");
  }, [open, initial]);

  const handleSubmit = () => {
    if (!label.trim() || !instructions.trim()) return;
    onSave(
      {
        label: label.trim(),
        instructions,
        ...(category.trim() ? { category: category.trim() } : {}),
      },
      initial?.id
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? `Edit ${noun}` : `New ${noun}`}</DialogTitle>
          <DialogDescription>
            Your own instructions, entirely up to you — nothing is imposed. Saved so you can reuse
            it across topics.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-sm">Name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={namePlaceholder} />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="optional"
              list={datalistId}
            />
            <datalist id={datalistId}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Instructions</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-[160px]"
              placeholder={instructionsPlaceholder}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!label.trim() || !instructions.trim()}>
            {initial ? "Save changes" : `Create ${noun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
