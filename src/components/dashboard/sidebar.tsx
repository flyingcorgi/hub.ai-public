'use client';

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BookOpen, Boxes, Gamepad2, Images, LayoutGrid, ListVideo, Lock, Settings, Sparkles, UserRound, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { loadWorkflowSummaries, WORKFLOWS_CHANGED_EVENT } from "@/lib/workflows/designer-store";
import type { WorkflowSummary } from "@/lib/workflows/designer-types";
import { useAccount } from "@/components/account/account-provider";

// The nav content itself, shared between the always-visible desktop <aside> and the mobile
// slide-over Sheet (see mobile-nav.tsx) so the two never drift out of sync. `onNavigate` lets the
// mobile Sheet close itself when a link is tapped.
//
// useSearchParams() opts this out of static rendering unless wrapped in Suspense (Next.js
// requirement), so the actual export below wraps this in one — see SidebarNavContent.
function SidebarNavContentInner({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customWorkflows, setCustomWorkflows] = useState<WorkflowSummary[]>([]);
  const { account } = useAccount();
  const workflowsUnlocked = account.unlocked;
  const showAdminTools = account.user?.role === "admin" && account.user.emailVerified;

  // /workflows/designer is shared by every custom workflow (distinguished only by ?run=), so
  // usePathname() alone can't tell them apart — without this, saving/opening any custom workflow
  // lit up the generic "Workflow Designer" link instead of that workflow's own entry.
  const activeWorkflowId = pathname === "/workflows/designer" ? searchParams.get("run") : null;

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadWorkflowSummaries()
        .then((definitions) => {
          if (!cancelled) setCustomWorkflows(definitions);
        })
        .catch(() => { if (!cancelled) setCustomWorkflows([]); });
    };
    refresh();
    window.addEventListener(WORKFLOWS_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(WORKFLOWS_CHANGED_EVENT, refresh);
    };
  }, []);

  return (
    <>
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="bg-gradient-to-r from-pink-300 to-pink-500 bg-clip-text text-lg font-bold text-transparent"
        >
          FetishUI
        </Link>
      </div>

      {/* Primary destinations first — the things used every session — ahead of the long
          scrollable Workflows list below, so they're never pushed off-screen by it. */}
      <div className="space-y-1 px-3 pb-2">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100",
            pathname === "/dashboard" && "bg-white/5 text-neutral-100"
          )}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          Dashboard
        </Link>
        <Link
          href="/dashboard#models"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100"
        >
          <Boxes className="h-4 w-4 shrink-0" />
          All Models
        </Link>
        <Link
          href="/profile"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100",
            pathname.startsWith("/profile") && "bg-white/5 text-neutral-100"
          )}
        >
          <Images className="h-4 w-4 shrink-0" />
          Album
        </Link>
        <Link
          href="/queue"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100",
            pathname === "/queue" && "bg-white/5 text-neutral-100"
          )}
        >
          <ListVideo className="h-4 w-4 shrink-0" />
          Queue
        </Link>
        <Link
          href="/goon-game"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100",
            pathname === "/goon-game" && "bg-white/5 text-neutral-100"
          )}
        >
          <Gamepad2 className="h-4 w-4 shrink-0" />
          Goon Game
          <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase">Beta</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto border-t border-white/5 px-3 py-2">
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600">Workflows</p>
          {!workflowsUnlocked && (
            <Link
              href="/unlock"
              onClick={onNavigate}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80"
            >
              <Lock className="h-3 w-3" /> Unlock
            </Link>
          )}
        </div>
        {(() => {
          const grouped: Record<string, WorkflowSummary[]> = {};
          for (const w of customWorkflows) {
            const cat = w.category ?? "";
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(w);
          }
          const catOrder = ["feminization", "sissy-lifestyle", "femdom", ""];
          const catLabels: Record<string, string> = {
            feminization: "Feminization",
            "sissy-lifestyle": "Sissy Lifestyle",
            femdom: "Femdom",
            "": "Other",
          };
          return catOrder
            .filter((cat) => (grouped[cat]?.length ?? 0) > 0)
            .flatMap((cat) => [
              <p
                key={`cat-${cat}`}
                className="px-3 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-600"
              >
                {(catLabels[cat] ?? cat) || "Other"}
              </p>,
              ...grouped[cat].map((definition) => (
                <Link
                  key={definition.id}
                  href={`/workflows/designer?run=${definition.id}`}
                  title={definition.description || undefined}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100",
                    activeWorkflowId === definition.id && "bg-white/5 text-neutral-100"
                  )}
                >
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span className="truncate">{definition.name || "Untitled"}</span>
                </Link>
              )),
            ]);
        })()}

        {showAdminTools && (
          <Link
            href="/workflows/designer"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100",
              pathname === "/workflows/designer" && !activeWorkflowId && "bg-white/5 text-neutral-100"
            )}
          >
            <Wand2 className="h-4 w-4 shrink-0" />
            Workflow Designer
            <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Admin
            </span>
          </Link>
        )}
      </nav>

      <div className="space-y-1 border-t border-white/5 px-3 py-4">
        <Link href="/account" onClick={onNavigate}
          className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 hover:bg-white/5 hover:text-neutral-100", pathname.startsWith("/account") && "bg-white/5 text-neutral-100")}>
          <UserRound className="h-4 w-4 shrink-0" /> {account.user ? "Account" : "Sign in"}
        </Link>
        <Link
          href="/guide"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100",
            pathname === "/guide" && "bg-white/5 text-neutral-100"
          )}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          Guide
        </Link>
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-100",
            pathname === "/settings" && "bg-white/5 text-neutral-100"
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
        <div className="flex items-center justify-between px-3 pt-2">
          <span className="text-xs text-neutral-500">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </>
  );
}

export function SidebarNavContent(props: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={null}>
      <SidebarNavContentInner {...props} />
    </Suspense>
  );
}

export function DashboardSidebar() {
  return (
    <aside className="dark sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-[#0b0b0d] text-neutral-200 md:flex">
      <SidebarNavContent />
    </aside>
  );
}
