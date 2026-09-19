"use client";

import { cn } from "@/lib/utils";
import { Trophy, Lock } from "lucide-react";

interface ScoreBarProps {
  score: number;
  punished: boolean;
  punishmentRemainingMs: number;
  punishmentReason: string;
}

export function ScoreBar({ score, punished, punishmentRemainingMs, punishmentReason }: ScoreBarProps) {
  return (
    <div
      className={cn(
        "bg-gradient-to-r border-b px-4 py-3 text-white transition-colors duration-300",
        punished ? "from-red-600 to-rose-700" : "from-pink-500 to-fuchsia-600"
      )}
    >
      <div className="max-w-2xl mx-auto flex items-center gap-2 sm:gap-4 flex-wrap">
        {/* Score — red-tinted pill when negative, so being "in the hole" reads at a glance */}
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1",
            score < 0 ? "bg-black/30" : "bg-white/15"
          )}
        >
          <Trophy className="h-3.5 w-3.5" />
          <span className="font-mono font-bold text-sm">{score.toLocaleString()}</span>
          <span className="text-[10px] opacity-70">points</span>
        </div>

        {/* Punishment countdown — a real consequence Mistress V imposed, not a fixed timer */}
        {punished && (
          <div className="flex items-center gap-1.5 bg-black/30 rounded-full px-3 py-1 animate-pulse ml-auto">
            <Lock className="h-3.5 w-3.5" />
            <span className="font-mono font-bold text-sm">{Math.ceil(punishmentRemainingMs / 1000)}s</span>
            {punishmentReason && (
              <span className="text-[10px] opacity-80 max-w-[16rem] truncate">— {punishmentReason}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
