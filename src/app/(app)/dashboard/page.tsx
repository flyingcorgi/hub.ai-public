'use client';

import { useMemo, useState, useEffect } from "react";
import { ImagePlus, Wand2, Clapperboard, Film, Sparkles, Heart, Crown, Swords, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard/header";
import { ToolCard } from "@/components/dashboard/tool-card";
import { WorkflowCard } from "@/components/dashboard/workflow-card";
import { modelNavGroups, modelById, modelHref } from "@/lib/models/nav-groups";
import { loadWorkflowSummaries, WORKFLOWS_CHANGED_EVENT } from "@/lib/workflows/designer-store";
import type { WorkflowSummary } from "@/lib/workflows/designer-types";

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Text to Image": ImagePlus,
  "Image to Image": Wand2,
  "Text to Video": Clapperboard,
  "Image to Video": Film,
};

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; description: string }> = {
  feminization: { label: "Feminization", icon: Heart, description: "Physical transformation — body, outfit, makeup, hair & more" },
  "sissy-lifestyle": { label: "Sissy Lifestyle", icon: Crown, description: "Daily sissy life — fashion, training, captioning & habits" },
  femdom: { label: "Femdom", icon: Swords, description: "Dominance & submission — BDSM, chastity, humiliation, pet play" },
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  // Public summaries only; never prefetch protected definitions or reference bytes.
  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogFailed(false);
    loadWorkflowSummaries(false, controller.signal)
      .then((definitions) => {
        if (!controller.signal.aborted) setWorkflows(definitions);
      })
      .catch(() => {
        if (!controller.signal.aborted) { setCatalogFailed(true); setWorkflows([]); }
      })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    const refresh = () => setRetry((n) => n + 1);
    window.addEventListener(WORKFLOWS_CHANGED_EVENT, refresh);
    return () => {
      controller.abort();
      window.removeEventListener(WORKFLOWS_CHANGED_EVENT, refresh);
    };
  }, [retry]);

  // Filter workflows by the search query.
  const filteredWorkflows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workflows;
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q) ||
        (w.category ?? "").toLowerCase().includes(q)
    );
  }, [workflows, query]);

  // Group filtered workflows by category.
  const groupedWorkflows = useMemo(() => {
    const grouped: Record<string, WorkflowSummary[]> = {};
    for (const w of filteredWorkflows) {
      const cat = w.category ?? "";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(w);
    }
    return grouped;
  }, [filteredWorkflows]);

  // Order of categories to display, plus "uncategorized" at the end.
  const knownCategories = ["feminization", "sissy-lifestyle", "femdom"];
  const categoryOrder = [...knownCategories, ...Object.keys(groupedWorkflows).filter((cat) => cat && !knownCategories.includes(cat)), ""];

  // Filter model groups by search query (existing behavior).
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return modelNavGroups
      .map((group) => ({
        ...group,
        modelIds: group.modelIds.filter((id) => {
          const model = modelById.get(id);
          if (!model) return false;
          if (!q) return true;
          return model.name.toLowerCase().includes(q) || group.label.toLowerCase().includes(q);
        }),
      }))
      .filter((group) => group.modelIds.length > 0);
  }, [query]);

  // Only show model sections when not filtering by workflow-related terms.
  const showModels = !query || groups.length > 0;

  const totalModelCount = useMemo(
    () => modelNavGroups.reduce((sum, group) => sum + group.modelIds.length, 0),
    []
  );

  return (
    <>
      <DashboardHeader query={query} onQueryChange={setQuery} />

      <main className="space-y-10 px-4 py-6 sm:px-6 lg:px-10">
        {/* Hero section */}
        <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/15 via-fuchsia-500/10 to-transparent px-8 py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/30 blur-3xl"
          />
          <div className="relative max-w-2xl space-y-3">
            <h1 className="text-3xl font-bold sm:text-4xl">
              <span className="bg-gradient-to-r from-pink-400 to-fuchsia-500 bg-clip-text text-transparent">
                Guided Workflows
              </span>
              {" "}&amp; AI Models
            </h1>
            <p className="text-muted-foreground">
              Start with a guided workflow or choose a model directly. Free workflows and models need no FetishUI membership; premium workflows require current account access.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href="#workflows"
                className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-background"
              >
                <Wand2 className="h-3.5 w-3.5 text-primary" />
                Workflows
                <span className="text-muted-foreground">{catalogLoading ? '…' : catalogFailed ? '—' : workflows.length}</span>
              </a>
              <a
                href="#models"
                className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-background"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                All Models
                <span className="text-muted-foreground">{totalModelCount}</span>
              </a>
            </div>
          </div>
        </section>

        <section aria-label="How to get started" className="rounded-xl border bg-muted/20 p-5 space-y-3">
          <h2 className="font-semibold">Your first generation</h2>
          <ol className="grid gap-3 text-sm sm:grid-cols-3">
            <li><strong>1. Choose a tool</strong><p className="text-muted-foreground">Try a free workflow below, or pick a model.</p></li>
            <li><strong>2. Add your Venice key</strong><p className="text-muted-foreground">Set it up inside the tool without leaving your inputs. Venice usage is billed separately.</p></li>
            <li><strong>3. Generate and save</strong><p className="text-muted-foreground">Download your result or save it to an album in this browser. Export backups for safekeeping.</p></li>
          </ol>
          <Link href="/guide" className="inline-block text-sm text-primary underline underline-offset-4">Read the getting-started guide</Link>
        </section>

        {catalogLoading && <p role="status" className="text-sm text-muted-foreground">Loading workflows…</p>}
        {catalogFailed && (
          <div role="alert" className="rounded-lg border p-4 space-y-2">
            <p className="text-sm">The workflow catalog is temporarily unavailable. You can still use the models below.</p>
            <Button variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}>Retry catalog</Button>
          </div>
        )}

        {/* Workflows section — grouped by category */}
        {!catalogLoading && filteredWorkflows.length > 0 && (
          <section id="workflows" className="scroll-mt-20 space-y-10">
            {categoryOrder
              .filter((cat) => (groupedWorkflows[cat]?.length ?? 0) > 0)
              .map((cat) => {
                const meta = CATEGORY_META[cat];
                const items = groupedWorkflows[cat];
                const Icon = meta?.icon ?? Sparkles;
                return (
                  <section key={cat} className="space-y-4">
                    <h2 className="flex flex-wrap items-center gap-2 border-b pb-2 text-xl font-semibold">
                      <Icon className="h-5 w-5 text-primary" />
                      {meta?.label ?? (cat || "Other workflows")}
                      <span className="text-xs font-normal text-muted-foreground">
                        {meta?.description ?? "Other workflows"}
                      </span>
                    </h2>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {items.map((w, i) => (
                        <WorkflowCard
                          key={w.id}
                          id={w.id}
                          name={w.name}
                          description={w.description}
                          category={w.category}
                          free={w.free === true}
                          index={i}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
          </section>
        )}

        {!catalogLoading && !catalogFailed && workflows.length === 0 && !query && (
          <p role="status" className="text-center text-sm text-muted-foreground">No published workflows yet. Try a model below to get started.</p>
        )}

        {!catalogLoading && !catalogFailed && filteredWorkflows.length === 0 && query && groups.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Nothing matches &quot;{query}&quot;.
          </p>
        )}

        {/* Model generation sections (existing) */}
        {showModels && groups.length > 0 && (
          <section id="models" className="scroll-mt-20 space-y-10">
            <h2 className="flex items-center gap-2 border-b pb-2 text-xl font-semibold">
              <LayoutGrid className="h-5 w-5 text-primary" />
              All Models
              <span className="text-xs font-normal text-muted-foreground">
                Available Venice.ai models — no membership required; Venice usage billed separately
              </span>
            </h2>
            {groups.map((group, groupIndex) => {
              const Icon = GROUP_ICONS[group.label] ?? ImagePlus;
              return (
                <section key={group.label} className="space-y-4">
                  <h2 className="flex items-center gap-2 border-b pb-2 text-xl font-semibold">
                    <Icon className="h-5 w-5 text-primary" />
                    {group.label}
                  </h2>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {group.modelIds.map((modelId, index) => {
                      const model = modelById.get(modelId);
                      if (!model) return null;
                      return (
                        <ToolCard
                          key={modelId}
                          href={modelHref(modelId)}
                          title={model.name}
                          subtitle={model.costEstimate ?? "Venice.ai"}
                          icon={Icon}
                          index={groupIndex + index}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </section>
        )}
      </main>
    </>
  );
}