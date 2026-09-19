'use client';

import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-pink-500/40 via-fuchsia-500/20 to-transparent",
  "from-rose-500/40 via-pink-500/20 to-transparent",
  "from-fuchsia-500/40 via-violet-500/20 to-transparent",
  "from-purple-500/40 via-pink-400/20 to-transparent",
  "from-violet-500/40 via-fuchsia-500/20 to-transparent",
  "from-pink-400/40 via-rose-500/20 to-transparent",
];

const CATEGORY_ACCENTS: Record<string, string> = {
  feminization: "from-pink-500/50 via-fuchsia-500/25 to-transparent",
  "sissy-lifestyle": "from-rose-500/50 via-pink-400/20 to-transparent",
  femdom: "from-purple-500/50 via-violet-500/25 to-transparent",
};

interface WorkflowCardProps {
  id: string;
  name: string;
  description: string;
  category?: string;
  free: boolean;
  index?: number;
}

export function WorkflowCard({ id, name, description, category, free, index = 0 }: WorkflowCardProps) {
  const gradient =
    CATEGORY_ACCENTS[category ?? ""] ?? GRADIENTS[index % GRADIENTS.length];

  return (
    <Link href={`/workflows/designer?run=${id}`} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-gradient-to-br",
          gradient
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.30),transparent_60%)] transition-opacity duration-300 group-hover:opacity-80" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(hsl(var(--primary))_1px,transparent_1px)] [background-size:16px_16px]"
        />
        <div className="relative flex flex-col items-start justify-end p-5 min-h-[140px] sm:min-h-[160px]">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary/70" />
            <span className="rounded-full border bg-background/80 px-2 py-0.5 text-xs font-medium">
              {free ? 'Free workflow' : 'Premium workflow'}
            </span>
          </div>
          <h3 className="text-sm font-bold text-foreground leading-snug">{name}</h3>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/30 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg">
            <Play className="h-3 w-3 fill-current" />
            View workflow
          </span>
        </div>
      </div>
    </Link>
  );
}