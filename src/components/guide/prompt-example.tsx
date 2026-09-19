import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

// A single labeled prompt snippet — used in pairs (weak vs. strong) to show, not just tell.
export function PromptExample({ kind, children }: { kind: "good" | "bad"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border p-3 text-sm",
        kind === "good" ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"
      )}
    >
      {kind === "good" ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
      ) : (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      )}
      <code className="leading-relaxed text-foreground/90">{children}</code>
    </div>
  );
}

export function TokenExample({ token, children }: { token: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 text-sm">
      <code className="shrink-0 rounded bg-primary/15 px-2 py-1 font-mono text-xs text-primary">{token}</code>
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}
