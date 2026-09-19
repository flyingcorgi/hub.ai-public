'use client';

import Link from "next/link";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-pink-500/50 via-fuchsia-500/30 to-transparent",
  "from-rose-500/50 via-pink-500/25 to-transparent",
  "from-fuchsia-500/50 via-pink-400/25 to-transparent",
  "from-pink-400/50 via-rose-500/30 to-transparent",
];

interface ToolCardProps {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  index?: number;
}

export function ToolCard({ href, title, subtitle, icon: Icon, index = 0 }: ToolCardProps) {
  const gradient = GRADIENTS[index % GRADIENTS.length];

  return (
    <Link href={href} className="group block">
      <div
        className={cn(
          "relative aspect-video overflow-hidden rounded-2xl border bg-gradient-to-br",
          gradient
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.35),transparent_60%)] transition-opacity duration-300 group-hover:opacity-80" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.15] [background-image:radial-gradient(hsl(var(--primary))_1px,transparent_1px)] [background-size:16px_16px]"
        />
        <Icon className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-foreground/40 transition-transform duration-300 group-hover:scale-110 group-hover:text-primary" />

        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/30 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg">
            <Play className="h-3 w-3 fill-current" />
            Generate
          </span>
        </div>
      </div>

      <div className="mt-2.5 space-y-0.5">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </Link>
  );
}
