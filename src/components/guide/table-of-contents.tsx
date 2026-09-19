'use client';

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface TocEntry {
  id: string;
  label: string;
}

// Sticky section nav that highlights whichever section is currently in view — plain anchor links
// would work without JS at all, but on a reference page this long, knowing where you are matters.
export function TableOfContents({ entries }: { entries: TocEntry[] }) {
  const [activeId, setActiveId] = useState(entries[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (observerEntries) => {
        const visible = observerEntries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );

    for (const entry of entries) {
      const el = document.getElementById(entry.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [entries]);

  return (
    <nav className="space-y-1">
      <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">On this page</p>
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`#${entry.id}`}
          className={cn(
            "block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            activeId === entry.id && "bg-accent font-medium text-foreground"
          )}
        >
          {entry.label}
        </a>
      ))}
    </nav>
  );
}
