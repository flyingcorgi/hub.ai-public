"use client";

import { GoonMessage } from "./types";
import { cn } from "@/lib/utils";
import { SaveToAlbumButton } from "@/components/albums/save-to-album-button";

interface GoonChatMessageProps {
  message: GoonMessage;
}

export function GoonChatMessage({ message }: GoonChatMessageProps) {
  const isDomme = message.role === "domme";

  return (
    <div
      className={cn(
        "flex gap-3",
        isDomme ? "justify-start" : "justify-end"
      )}
    >
      {isDomme && (
        <div className="shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-pink-500/20">
          V
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3",
          isDomme
            ? "bg-gradient-to-br from-pink-950/50 to-fuchsia-950/50 border border-pink-500/20 rounded-tl-none"
            : "bg-primary/10 border border-primary/20 rounded-tr-none"
        )}
      >
        {message.type === "image" && message.imageUrl && (
          <div className="mb-2 space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.imageUrl}
              referrerPolicy="no-referrer"
              alt={message.content}
              className="rounded-lg max-h-80 object-contain cursor-pointer hover:opacity-90 transition-opacity block"
              onClick={() => window.open(message.imageUrl, "_blank", "noopener,noreferrer")}
            />
            <SaveToAlbumButton
              imageUrl={message.imageUrl}
              prompt={message.content}
              variant="full"
              className="h-7 text-xs"
            />
          </div>
        )}
        <p
          className={cn(
            "text-sm whitespace-pre-wrap",
            isDomme ? "text-pink-100" : "text-foreground"
          )}
        >
          {message.content}
        </p>
        <span className="text-[10px] text-muted-foreground mt-1 block">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      {!isDomme && (
        <div className="shrink-0 h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold">
          🧎
        </div>
      )}
    </div>
  );
}
