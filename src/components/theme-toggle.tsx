'use client';

import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

const OPTIONS = [
  { value: "light" as const, icon: Sun, label: "Light" },
  { value: "dark" as const, icon: Moon, label: "Dark" },
  { value: "system" as const, icon: Monitor, label: "Auto" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center rounded-md border p-0.5">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            "h-7 w-7",
            theme === value && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
          )}
          title={label}
          onClick={() => setTheme(value)}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
    </div>
  );
}
