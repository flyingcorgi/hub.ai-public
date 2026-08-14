'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { modelNavGroups, modelById, modelHref } from "@/lib/models/nav-groups";

export function ModelsNavDropdown() {
  const pathname = usePathname();
  const isAnyModelActive = modelNavGroups.some((group) =>
    group.modelIds.map(modelHref).includes(pathname)
  );

  return (
    <div className="relative group">
      <Button
        type="button"
        variant={isAnyModelActive ? "default" : "ghost"}
        className={cn(
          "gap-1 transition-colors",
          isAnyModelActive && "bg-primary text-primary-foreground"
        )}
      >
        Models
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <div
        className="pointer-events-none absolute left-0 top-full z-40 mt-2 hidden rounded-md border bg-popover text-popover-foreground shadow-md group-hover:block group-focus-within:block group-hover:pointer-events-auto"
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:grid-cols-3" style={{ width: "min(90vw, 720px)" }}>
          {modelNavGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              {group.modelIds.map((modelId) => {
                const model = modelById.get(modelId);
                if (!model) return null;
                const href = modelHref(modelId);
                const isActive = pathname === href;
                return (
                  <Button
                    key={modelId}
                    asChild
                    variant="ghost"
                    className={cn(
                      "flex w-full justify-start rounded-none px-2 py-1.5 h-auto text-sm font-normal whitespace-normal text-left",
                      isActive && "bg-accent text-accent-foreground"
                    )}
                  >
                    <Link href={href}>{model.name}</Link>
                  </Button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
