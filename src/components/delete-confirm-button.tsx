'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteConfirmButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Delete?</span>
        <Button type="button" size="sm" variant="destructive" className="h-6 px-2 text-xs" onClick={onConfirm}>
          Yes
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setConfirming(false)}
        >
          No
        </Button>
      </span>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-7 w-7 text-red-500 hover:text-red-500"
      title={label}
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
