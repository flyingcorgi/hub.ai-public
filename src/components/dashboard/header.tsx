'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const VENICE_API_KEY_STORAGE_KEY = "venice-api-key";

interface DashboardHeaderProps {
  query: string;
  onQueryChange: (value: string) => void;
}

export function DashboardHeader({ query, onQueryChange }: DashboardHeaderProps) {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setHasApiKey(Boolean(localStorage.getItem(VENICE_API_KEY_STORAGE_KEY)));
    } catch {
      setHasApiKey(false);
    }
  }, []);

  return (
    <header className="sticky top-0 z-40 flex items-center gap-4 border-b bg-background/80 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:px-10">
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search models…"
          className="pl-9"
        />
      </div>
      <div className="ml-auto">
        <Link href="/settings?tab=api-keys">
          <Badge
            variant={hasApiKey ? "default" : "outline"}
            className="gap-1.5 cursor-pointer"
          >
            <KeyRound className="h-3 w-3" />
            {hasApiKey === null ? "Venice.ai" : hasApiKey ? "API key connected" : "Add API key"}
          </Badge>
        </Link>
      </div>
    </header>
  );
}
