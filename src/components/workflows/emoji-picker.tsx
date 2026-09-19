'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Smile } from "lucide-react";

// Plain unicode emoji — no assets, no dependency; canvas and every browser already render these
// in full native color via fillText, regardless of the text box's own fill color/gradient.
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: "Faces", emojis: ["😀", "😂", "🥰", "😍", "😘", "😜", "🤪", "😎", "🥳", "😭", "🥺", "😡", "🤔", "😴", "🤗", "😇"] },
  { label: "Love", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💕", "💞", "💗", "💓", "💖", "💘", "💝"] },
  { label: "Hands", emojis: ["👍", "👎", "👋", "🙌", "👏", "🙏", "💪", "✌️", "🤞", "🤟", "🤘", "👉", "👈", "👆", "👇", "🤙"] },
  { label: "Sparkle", emojis: ["✨", "⭐", "🌟", "💫", "🔥", "💯", "⚡", "🌈", "☀️", "🌙", "💥", "🎉", "🎊", "🎀", "💎", "🌸"] },
  { label: "Playful", emojis: ["💋", "👑", "😈", "💀", "👻", "🦋", "🌹", "🍑", "🍒", "💦", "😏", "🙈", "💅", "👅", "🍭", "🎀"] },
];

export function EmojiPickerButton({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1">
          <Smile className="h-3.5 w-3.5" />
          Add emoji
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add an emoji</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-xs text-muted-foreground mb-1">{group.label}</p>
              <div className="grid grid-cols-8 gap-1">
                {group.emojis.map((emoji, i) => (
                  <button
                    key={`${emoji}-${i}`}
                    type="button"
                    className="rounded py-1.5 text-xl leading-none hover:bg-accent"
                    onClick={() => {
                      onPick(emoji);
                      setOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
